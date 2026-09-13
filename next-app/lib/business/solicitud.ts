// ─────────────────────────────────────────────────────────────
// Generación del código legible de solicitud: "SOL-<timestamp>".
// El id real es un cuid; este código es para humanos y para los
// correos ("Solicitud SOL-XXXX").
// ─────────────────────────────────────────────────────────────

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

/** Ej: SOL-260616-143052-4F7A */
export function generateSolicitudCodigo(
  now: Date = new Date(),
  randomSuffix: string = Math.random().toString(16).slice(2, 6).toUpperCase(),
): string {
  const yy = pad(now.getFullYear() % 100);
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const mi = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `SOL-${yy}${mm}${dd}-${hh}${mi}${ss}-${randomSuffix}`;
}
