// ─────────────────────────────────────────────────────────────
// Generación de CSV (puro, testeable). Compatible con Excel:
// usa ';' como delimitador (locale es-AR) y BOM UTF-8 opcional.
// ─────────────────────────────────────────────────────────────

export type Columna<T> = { header: string; value: (row: T) => string | number | null };

function escaparCelda(v: string | number | null, delimiter: string): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes('"') || s.includes(delimiter) || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T>(
  rows: T[],
  columnas: Columna<T>[],
  opts: { delimiter?: string; bom?: boolean } = {},
): string {
  const delimiter = opts.delimiter ?? ";";
  const head = columnas.map((c) => escaparCelda(c.header, delimiter)).join(delimiter);
  const body = rows
    .map((row) =>
      columnas.map((c) => escaparCelda(c.value(row), delimiter)).join(delimiter),
    )
    .join("\n");
  const csv = body ? `${head}\n${body}` : head;
  return (opts.bom ? "﻿" : "") + csv;
}
