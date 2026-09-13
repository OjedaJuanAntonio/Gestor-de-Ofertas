// ─────────────────────────────────────────────────────────────
// EAN / código de barras — normalización y validación.
// El scanner suele agregar espacios o el código viene con ceros a
// la izquierda; normalizamos a solo dígitos para evitar falsos
// "producto inexistente".
// ─────────────────────────────────────────────────────────────

/** Deja solo dígitos. "  779-123 \n" → "779123". */
export function normalizeEan(raw: string): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** Formato aceptable: 6 a 14 dígitos (cubre EAN-8, EAN-13, internos). */
export function isValidEanFormat(ean: string): boolean {
  return /^\d{6,14}$/.test(ean);
}

/**
 * Verifica el dígito de control de un EAN-13 (opcional, informativo).
 * No se usa para bloquear: muchos códigos internos no son EAN-13 estrictos.
 */
export function isValidEan13Checksum(ean: string): boolean {
  if (!/^\d{13}$/.test(ean)) return false;
  const digits = ean.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reduce(
    (acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3),
    0,
  );
  const expected = (10 - (sum % 10)) % 10;
  return expected === check;
}
