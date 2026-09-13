import { normalizeEan, isValidEanFormat } from "@/lib/business/ean";

// ─────────────────────────────────────────────────────────────
// Parser de CSV de artículos (import masivo del maestro).
// Cabecera esperada (flexible en orden, case-insensitive):
//   codigoBarra, descripcion, laboratorio, categoria, stock
// Pura y testeable: separa filas válidas de errores con su línea.
// ─────────────────────────────────────────────────────────────

export type ArticuloImport = {
  codigoBarra: string;
  descripcion: string;
  laboratorio: string;
  categoria: string | null;
  stockReferencia: number | null;
};

export type ImportError = { linea: number; motivo: string };

export type ParseResult = {
  validos: ArticuloImport[];
  errores: ImportError[];
};

const ALIASES: Record<string, keyof ArticuloImport> = {
  codigobarra: "codigoBarra",
  codigo: "codigoBarra",
  ean: "codigoBarra",
  descripcion: "descripcion",
  descripción: "descripcion",
  detalle: "descripcion",
  laboratorio: "laboratorio",
  lab: "laboratorio",
  categoria: "categoria",
  categoría: "categoria",
  rubro: "categoria",
  stock: "stockReferencia",
  stockreferencia: "stockReferencia",
};

function splitLine(line: string, delimiter: string): string[] {
  // Soporta comillas dobles con delimitador adentro.
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseArticulosCsv(text: string): ParseResult {
  const validos: ArticuloImport[] = [];
  const errores: ImportError[] = [];

  const lines = (text ?? "")
    .split(/\r?\n/)
    .filter((l, i) => l.trim() !== "" || i === 0);
  if (lines.length === 0) return { validos, errores };

  // Detecta delimitador por la cabecera (coma o punto y coma).
  const headerLine = lines[0];
  const delimiter = headerLine.includes(";") ? ";" : ",";
  const header = splitLine(headerLine, delimiter).map((h) =>
    h.toLowerCase().replace(/\s+/g, ""),
  );
  const colMap = header.map((h) => ALIASES[h] ?? null);

  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    const linea = i + 1;
    const cells = splitLine(lines[i], delimiter);

    const row: Partial<ArticuloImport> = {};
    colMap.forEach((key, idx) => {
      if (key) (row as Record<string, unknown>)[key] = cells[idx] ?? "";
    });

    const codigoBarra = normalizeEan(String(row.codigoBarra ?? ""));
    if (!codigoBarra) {
      errores.push({ linea, motivo: "Falta el código de barras" });
      continue;
    }
    if (!isValidEanFormat(codigoBarra)) {
      errores.push({ linea, motivo: `Código inválido: ${codigoBarra}` });
      continue;
    }
    if (seen.has(codigoBarra)) {
      errores.push({ linea, motivo: `Código duplicado en el archivo: ${codigoBarra}` });
      continue;
    }
    const descripcion = String(row.descripcion ?? "").trim();
    if (!descripcion) {
      errores.push({ linea, motivo: "Falta la descripción" });
      continue;
    }
    const laboratorio = String(row.laboratorio ?? "").trim();
    if (!laboratorio) {
      errores.push({ linea, motivo: "Falta el laboratorio" });
      continue;
    }

    const categoriaRaw = String(row.categoria ?? "").trim();
    const stockRaw = String(row.stockReferencia ?? "").trim();
    const stock = stockRaw === "" ? null : Number(stockRaw);
    if (stock !== null && (!Number.isFinite(stock) || stock < 0)) {
      errores.push({ linea, motivo: `Stock inválido: ${stockRaw}` });
      continue;
    }

    seen.add(codigoBarra);
    validos.push({
      codigoBarra,
      descripcion,
      laboratorio,
      categoria: categoriaRaw || null,
      stockReferencia: stock,
    });
  }

  return { validos, errores };
}
