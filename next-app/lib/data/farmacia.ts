import "server-only";
import { prisma } from "@/lib/prisma";
import type { EstadoSolicitud } from "@/types";

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
  opts: { page?: number; estado?: EstadoSolicitud | null } = {},
): Promise<SolicitudesFarmaciaResult> {
  const page = Math.max(1, opts.page ?? 1);
  const where = {
    ...(farmaciaId ? { farmaciaId } : {}),
    ...(opts.estado ? { estado: opts.estado } : {}),
  };

  const [total, solicitudes] = await Promise.all([
    prisma.solicitud.count({ where }),
    prisma.solicitud.findMany({
      where,
      orderBy: { fechaEnvio: "desc" },
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
