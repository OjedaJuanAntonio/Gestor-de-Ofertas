import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { EstadoSolicitud } from "@/types";
import { normalizarDir, rangoFecha } from "./historial";

// Columnas ordenables de "Mis solicitudes" (clic en la cabecera).
const ORDEN_FARMACIA: Record<string, (dir: "asc" | "desc") => Prisma.SolicitudOrderByWithRelationInput> = {
  codigo: (dir) => ({ codigo: dir }),
  enviada: (dir) => ({ fechaEnvio: dir }),
  items: (dir) => ({ items: { _count: dir } }),
};

export type SolicitudResumen = {
  id: string;
  codigo: string;
  fechaEnvio: Date;
  estado: string;
  total: number;
  aprobados: number;
  rechazados: number;
  pendientes: number;
};

export const PAGE_SIZE_SOLICITUDES = 50;

export type SolicitudesFarmaciaResult = {
  items: SolicitudResumen[];
  total: number;
  page: number;
  pages: number;
};

/**
 * Solicitudes de una farmacia (o todas si farmaciaId es null, para admin),
 * paginadas server-side y opcionalmente filtradas por estado. Antes se traían
 * solo las 50 más recientes sin forma de ver el resto; ahora se navega por
 * páginas y se puede filtrar.
 */
export async function getSolicitudesFarmacia(
  farmaciaId: number | null,
  opts: {
    page?: number;
    estado?: EstadoSolicitud | null;
    q?: string;
    sort?: string;
    dir?: string;
    desde?: string;
    hasta?: string;
  } = {},
): Promise<SolicitudesFarmaciaResult> {
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();
  const fecha = rangoFecha(opts.desde, opts.hasta);
  const dir = normalizarDir(opts.dir);
  const orderBy = (ORDEN_FARMACIA[opts.sort ?? ""] ?? ORDEN_FARMACIA.enviada)(dir);
  const where: Prisma.SolicitudWhereInput = {
    ...(farmaciaId ? { farmaciaId } : {}),
    ...(opts.estado ? { estado: opts.estado } : {}),
    ...(fecha ? { fechaEnvio: fecha } : {}),
    // Búsqueda de texto: código de la solicitud, o EAN/producto de sus ítems.
    ...(q
      ? {
          OR: [
            { codigo: { contains: q, mode: "insensitive" } },
            { items: { some: { codigoBarra: { contains: q, mode: "insensitive" } } } },
            { items: { some: { articulo: { descripcion: { contains: q, mode: "insensitive" } } } } },
          ],
        }
      : {}),
  };

  const [total, solicitudes] = await Promise.all([
    prisma.solicitud.count({ where }),
    prisma.solicitud.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE_SOLICITUDES,
      take: PAGE_SIZE_SOLICITUDES,
      select: {
        id: true,
        codigo: true,
        fechaEnvio: true,
        estado: true,
        items: { select: { estadoDecision: true } },
      },
    }),
  ]);

  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE_SOLICITUDES)),
    items: solicitudes.map((s) => ({
      id: s.id,
      codigo: s.codigo,
      fechaEnvio: s.fechaEnvio,
      estado: s.estado,
      total: s.items.length,
      aprobados: s.items.filter((i) => i.estadoDecision === "APROBADO").length,
      rechazados: s.items.filter((i) => i.estadoDecision === "RECHAZADO").length,
      pendientes: s.items.filter((i) => i.estadoDecision === "PENDIENTE").length,
    })),
  };
}

export type ItemSolicitudDetalle = {
  id: string;
  codigoBarra: string;
  descripcion: string;
  laboratorio: string;
  cantidad: number;
  motivo: string;
  fechaVencimiento: string | null;
  observaciones: string | null;
  estadoDecision: string;
  condicionAutorizada: string | null;
  motivoRechazo: string | null;
  testerEnviado: boolean;
};

export type SolicitudDetalle = {
  id: string;
  codigo: string;
  fechaEnvio: Date;
  estado: string;
  farmaciaNombre: string;
  items: ItemSolicitudDetalle[];
};

/**
 * Detalle de una solicitud con sus ítems y el resultado de cada uno.
 * `farmaciaId` acota el acceso: una farmacia solo ve sus propias solicitudes;
 * pasar null (admin) permite ver cualquiera. Devuelve null si no existe o si
 * no pertenece a la farmacia indicada.
 */
export async function getSolicitudDetalle(
  id: string,
  farmaciaId: number | null,
): Promise<SolicitudDetalle | null> {
  const sol = await prisma.solicitud.findUnique({
    where: { id },
    select: {
      id: true,
      codigo: true,
      fechaEnvio: true,
      estado: true,
      farmaciaId: true,
      nombreFarmaciaHistorico: true,
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          codigoBarra: true,
          cantidad: true,
          motivo: true,
          fechaVencimiento: true,
          observaciones: true,
          estadoDecision: true,
          condicionAutorizada: true,
          motivoRechazo: true,
          testerEnviado: true,
          laboratorioHistorico: true,
          articulo: { select: { descripcion: true } },
        },
      },
    },
  });

  if (!sol) return null;
  // Scoping: una farmacia solo puede ver lo suyo (admin pasa null y ve todo).
  if (farmaciaId !== null && sol.farmaciaId !== farmaciaId) return null;

  return {
    id: sol.id,
    codigo: sol.codigo,
    fechaEnvio: sol.fechaEnvio,
    estado: sol.estado,
    farmaciaNombre: sol.nombreFarmaciaHistorico,
    items: sol.items.map((i) => ({
      id: i.id,
      codigoBarra: i.codigoBarra,
      descripcion: i.articulo.descripcion,
      laboratorio: i.laboratorioHistorico,
      cantidad: i.cantidad,
      motivo: i.motivo,
      fechaVencimiento: i.fechaVencimiento,
      observaciones: i.observaciones,
      estadoDecision: i.estadoDecision,
      condicionAutorizada: i.condicionAutorizada,
      motivoRechazo: i.motivoRechazo,
      testerEnviado: i.testerEnviado,
    })),
  };
}
