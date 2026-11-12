import "server-only";
import { prisma } from "@/lib/prisma";
import type { RegistroMetrica } from "@/lib/analytics/metrics";

// ─────────────────────────────────────────────────────────────
// Alimenta las métricas gerenciales. Trae los ítems con sus
// timestamps y los aplana a RegistroMetrica.
// ─────────────────────────────────────────────────────────────

/** Ventana por defecto de los reportes: un año hacia atrás. */
export const MESES_REPORTE_DEFECTO = 12;

export function desdeHaceMeses(meses: number, ahora: Date = new Date()): Date {
  const d = new Date(ahora);
  d.setMonth(d.getMonth() - meses);
  return d;
}

/**
 * Registros para las métricas. Acotado a una ventana (por defecto 12 meses): con
 * ~1.500 ítems por día, traer TODO el histórico en cada visita al dashboard no
 * escala. `desde = null` fuerza todo el histórico (para una exportación puntual).
 */
export async function getRegistrosMetrica(
  desde: Date | null = desdeHaceMeses(MESES_REPORTE_DEFECTO),
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
