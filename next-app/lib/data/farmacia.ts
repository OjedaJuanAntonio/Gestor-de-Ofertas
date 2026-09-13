import "server-only";
import { prisma } from "@/lib/prisma";

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

/** Solicitudes de una farmacia (o todas si farmaciaId es null, para admin). */
export async function getSolicitudesFarmacia(
  farmaciaId: number | null,
  limit = 50,
): Promise<SolicitudResumen[]> {
  const solicitudes = await prisma.solicitud.findMany({
    where: farmaciaId ? { farmaciaId } : undefined,
    orderBy: { fechaEnvio: "desc" },
    take: limit,
    select: {
      id: true,
      codigo: true,
      fechaEnvio: true,
      estado: true,
      items: { select: { estadoDecision: true } },
    },
  });

  return solicitudes.map((s) => ({
    id: s.id,
    codigo: s.codigo,
    fechaEnvio: s.fechaEnvio,
    estado: s.estado,
    total: s.items.length,
    aprobados: s.items.filter((i) => i.estadoDecision === "APROBADO").length,
    rechazados: s.items.filter((i) => i.estadoDecision === "RECHAZADO").length,
    pendientes: s.items.filter((i) => i.estadoDecision === "PENDIENTE").length,
  }));
}
