"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { evaluarCierre } from "@/lib/business/cierre";
import { dedupConsolidadoFarmacia } from "@/lib/business/email-keys";

// ─────────────────────────────────────────────────────────────
// confirmarCargasERP — Server Action del área de Precios (Módulo 3).
//
// Marca ítems aprobados como cargados en el ERP (sella fechaCargaERP).
// Por cada solicitud, si TODOS sus aprobados quedaron cargados,
// finaliza el ciclo y encola UN correo consolidado a la farmacia con
// el detalle final (qué se aprobó con qué condición y qué se rechazó),
// marcando mailFarmaciaEnviado para bloquear duplicados.
// ─────────────────────────────────────────────────────────────

const InputSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1, "No seleccionaste ítems."),
});

export type ConfirmarCargasResult =
  | { ok: true; cargados: number; solicitudesFinalizadas: number; correosEncolados: number }
  | { ok: false; error: string };

export async function confirmarCargasERP(
  input: z.infer<typeof InputSchema>,
): Promise<ConfirmarCargasResult> {
  const session = await auth();
  const user = session?.user as { id: string; role?: string; email?: string } | undefined;
  if (!user || (user.role !== "PRECIOS" && user.role !== "ADMIN")) {
    return { ok: false, error: "No autorizado." };
  }

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { itemIds } = parsed.data;

  // Verifica que sean aprobados y aún no cargados (optimistic check).
  const items = await prisma.itemSolicitud.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, estadoDecision: true, cargadoERP: true, solicitudId: true, motivo: true },
  });
  if (items.length !== itemIds.length) {
    return { ok: false, error: "Algunos ítems ya no existen. Refrescá." };
  }
  const invalido = items.find((it) => it.estadoDecision !== "APROBADO" || it.cargadoERP);
  if (invalido) {
    return { ok: false, error: "Algunos ítems ya estaban cargados o no están aprobados. Refrescá." };
  }
  // Los probadores (tester) no pasan por el ERP; se cierran en la vista de Testers.
  const probador = items.find((it) => it.motivo === "PROBADOR");
  if (probador) {
    return { ok: false, error: "Los probadores se gestionan en Testers, no en carga ERP." };
  }

  const ahora = new Date();
  const solicitudIds = [...new Set(items.map((it) => it.solicitudId))];
  let solicitudesFinalizadas = 0;
  let correosEncolados = 0;

  try {
    await prisma.$transaction(async (tx) => {
      // 1) Sella la carga en el ERP.
      await tx.itemSolicitud.updateMany({
        where: { id: { in: itemIds } },
        data: { cargadoERP: true, fechaCargaERP: ahora },
      });
      for (const id of itemIds) {
        await tx.auditLog.create({
          data: {
            entityType: "ItemSolicitud",
            entityId: id,
            action: "CARGAR_ERP",
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
    console.error("[confirmarCargasERP] error:", e);
    return { ok: false, error: "No se pudieron confirmar las cargas. Reintentá." };
  }

  revalidatePath("/precios/dashboard");
  return {
    ok: true,
    cargados: itemIds.length,
    solicitudesFinalizadas,
    correosEncolados,
  };
}
