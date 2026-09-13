// ─────────────────────────────────────────────────────────────
// Claves de deduplicación para el EmailOutbox.
// Garantizan que un mismo evento no genere dos correos (idempotencia
// a nivel notificación), incluso si el proceso se reintenta.
// ─────────────────────────────────────────────────────────────

export function dedupNotifComprador(
  solicitudId: string,
  compradorId: string,
): string {
  return `notif-comprador:${solicitudId}:${compradorId}`;
}

export function dedupConsolidadoFarmacia(solicitudId: string): string {
  return `consolidado-farmacia:${solicitudId}`;
}

export function dedupRechazoTotal(solicitudId: string): string {
  return `rechazo-total:${solicitudId}`;
}
