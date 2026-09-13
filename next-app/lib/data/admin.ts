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
