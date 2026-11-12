import "server-only";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/types";

// ─────────────────────────────────────────────────────────────
// Contadores para badges in-app del sidebar (no depender solo del
// mail): pendientes del comprador, pendientes de carga de Precios,
// y correos en dead-letter para el admin.
// ─────────────────────────────────────────────────────────────

export type BadgeCounts = {
  compradorPendientes?: number;
  preciosPendientes?: number;
  emailsDead?: number;
  adminSinAsignar?: number;
  testersPendientes?: number;
};

export async function getBadgeCounts(
  role: Role,
  userId: string,
): Promise<BadgeCounts> {
  const counts: BadgeCounts = {};

  if (role === "COMPRADOR" || role === "ADMIN") {
    counts.compradorPendientes = await prisma.itemSolicitud.count({
      where:
        role === "ADMIN"
          ? // Igual que su bandeja: pendientes con comprador (los que no tienen
            // están en "Sin asignar", con su propio contador).
            { compradorId: { not: null }, estadoDecision: "PENDIENTE" }
          : { compradorId: userId, estadoDecision: "PENDIENTE" },
    });
    counts.testersPendientes = await prisma.itemSolicitud.count({
      where: {
        motivo: "PROBADOR",
        estadoDecision: "APROBADO",
        testerEnviado: false,
        ...(role === "ADMIN" ? {} : { compradorId: userId }),
      },
    });
  }

  if (role === "PRECIOS" || role === "ADMIN") {
    counts.preciosPendientes = await prisma.itemSolicitud.count({
      // Mismo criterio que la lista de Precios: los probadores no pasan por el
      // ERP (se cierran en Testers) y nunca tendrán cargadoERP = true.
      where: { estadoDecision: "APROBADO", cargadoERP: false, motivo: { not: "PROBADOR" } },
    });
  }

  if (role === "ADMIN") {
    counts.emailsDead = await prisma.emailOutbox.count({
      where: { estado: "DEAD" },
    });
    counts.adminSinAsignar = await prisma.itemSolicitud.count({
      where: { compradorId: null, estadoDecision: "PENDIENTE" },
    });
  }

  return counts;
}
