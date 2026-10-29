import type { MotivoSolicitud } from "@prisma/client";
import { isValidEanFormat, normalizeEan } from "./ean";

// ─────────────────────────────────────────────────────────────
// Validación de filas de la grilla de carga (Módulo 1).
// Pura: la UI la usa para pintar celdas y el Server Action la
// re-ejecuta en el servidor (nunca confiar solo en el cliente).
// ─────────────────────────────────────────────────────────────

export type GridRowInput = {
  codigoBarra: string;
  /** Si el lookup encontró el artículo en el maestro. */
  articuloExiste: boolean;
  cantidad: number | "";
  motivo: MotivoSolicitud | "";
  fechaVencimiento: string; // "MM/AA"
};

export type RowValidation = { ok: boolean; error?: string };

/** Valida "MM/AA": mes 01-12, año 2 dígitos. */
export function isValidVencimiento(mmYY: string): boolean {
  const m = /^(\d{2})\/(\d{2})$/.exec((mmYY ?? "").trim());
  if (!m) return false;
  const mes = Number(m[1]);
  return mes >= 1 && mes <= 12;
}

export function validateRow(row: GridRowInput): RowValidation {
  const ean = normalizeEan(row.codigoBarra);

  if (!ean) return { ok: false, error: "Ingresá un código de barras" };
  if (!isValidEanFormat(ean))
    return { ok: false, error: "Código de barras inválido" };
  if (!row.articuloExiste)
    return { ok: false, error: "Producto inexistente" };

  if (row.cantidad === "" || !Number.isInteger(row.cantidad) || row.cantidad <= 0)
    return { ok: false, error: "La cantidad debe ser un entero mayor a cero" };

  if (!row.motivo) return { ok: false, error: "Elegí un motivo" };

  // La fecha de vencimiento es obligatoria para TODOS los motivos salvo
  // PROBADOR/tester (un probador no tiene un vencimiento comercial relevante).
  if (row.motivo !== "PROBADOR") {
    if (!row.fechaVencimiento?.trim())
      return { ok: false, error: "Falta la fecha de vencimiento (MM/AA)" };
    if (!isValidVencimiento(row.fechaVencimiento))
      return { ok: false, error: "Fecha de vencimiento inválida (usá MM/AA)" };
  }

  return { ok: true };
}

/** True solo si TODAS las filas (no vacías) son válidas y hay al menos una. */
export function validateGrid(rows: GridRowInput[]): {
  ok: boolean;
  errores: { index: number; error: string }[];
} {
  const errores: { index: number; error: string }[] = [];
  rows.forEach((row, index) => {
    const v = validateRow(row);
    if (!v.ok) errores.push({ index, error: v.error! });
  });
  return { ok: errores.length === 0 && rows.length > 0, errores };
}
