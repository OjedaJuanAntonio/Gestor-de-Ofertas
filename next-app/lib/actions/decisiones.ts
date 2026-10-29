"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { evaluarCierre } from "@/lib/business/cierre";
import { dedupRechazoTotal } from "@/lib/business/email-keys";

// ─────────────────────────────────────────────────────────────
// confirmarDecisiones — Server Action bulk del comprador (Módulo 2).
//
// Aprueba/rechaza ítems en lote. Por cada solicitud afectada
// recalcula el estado agregado y, si quedó 100% rechazada, encola
// la notificación de RECHAZO_TOTAL a la farmacia (corrige el bug
// donde estas solicitudes nunca cerraban). Todo en una transacción.
// ─────────────────────────────────────────────────────────────

// La condición obligatoria al aprobar NO se valida acá: depende del motivo del
// ítem (un PROBADOR/tester no lleva condición comercial), que se conoce recién
// tras leer los ítems de la DB (ver más abajo).
const DecisionSchema = z.object({
  itemId: z.string().min(1),
  decision: z.enum(["APROBADO", "RECHAZADO"]),
  condicion: z.string().optional().default(""),
  motivoRechazo: z.string().optional().default(""),
});

const InputSchema = z.object({
  decisiones: z.array(DecisionSchema).min(1, "No hay decisiones para confirmar."),
});

export type ConfirmarDecisionesResult =
  | { ok: true; actualizados: number; solicitudesCerradas: number; rechazosNotificados: number }
  | { ok: false; error: string };

export async function confirmarDecisiones(
  input: z.infer<typeof InputSchema>,
): Promise<ConfirmarDecisionesResult> {
  const session = await auth();
  const user = session?.user as { id: string; role?: string; email?: string } | undefined;
  if (!user || (user.role !== "COMPRADOR" && user.role !== "ADMIN")) {
    return { ok: false, error: "No autorizado." };
  }

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { decisiones } = parsed.data;
  const ids = decisiones.map((d) => d.itemId);

  // Verifica propiedad + estado PENDIENTE de todos los ítems.
  const items = await prisma.itemSolicitud.findMany({
    where: { id: { in: ids } },
    select: { id: true, compradorId: true, estadoDecision: true, solicitudId: true, motivo: true },
  });
  if (items.length !== ids.length) {
    return { ok: false, error: "Algunos ítems ya no existen. Refrescá la bandeja." };
  }
  const ajeno = items.find(
    (it) => user.role !== "ADMIN" && it.compradorId !== user.id,
  );
  if (ajeno) return { ok: false, error: "Hay ítems que no te corresponden." };
  const yaDecidido = items.find((it) => it.estadoDecision !== "PENDIENTE");
  if (yaDecidido) {
    return { ok: false, error: "Algunos ítems ya fueron decididos. Refrescá la bandeja." };
  }

  // La condición es obligatoria al aprobar, salvo en probadores (tester).
  const motivoById = new Map(items.map((it) => [it.id, it.motivo]));
  const faltaCondicion = decisiones.find(
    (d) =>
      d.decision === "APROBADO" &&
      motivoById.get(d.itemId) !== "PROBADOR" &&
      d.condicion.trim().length === 0,
  );
  if (faltaCondicion) {
    return { ok: false, error: "La condición es obligatoria al aprobar (excepto probadores)." };
  }

  const ahora = new Date();
  const solicitudIds = [...new Set(items.map((it) => it.solicitudId))];
  let rechazosNotificados = 0;
  let solicitudesCerradas = 0;

  try {
    await prisma.$transaction(async (tx) => {
      // 1) Actualiza cada ítem con su decisión + snapshot del aprobador.
      // Guardado contra carreras: solo si el ítem sigue PENDIENTE (cierra la
      // ventana TOCTOU entre la lectura previa y la transacción).
      for (const d of decisiones) {
        const upd = await tx.itemSolicitud.updateMany({
          where: { id: d.itemId, estadoDecision: "PENDIENTE" },
          data: {
            estadoDecision: d.decision,
            condicionAutorizada:
              d.decision === "APROBADO" ? d.condicion.trim() || null : null,
            motivoRechazo:
              d.decision === "RECHAZADO" ? d.motivoRechazo.trim() || null : null,
            aprobadorId: user.id,
            aprobadorMail: user.email ?? null,
            fechaAprobacion: ahora,
          },
        });
        if (upd.count === 0) throw new Error("CARRERA");
        await tx.auditLog.create({
          data: {
            entityType: "ItemSolicitud",
            entityId: d.itemId,
            action: d.decision === "APROBADO" ? "APROBAR" : "RECHAZAR",
            actorId: user.id,
            actorEmail: user.email ?? null,
            diff: {
              decision: d.decision,
              condicion: d.condicion || null,
              motivoRechazo: d.motivoRechazo || null,
            } as Prisma.InputJsonValue,
          },
        });
      }

      // 2) Recalcula el estado de cada solicitud afectada.
      for (const solId of solicitudIds) {
        const sol = await tx.solicitud.findUnique({
          where: { id: solId },
          select: {
            id: true,
            codigo: true,
            estado: true,
            mailFarmaciaEnviado: true,
            emailFarmaciaHistorico: true,
            items: { select: { estadoDecision: true, cargadoERP: true, motivo: true, testerEnviado: true } },
          },
        });
        if (!sol) continue;

        const cierre = evaluarCierre(sol.items, sol.mailFarmaciaEnviado);

        const data: Prisma.SolicitudUpdateInput = { estado: cierre.estado };

        // En la etapa del comprador, una solicitud solo puede finalizar
        // como RECHAZO_TOTAL (los aprobados aún no pasaron por Precios).
        if (cierre.notificar && cierre.tipo === "RECHAZO_TOTAL") {
          await tx.emailOutbox.create({
            data: {
              tipo: "RECHAZO_TOTAL_FARMACIA",
              destinatario: sol.emailFarmaciaHistorico,
              asunto: `Tu solicitud ${sol.codigo} fue revisada`,
              dedupKey: dedupRechazoTotal(sol.id),
              payload: {
                solicitudId: sol.id,
                codigo: sol.codigo,
              } as Prisma.InputJsonValue,
            },
          });
          data.mailFarmaciaEnviado = true;
          data.mailFarmaciaEnviadoAt = ahora;
          rechazosNotificados++;
        }

        if (cierre.finalizada) solicitudesCerradas++;
        await tx.solicitud.update({ where: { id: sol.id }, data });
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "CARRERA") {
      return { ok: false, error: "Algunos ítems ya fueron decididos. Refrescá la bandeja." };
    }
    console.error("[confirmarDecisiones] error:", e);
    return { ok: false, error: "No se pudieron guardar las decisiones. Reintentá." };
  }

  revalidatePath("/comprador/bandeja");
  return {
    ok: true,
    actualizados: decisiones.length,
    solicitudesCerradas,
    rechazosNotificados,
  };
}
