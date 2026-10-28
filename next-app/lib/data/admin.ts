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
      laboratorios: { select: { laboratorio: true } },
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
      laboratorios: { select: { laboratorio: true } },
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
