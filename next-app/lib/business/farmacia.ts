// ─────────────────────────────────────────────────────────────
// Código interno de farmacia (es el id de la farmacia).
//
// Lo carga una persona (a mano o desde Excel), así que se normaliza
// para que "f001", " F001 " y "F 001" sean la misma farmacia. NO se
// tocan los ceros a la izquierda: "0012" y "12" son códigos distintos
// (ojo: Excel los borra si la columna no está en formato Texto).
// ─────────────────────────────────────────────────────────────

/** Sin espacios y en mayúsculas. */
export function normalizarCodigoFarmacia(raw: string): string {
  return (raw ?? "").replace(/\s+/g, "").toUpperCase();
}

/** Letras, números, punto, guion y guion bajo; hasta 20 caracteres. */
export function esCodigoFarmaciaValido(codigo: string): boolean {
  return /^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(codigo);
}

export const MENSAJE_CODIGO_INVALIDO =
  "Código inválido: usá letras, números, punto o guion (hasta 20 caracteres).";
