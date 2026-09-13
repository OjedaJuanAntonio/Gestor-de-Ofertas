import type { EstadoDecision, EstadoSolicitud } from "@prisma/client";

// ─────────────────────────────────────────────────────────────
// Lógica de cierre de ciclo de una solicitud.
//
// Reglas:
//  - PENDIENTE: ningún ítem fue revisado por el comprador.
//  - EN_PROCESO: hay revisión parcial, pero el ciclo no cerró.
//  - FINALIZADA: todos los ítems están resueltos (sin PENDIENTE) y
//    todos los APROBADOS ya fueron cargados en el ERP por Precios.
//
// La notificación final a la farmacia se dispara una sola vez al
// finalizar:
//   - CONSOLIDADO: hubo al menos un ítem aprobado.
//   - RECHAZO_TOTAL: 100% rechazados (corrige el bug donde estas
//     solicitudes nunca llegaban a Precios y la farmacia no se
//     enteraba del rechazo).
// ─────────────────────────────────────────────────────────────

export type ItemEstado = {
  estadoDecision: EstadoDecision;
  cargadoERP: boolean;
};

export function computeEstadoSolicitud(
  items: ItemEstado[],
): EstadoSolicitud {
  if (items.length === 0) return "PENDIENTE";

  const algunoRevisado = items.some((i) => i.estadoDecision !== "PENDIENTE");
  if (!algunoRevisado) return "PENDIENTE";

  const todosResueltos = items.every((i) => i.estadoDecision !== "PENDIENTE");
  const aprobadosCargados = items
    .filter((i) => i.estadoDecision === "APROBADO")
    .every((i) => i.cargadoERP);

  if (todosResueltos && aprobadosCargados) return "FINALIZADA";
  return "EN_PROCESO";
}

export type TipoNotificacionCierre = "CONSOLIDADO" | "RECHAZO_TOTAL" | null;

export type ResultadoCierre = {
  estado: EstadoSolicitud;
  finalizada: boolean;
  /** Debe enviarse la notificación final ahora (anti-duplicado incluido). */
  notificar: boolean;
  tipo: TipoNotificacionCierre;
};

/**
 * Decide el estado de la solicitud y si corresponde notificar a la
 * farmacia. `yaNotificada` = flag mailFarmaciaEnviado de la cabecera.
 */
export function evaluarCierre(
  items: ItemEstado[],
  yaNotificada: boolean,
): ResultadoCierre {
  const estado = computeEstadoSolicitud(items);
  const finalizada = estado === "FINALIZADA";

  let tipo: TipoNotificacionCierre = null;
  if (finalizada) {
    const hayAprobados = items.some((i) => i.estadoDecision === "APROBADO");
    tipo = hayAprobados ? "CONSOLIDADO" : "RECHAZO_TOTAL";
  }

  const notificar = finalizada && !yaNotificada;

  return { estado, finalizada, notificar, tipo };
}
