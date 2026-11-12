import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizarDir, rangoFecha } from "./historial";

// Columnas ordenables del historial del comprador (clic en la cabecera).
const ORDEN_COMPRADOR: Record<string, (dir: "asc" | "desc") => Prisma.ItemSolicitudOrderByWithRelationInput> = {
  fecha: (dir) => ({ fechaAprobacion: dir }),
  solicitud: (dir) => ({ solicitud: { codigo: dir } }),
  farmacia: (dir) => ({ solicitud: { nombreFarmaciaHistorico: dir } }),
  ean: (dir) => ({ codigoBarra: dir }),
  producto: (dir) => ({ articulo: { descripcion: dir } }),
  cantidad: (dir) => ({ cantidad: dir }),
  resultado: (dir) => ({ estadoDecision: dir }),
};

// ─────────────────────────────────────────────────────────────
// Datos del Workspace del Comprador (Módulo 2).
// Filtro automático por perfil: solo ítems asignados al comprador
// logueado. La bandeja muestra los PENDIENTES; el histórico, los
// ya decididos (paginado server-side).
// ─────────────────────────────────────────────────────────────

export type ItemBandeja = {
  id: string;
  codigoBarra: string;
  descripcion: string;
  laboratorio: string;
  cantidad: number;
  motivo: string;
  fechaVencimiento: string | null;
  observaciones: string | null;
  solicitudCodigo: string;
  farmaciaNombre: string;
  fechaEnvio: Date;
  /** Comprador al que está asignado (lo usa la vista del admin, que ve todos). */
  compradorNombre: string | null;
  compradorActivo: boolean;
};

/**
 * Ítems pendientes de decisión. Con un `compradorId`, los de ese comprador.
 * Con null (ADMIN), los de TODOS los compradores: antes el admin veía solo los
 * asignados a su propio usuario (ninguno), así que los pendientes de un
 * comprador ausente o desactivado no aparecían en ninguna pantalla. Los que no
 * tienen comprador están en Admin → Sin asignar.
 */
export async function getBandejaComprador(
  compradorId: string | null,
): Promise<ItemBandeja[]> {
  const items = await prisma.itemSolicitud.findMany({
    where: {
      compradorId: compradorId ?? { not: null },
      estadoDecision: "PENDIENTE",
    },
    select: {
      id: true,
      codigoBarra: true,
      cantidad: true,
      motivo: true,
      fechaVencimiento: true,
      observaciones: true,
      laboratorioHistorico: true,
      articulo: { select: { descripcion: true } },
      comprador: { select: { nombre: true, activo: true } },
      solicitud: {
        select: { codigo: true, fechaEnvio: true, nombreFarmaciaHistorico: true },
      },
    },
    orderBy: [{ solicitud: { fechaEnvio: "asc" } }, { laboratorioHistorico: "asc" }],
  });

  return items.map((it) => ({
    id: it.id,
    codigoBarra: it.codigoBarra,
    descripcion: it.articulo.descripcion,
    laboratorio: it.laboratorioHistorico,
    cantidad: it.cantidad,
    motivo: it.motivo,
    fechaVencimiento: it.fechaVencimiento,
    observaciones: it.observaciones,
    solicitudCodigo: it.solicitud.codigo,
    farmaciaNombre: it.solicitud.nombreFarmaciaHistorico,
    fechaEnvio: it.solicitud.fechaEnvio,
    compradorNombre: it.comprador?.nombre ?? null,
    compradorActivo: it.comprador?.activo ?? false,
  }));
}

export type HistoricoItem = {
  id: string;
  codigoBarra: string;
  descripcion: string;
  cantidad: number;
  estadoDecision: string;
  condicionAutorizada: string | null;
  motivoRechazo: string | null;
  fechaAprobacion: Date | null;
  solicitudCodigo: string;
  farmaciaNombre: string;
};

export const PAGE_SIZE = 50;

/** Historial de decisiones de un comprador (o de todos, con null: vista del admin). */
export async function getHistoricoComprador(
  compradorId: string | null,
  opts: {
    page?: number;
    estado?: "APROBADO" | "RECHAZADO" | null;
    q?: string;
    sort?: string;
    dir?: string;
    desde?: string;
    hasta?: string;
  } = {},
): Promise<{ items: HistoricoItem[]; total: number; page: number; pages: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();
  const fecha = rangoFecha(opts.desde, opts.hasta);
  const dir = normalizarDir(opts.dir);
  const orderBy = (ORDEN_COMPRADOR[opts.sort ?? ""] ?? ORDEN_COMPRADOR.fecha)(dir);
  const where: Prisma.ItemSolicitudWhereInput = {
    ...(compradorId ? { compradorId } : {}),
    estadoDecision: opts.estado ? opts.estado : { in: ["APROBADO", "RECHAZADO"] },
    ...(fecha ? { fechaAprobacion: fecha } : {}),
    // Búsqueda de texto: matchea EAN, producto, código de solicitud o farmacia.
    ...(q
      ? {
          OR: [
            { codigoBarra: { contains: q, mode: "insensitive" } },
            { articulo: { descripcion: { contains: q, mode: "insensitive" } } },
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
        estadoDecision: true,
        condicionAutorizada: true,
        motivoRechazo: true,
        fechaAprobacion: true,
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
      cantidad: it.cantidad,
      estadoDecision: it.estadoDecision,
      condicionAutorizada: it.condicionAutorizada,
      motivoRechazo: it.motivoRechazo,
      fechaAprobacion: it.fechaAprobacion,
      solicitudCodigo: it.solicitud.codigo,
      farmaciaNombre: it.solicitud.nombreFarmaciaHistorico,
    })),
  };
}
