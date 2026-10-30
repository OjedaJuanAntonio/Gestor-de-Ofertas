import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizarDir, rangoFecha } from "./historial";

// Columnas ordenables del historial de Precios (clic en la cabecera).
const ORDEN_PRECIOS: Record<string, (dir: "asc" | "desc") => Prisma.ItemSolicitudOrderByWithRelationInput> = {
  cargado: (dir) => ({ fechaCargaERP: dir }),
  solicitud: (dir) => ({ solicitud: { codigo: dir } }),
  farmacia: (dir) => ({ solicitud: { nombreFarmaciaHistorico: dir } }),
  producto: (dir) => ({ articulo: { descripcion: dir } }),
  laboratorio: (dir) => ({ laboratorioHistorico: dir }),
  cantidad: (dir) => ({ cantidad: dir }),
  ean: (dir) => ({ codigoBarra: dir }),
  condicion: (dir) => ({ condicionAutorizada: dir }),
};

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
    // Los probadores (tester) no pasan por el ERP: se cierran en la vista de Testers.
    motivo: { not: "PROBADOR" as const },
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

/** TODOS los ítems pendientes de carga (sin paginar), para exportar a Excel. */
export async function getTodosPendientesPrecios(): Promise<ItemPrecios[]> {
  const rows = await prisma.itemSolicitud.findMany({
    where: {
      estadoDecision: "APROBADO" as const,
      cargadoERP: false,
      motivo: { not: "PROBADOR" as const },
    },
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
  });

  return rows.map((it) => ({
    id: it.id,
    codigoBarra: it.codigoBarra,
    descripcion: it.articulo.descripcion,
    laboratorio: it.laboratorioHistorico,
    cantidad: it.cantidad,
    condicionAutorizada: it.condicionAutorizada,
    solicitudCodigo: it.solicitud.codigo,
    farmaciaNombre: it.solicitud.nombreFarmaciaHistorico,
    fechaAprobacion: it.fechaAprobacion,
  }));
}

/** De un conjunto de ids, los que siguen pendientes de carga (válidos para marcar). */
export async function filtrarPendientesValidos(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.itemSolicitud.findMany({
    where: {
      id: { in: ids },
      estadoDecision: "APROBADO" as const,
      cargadoERP: false,
      motivo: { not: "PROBADOR" as const },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export type ItemPreciosHistorico = ItemPrecios & { fechaCargaERP: Date | null };

/**
 * Historial de Precios: ítems que YA se cargaron en el ERP (cargadoERP = true).
 * Paginado server-side, ordenado por fecha de carga (lo más reciente primero).
 */
export async function getHistoricoPrecios(
  opts: { page?: number; q?: string; sort?: string; dir?: string; desde?: string; hasta?: string } = {},
): Promise<{ items: ItemPreciosHistorico[]; total: number; page: number; pages: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();
  const fecha = rangoFecha(opts.desde, opts.hasta);
  const dir = normalizarDir(opts.dir);
  const orderBy = (ORDEN_PRECIOS[opts.sort ?? ""] ?? ORDEN_PRECIOS.cargado)(dir);
  const where: Prisma.ItemSolicitudWhereInput = {
    estadoDecision: "APROBADO" as const,
    cargadoERP: true,
    motivo: { not: "PROBADOR" as const },
    ...(fecha ? { fechaCargaERP: fecha } : {}),
    // Búsqueda de texto: EAN, producto, laboratorio (proveedor), código o farmacia.
    ...(q
      ? {
          OR: [
            { codigoBarra: { contains: q, mode: "insensitive" } },
            { articulo: { descripcion: { contains: q, mode: "insensitive" } } },
            { laboratorioHistorico: { contains: q, mode: "insensitive" } },
            { solicitud: { codigo: { contains: q, mode: "insensitive" } } },
            { solicitud: { nombreFarmaciaHistorico: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
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
        fechaCargaERP: true,
        laboratorioHistorico: true,
        articulo: { select: { descripcion: true } },
        solicitud: { select: { codigo: true, nombreFarmaciaHistorico: true } },
      },
      orderBy,
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
      fechaCargaERP: it.fechaCargaERP,
    })),
  };
}
