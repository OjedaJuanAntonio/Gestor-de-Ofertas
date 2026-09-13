import "server-only";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────
// Datos del Panel de Precios (Módulo 3).
// Pendientes de carga = ítems APROBADOS que todavía no se cargaron
// en el ERP (fechaCargaERP null). Paginado server-side.
// ─────────────────────────────────────────────────────────────

export type ItemPrecios = {
  id: string;
  codigoBarra: string;
  descripcion: string;
  laboratorio: string;
  cantidad: number;
  condicionAutorizada: string | null;
  solicitudCodigo: string;
  farmaciaNombre: string;
  fechaAprobacion: Date | null;
};

export const PAGE_SIZE = 50;

export async function getPendientesPrecios(
  page = 1,
): Promise<{ items: ItemPrecios[]; total: number; page: number; pages: number }> {
  const where = {
    estadoDecision: "APROBADO" as const,
    cargadoERP: false,
  };

  const [total, rows] = await Promise.all([
    prisma.itemSolicitud.count({ where }),
    prisma.itemSolicitud.findMany({
      where,
      select: {
        id: true,
        codigoBarra: true,
        cantidad: true,
        condicionAutorizada: true,
        fechaAprobacion: true,
        laboratorioHistorico: true,
        articulo: { select: { descripcion: true } },
        solicitud: { select: { codigo: true, nombreFarmaciaHistorico: true } },
      },
      orderBy: [{ solicitud: { codigo: "asc" } }, { fechaAprobacion: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    items: rows.map((it) => ({
      id: it.id,
      codigoBarra: it.codigoBarra,
      descripcion: it.articulo.descripcion,
      laboratorio: it.laboratorioHistorico,
      cantidad: it.cantidad,
      condicionAutorizada: it.condicionAutorizada,
      solicitudCodigo: it.solicitud.codigo,
      farmaciaNombre: it.solicitud.nombreFarmaciaHistorico,
      fechaAprobacion: it.fechaAprobacion,
    })),
  };
}
