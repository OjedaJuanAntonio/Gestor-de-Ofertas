// ─────────────────────────────────────────────────────────────
// Parser de CSV de farmacias (alta masiva).
// Cabecera flexible (orden libre, case-insensitive, con alias):
//   codigo, nombre, email   (codigo es el id/código interno de la farmacia)
// Pura y testeable: separa filas válidas de errores con su línea.
// ─────────────────────────────────────────────────────────────

import {
  normalizarCodigoFarmacia,
  esCodigoFarmaciaValido,
  MENSAJE_CODIGO_INVALIDO,
} from "@/lib/business/farmacia";

export type FarmaciaImport = { codigo: string; nombre: string; email: string | null };
export type ImportError = { linea: number; motivo: string };
export type ParseResult = { validos: FarmaciaImport[]; errores: ImportError[] };

const ALIASES: Record<string, keyof FarmaciaImport> = {
  codigo: "codigo",
  código: "codigo",
  id: "codigo",
  nombre: "nombre",
  farmacia: "nombre",
  razonsocial: "nombre",
  email: "email",
  mail: "email",
  correo: "email",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitLine(line: string, delimiter: string): string[] {
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

export function parseFarmaciasCsv(text: string): ParseResult {
  const validos: FarmaciaImport[] = [];
  const errores: ImportError[] = [];

  const lines = (text ?? "").split(/\r?\n/).filter((l, i) => l.trim() !== "" || i === 0);
  if (lines.length === 0) return { validos, errores };

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const header = splitLine(lines[0], delimiter).map((h) => h.toLowerCase().replace(/\s+/g, ""));
  const colMap = header.map((h) => ALIASES[h] ?? null);

  if (!colMap.includes("codigo")) {
    return { validos, errores: [{ linea: 1, motivo: "Falta la columna 'codigo'." }] };
  }
  if (!colMap.includes("nombre")) {
    return { validos, errores: [{ linea: 1, motivo: "Falta la columna 'nombre'." }] };
  }

  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    const linea = i + 1;
    const cells = splitLine(lines[i], delimiter);

    const row: Partial<FarmaciaImport> = {};
    colMap.forEach((key, idx) => {
      if (key) (row as Record<string, unknown>)[key] = cells[idx] ?? "";
    });

    const codigo = normalizarCodigoFarmacia(String(row.codigo ?? ""));
    if (!codigo) {
      errores.push({ linea, motivo: "Falta el código" });
      continue;
    }
    if (!esCodigoFarmaciaValido(codigo)) {
      errores.push({ linea, motivo: `${MENSAJE_CODIGO_INVALIDO} (${codigo})` });
      continue;
    }
    const nombre = String(row.nombre ?? "").trim();
    if (nombre.length < 2) {
      errores.push({ linea, motivo: "Nombre faltante o demasiado corto" });
      continue;
    }
    if (seen.has(codigo)) {
      errores.push({ linea, motivo: `Código duplicado en el archivo: ${codigo}` });
      continue;
    }

    const emailRaw = String(row.email ?? "").trim();
    if (emailRaw && !EMAIL_RE.test(emailRaw)) {
      errores.push({ linea, motivo: `Email inválido: ${emailRaw}` });
      continue;
    }

    seen.add(codigo);
    validos.push({ codigo, nombre, email: emailRaw || null });
  }

  return { validos, errores };
}
