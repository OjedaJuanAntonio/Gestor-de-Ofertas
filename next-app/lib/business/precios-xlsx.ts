// ─────────────────────────────────────────────────────────────
// Helpers puros para el Excel de carga de Precios.
// El Excel que se baja trae una columna ID (id del ítem) y una
// columna CARGADO que el área de Precios completa ("SI") para los
// ítems que ya cargó en el ERP. Al re-subirlo, marcamos en lote.
// ─────────────────────────────────────────────────────────────

export const COL_ID = "ID";
export const COL_CARGADO = "CARGADO";

const MARCAS_POSITIVAS = new Set([
  "si",
  "sí",
  "x",
  "1",
  "true",
  "verdadero",
  "ok",
  "yes",
  "y",
  "cargado",
  "enviado",
]);

/** Interpreta el valor de la celda CARGADO como "ya cargado". */
export function esMarcaCargado(valor: unknown): boolean {
  if (valor === true) return true;
  const s = String(valor ?? "").trim().toLowerCase();
  if (!s) return false;
  return MARCAS_POSITIVAS.has(s);
}

export type FilaImport = { id: string; cargado: boolean };

/** Ids únicos (no vacíos) de las filas marcadas como cargadas. */
export function idsMarcados(filas: FilaImport[]): string[] {
  return [...new Set(filas.filter((f) => f.cargado && f.id.trim()).map((f) => f.id.trim()))];
}
