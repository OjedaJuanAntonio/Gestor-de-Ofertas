import "server-only";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────
// Probadores / tester (motivo PROBADOR). Son productos reales que
// la farmacia pide para que el cliente pruebe; no pasan por el ERP.
// Una vez aprobados por el comprador, quedan pendientes de ENVÍO
// (testerEnviado = false) hasta que alguien marca que se mandaron.
// ─────────────────────────────────────────────────────────────

export type ItemTester = {
  id: string;
  codigoBarra: string;
  descripcion: string;
  laboratorio: string;
  cantidad: number;
  solicitudCodigo: string;
  farmaciaNombre: string;
  fechaAprobacion: Date | null;
};

/**
 * Probadores aprobados pendientes de envío. Si `compradorId` viene
 * undefined (admin), trae los de todos los compradores.
 */
export async function getTestersPendientes(
  compradorId?: string,
): Promise<ItemTester[]> {
  const rows = await prisma.itemSolicitud.findMany({
    where: {
      motivo: "PROBADOR",
      estadoDecision: "APROBADO",
      testerEnviado: false,
      ...(compradorId ? { compradorId } : {}),
    },
    orderBy: [{ fechaAprobacion: "asc" }],
    select: {
      id: true,
      codigoBarra: true,
      cantidad: true,
      fechaAprobacion: true,
      laboratorioHistorico: true,
      articulo: { select: { descripcion: true } },
      solicitud: { select: { codigo: true, nombreFarmaciaHistorico: true } },
    },
  });

  return rows.map((it) => ({
    id: it.id,
    codigoBarra: it.codigoBarra,
    descripcion: it.articulo.descripcion,
    laboratorio: it.laboratorioHistorico,
    cantidad: it.cantidad,
    solicitudCodigo: it.solicitud.codigo,
    farmaciaNombre: it.solicitud.nombreFarmaciaHistorico,
    fechaAprobacion: it.fechaAprobacion,
  }));
}
