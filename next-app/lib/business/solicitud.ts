// ─────────────────────────────────────────────────────────────
// Generación del código legible de solicitud: "SOL-<timestamp>".
// El id real es un cuid; este código es para humanos y para los
// correos ("Solicitud SOL-XXXX").
// ─────────────────────────────────────────────────────────────

import { partesEnArgentina } from "@/lib/fecha";

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

/** Ej: SOL-260616-143052-4F7A (fecha y hora de Argentina, no la del servidor). */
export function generateSolicitudCodigo(
  now: Date = new Date(),
  randomSuffix: string = Math.random().toString(16).slice(2, 6).toUpperCase(),
): string {
  const t = partesEnArgentina(now);
  return `SOL-${pad(t.anio % 100)}${pad(t.mes)}${pad(t.dia)}-${pad(t.hora)}${pad(t.minuto)}${pad(t.segundo)}-${randomSuffix}`;
}
