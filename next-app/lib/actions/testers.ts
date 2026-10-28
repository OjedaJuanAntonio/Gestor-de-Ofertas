"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { evaluarCierre } from "@/lib/business/cierre";
import { dedupConsolidadoFarmacia } from "@/lib/business/email-keys";

// ─────────────────────────────────────────────────────────────
// marcarTesterEnviado — cierre de probadores/tester.
//
// Marca ítems PROBADOR aprobados como "tester enviado" (equivale al
// CHECK_LIST_ENVIADO del flujo de Sheets). Como estos ítems no pasan
// por el ERP, este es su paso de fulfillment: al enviarse el último
// tester de una solicitud, el ciclo puede cerrar y se encola el
// correo consolidado a la farmacia (igual que la carga ERP).
// ─────────────────────────────────────────────────────────────

const InputSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1, "No seleccionaste testers."),
});

export type MarcarTesterResult =
  | { ok: true; enviados: number; solicitudesFinalizadas: number; correosEncolados: number }
  | { ok: false; error: string };

export async function marcarTesterEnviado(
  input: z.infer<typeof InputSchema>,
): Promise<MarcarTesterResult> {
  const session = await auth();
  const user = session?.user as { id: string; role?: string; email?: string } | undefined;
  if (!user || (user.role !== "COMPRADOR" && user.role !== "ADMIN")) {
    return { ok: false, error: "No autorizado." };
  }

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { itemIds } = parsed.data;
  const esAdmin = user.role === "ADMIN";

  const items = await prisma.itemSolicitud.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true,
      motivo: true,
      estadoDecision: true,
      testerEnviado: true,
      compradorId: true,
      solicitudId: true,
    },
  });
  if (items.length !== itemIds.length) {
    return { ok: false, error: "Algunos testers ya no existen. Refrescá." };
  }
  const invalido = items.find(
    (it) =>
      it.motivo !== "PROBADOR" ||
      it.estadoDecision !== "APROBADO" ||
      it.testerEnviado,
  );
  if (invalido) {
    return { ok: false, error: "Algunos ítems no son testers aprobados pendientes. Refrescá." };
  }
  const ajeno = items.find((it) => !esAdmin && it.compradorId !== user.id);
  if (ajeno) return { ok: false, error: "Hay testers que no te corresponden." };

  const ahora = new Date();
  const solicitudIds = [...new Set(items.map((it) => it.solicitudId))];
  let solicitudesFinalizadas = 0;
  let correosEncolados = 0;

  try {
    await prisma.$transaction(async (tx) => {
      // 1) Marca el envío del tester (guardado contra carreras).
      const marcados = await tx.itemSolicitud.updateMany({
        where: {
          id: { in: itemIds },
          motivo: "PROBADOR",
          estadoDecision: "APROBADO",
          testerEnviado: false,
          ...(esAdmin ? {} : { compradorId: user.id }),
        },
        data: { testerEnviado: true, fechaTesterEnviado: ahora },
      });
      if (marcados.count !== itemIds.length) {
        throw new Error("CARRERA");
      }

      for (const it of items) {
        await tx.auditLog.create({
          data: {
            entityType: "ItemSolicitud",
            entityId: it.id,
            action: "ENVIAR_TESTER",
            actorId: user.id,
            actorEmail: user.email ?? null,
          },
        });
      }

      // 2) Evalúa el cierre de cada solicitud afectada.
      for (const solId of solicitudIds) {
        const sol = await tx.solicitud.findUnique({
          where: { id: solId },
          select: {
            id: true,
            codigo: true,
            mailFarmaciaEnviado: true,
            emailFarmaciaHistorico: true,
            nombreFarmaciaHistorico: true,
            items: {
              select: {
                estadoDecision: true,
                cargadoERP: true,
                motivo: true,
                testerEnviado: true,
                cantidad: true,
                codigoBarra: true,
                condicionAutorizada: true,
                motivoRechazo: true,
                articulo: { select: { descripcion: true } },
              },
            },
          },
        });
        if (!sol) continue;

        const cierre = evaluarCierre(sol.items, sol.mailFarmaciaEnviado);
        const data: Prisma.SolicitudUpdateInput = { estado: cierre.estado };

        if (cierre.notificar && cierre.tipo === "CONSOLIDADO") {
          const detalle = sol.items.map((i) => ({
            descripcion: i.articulo.descripcion,
            codigoBarra: i.codigoBarra,
            cantidad: i.cantidad,
            estado: i.estadoDecision,
            condicion: i.condicionAutorizada,
            motivoRechazo: i.motivoRechazo,
          }));
          await tx.emailOutbox.create({
            data: {
              tipo: "CONSOLIDADO_FARMACIA",
              destinatario: sol.emailFarmaciaHistorico,
              asunto: `Resultado de tu solicitud ${sol.codigo}`,
              dedupKey: dedupConsolidadoFarmacia(sol.id),
              payload: {
                solicitudId: sol.id,
                codigo: sol.codigo,
                farmacia: sol.nombreFarmaciaHistorico,
                items: detalle,
              } as Prisma.InputJsonValue,
            },
          });
          data.mailFarmaciaEnviado = true;
          data.mailFarmaciaEnviadoAt = ahora;
          correosEncolados++;
        }

        if (cierre.finalizada) solicitudesFinalizadas++;
        await tx.solicitud.update({ where: { id: sol.id }, data });
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "CARRERA") {
      return { ok: false, error: "Algunos testers ya fueron marcados. Refrescá." };
    }
    console.error("[marcarTesterEnviado] error:", e);
    return { ok: false, error: "No se pudieron marcar los testers. Reintentá." };
  }

  revalidatePath("/comprador/testers");
  return {
    ok: true,
    enviados: itemIds.length,
    solicitudesFinalizadas,
    correosEncolados,
  };
}
