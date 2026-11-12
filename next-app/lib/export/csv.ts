// ─────────────────────────────────────────────────────────────
// Generación de CSV (puro, testeable). Compatible con Excel:
// usa ';' como delimitador (locale es-AR) y BOM UTF-8 opcional.
// ─────────────────────────────────────────────────────────────

export type Columna<T> = { header: string; value: (row: T) => string | number | null };

/**
 * Un texto que empieza con = + - @ (o tab / retorno) es interpretado por Excel
 * como FÓRMULA al abrir el CSV. Si ese texto lo escribió un usuario (una
 * observación, un nombre), podría ejecutar algo en la PC de quien abre el
 * archivo. Se neutraliza anteponiendo un apóstrofo. Los números no se tocan.
 */
function neutralizarFormula(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function escaparCelda(v: string | number | null, delimiter: string): string {
  const s =
    v === null || v === undefined ? "" : typeof v === "number" ? String(v) : neutralizarFormula(v);
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
