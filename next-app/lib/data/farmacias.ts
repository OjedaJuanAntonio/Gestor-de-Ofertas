import "server-only";
import { prisma } from "@/lib/prisma";

export type FarmaciaOption = {
  id: string; // el id es el código interno de la farmacia
  nombre: string;
  email: string | null;
};

/**
 * Farmacias activas para el dropdown de la cabecera de carga. Con `soloId`
 * devuelve únicamente esa (para el operador de una farmacia: no tiene por qué
 * recibir el código, nombre y mail de las demás).
 */
export async function getFarmaciasActivas(soloId?: string): Promise<FarmaciaOption[]> {
  return prisma.farmacia.findMany({
    where: { activa: true, ...(soloId ? { id: soloId } : {}) },
    select: { id: true, nombre: true, email: true },
    orderBy: { nombre: "asc" },
  });
}
