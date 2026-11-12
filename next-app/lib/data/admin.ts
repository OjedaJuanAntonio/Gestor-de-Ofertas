import "server-only";
import { prisma } from "@/lib/prisma";

// Consultas de listado para el panel Admin.

export async function listFarmacias() {
  return prisma.farmacia.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, email: true, activa: true, _count: { select: { solicitudes: true } } },
  });
}

export async function listUsuarios() {
  return prisma.user.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    select: {
      id: true,
      email: true,
      nombre: true,
      role: true,
      activo: true,
      farmacia: { select: { nombre: true } },
      proveedores: { select: { nombre: true } },
    },
  });
}

/** Proveedores (laboratorios) con su comprador responsable y cuántos artículos tienen. */
export async function listProveedores() {
  return prisma.proveedor.findMany({
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      activo: true,
      comprador: { select: { id: true, nombre: true } },
      _count: { select: { articulos: true } },
    },
  });
}

export async function listFarmaciasOptions() {
  return prisma.farmacia.findMany({
    where: { activa: true },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });
}

/**
 * Ítems "huérfanos": pendientes cuyo laboratorio no tenía comprador asignado al
 * enviarse (compradorId = null). No aparecen en ninguna bandeja y bloquean el
 * cierre de su solicitud hasta que un admin los deriva. Equivale a la "bandeja
 * de huérfanos" del flujo de Google Sheets.
 */
export async function listItemsSinComprador() {
  return prisma.itemSolicitud.findMany({
    where: { compradorId: null, estadoDecision: "PENDIENTE" },
    orderBy: [{ laboratorioHistorico: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      codigoBarra: true,
      cantidad: true,
      motivo: true,
      fechaVencimiento: true,
      laboratorioHistorico: true,
      articulo: { select: { descripcion: true } },
      solicitud: {
        select: { codigo: true, fechaEnvio: true, nombreFarmaciaHistorico: true },
      },
    },
  });
}

/** Compradores activos (para el selector de derivación). */
export async function listCompradoresOptions() {
  return prisma.user.findMany({
    where: { role: "COMPRADOR", activo: true },
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      email: true,
      proveedores: { select: { nombre: true } },
    },
  });
}

export async function listCorreosProblema() {
  return prisma.emailOutbox.findMany({
    where: { estado: { in: ["DEAD", "FALLIDO"] } },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      tipo: true,
      destinatario: true,
      asunto: true,
      estado: true,
      intentos: true,
      ultimoError: true,
      updatedAt: true,
    },
  });
}

/**
 * Estado de la cola de correos: cuántos esperan salir, desde cuándo, y cuántos
 * salieron en las últimas 24 h. Antes solo se veían los fallidos, así que una
 * cola trabada (cron sin configurar) era invisible.
 */
export async function resumenColaCorreos() {
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [pendientes, masViejo, enviados24h, conProblemas] = await Promise.all([
    prisma.emailOutbox.count({ where: { estado: { in: ["PENDIENTE", "FALLIDO"] } } }),
    prisma.emailOutbox.findFirst({
      where: { estado: { in: ["PENDIENTE", "FALLIDO"] } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.emailOutbox.count({ where: { estado: "ENVIADO", sentAt: { gte: hace24h } } }),
    prisma.emailOutbox.count({ where: { estado: "DEAD" } }),
  ]);
  return { pendientes, masViejo: masViejo?.createdAt ?? null, enviados24h, conProblemas };
}

export const PAGE_SIZE_AUDITORIA = 100;

/** Registro de auditoría, lo más reciente primero. `q` busca en acción, actor y entidad. */
export async function listAuditoria(opts: { page?: number; q?: string } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();
  const where = q
    ? {
        OR: [
          { action: { contains: q, mode: "insensitive" as const } },
          { actorEmail: { contains: q, mode: "insensitive" as const } },
          { entityType: { contains: q, mode: "insensitive" as const } },
          { entityId: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  const [total, filas] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE_AUDITORIA,
      take: PAGE_SIZE_AUDITORIA,
      select: {
        id: true,
        createdAt: true,
        actorEmail: true,
        action: true,
        entityType: true,
        entityId: true,
        diff: true,
      },
    }),
  ]);
  return { total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE_AUDITORIA)), filas };
}
