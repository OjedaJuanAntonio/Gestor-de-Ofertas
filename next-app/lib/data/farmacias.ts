import "server-only";
import { prisma } from "@/lib/prisma";

export type FarmaciaOption = {
  id: number;
  nombre: string;
  email: string | null;
};

/** Farmacias activas para el dropdown de la cabecera de carga. */
export async function getFarmaciasActivas(): Promise<FarmaciaOption[]> {
  return prisma.farmacia.findMany({
    where: { activa: true },
    select: { id: true, nombre: true, email: true },
    orderBy: { nombre: "asc" },
  });
}
