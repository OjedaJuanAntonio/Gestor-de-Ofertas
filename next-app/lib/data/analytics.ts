import "server-only";
import { prisma } from "@/lib/prisma";
import type { RegistroMetrica } from "@/lib/analytics/metrics";

// ─────────────────────────────────────────────────────────────
// Alimenta las métricas gerenciales. Trae los ítems con sus
// timestamps y los aplana a RegistroMetrica.
// ─────────────────────────────────────────────────────────────

export async function getRegistrosMetrica(
  desde?: Date,
): Promise<RegistroMetrica[]> {
  const rows = await prisma.itemSolicitud.findMany({
    where: desde ? { solicitud: { fechaEnvio: { gte: desde } } } : undefined,
    select: {
      estadoDecision: true,
      fechaAprobacion: true,
      fechaCargaERP: true,
      laboratorioHistorico: true,
      compradorMailHistorico: true,
      comprador: { select: { nombre: true } },
      solicitud: { select: { fechaEnvio: true } },
    },
  });

  return rows.map((r) => ({
    fechaEnvio: r.solicitud.fechaEnvio,
    fechaAprobacion: r.fechaAprobacion,
    fechaCargaERP: r.fechaCargaERP,
    estadoDecision: r.estadoDecision,
    comprador: r.comprador?.nombre ?? r.compradorMailHistorico ?? "(sin asignar)",
    laboratorio: r.laboratorioHistorico,
  }));
}
