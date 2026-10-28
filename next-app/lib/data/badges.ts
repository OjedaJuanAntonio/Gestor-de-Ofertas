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
          ? { estadoDecision: "PENDIENTE" }
          : { compradorId: userId, estadoDecision: "PENDIENTE" },
    });
  }

  if (role === "PRECIOS" || role === "ADMIN") {
    counts.preciosPendientes = await prisma.itemSolicitud.count({
      where: { estadoDecision: "APROBADO", cargadoERP: false },
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
