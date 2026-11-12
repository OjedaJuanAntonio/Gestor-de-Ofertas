// ─────────────────────────────────────────────────────────────
// Parser de CSV para el alta masiva de usuarios de farmacia.
// Un usuario (login) por farmacia. Cabecera flexible (orden libre,
// case-insensitive, con alias):
//   codigo, email, nombre   (codigo = código interno de la farmacia; recomendado)
//   farmacia, email, nombre (alternativa: por nombre de la farmacia)
// `nombre` es opcional (por defecto, el de la farmacia). El usuario se crea con
// rol FARMACIA y una clave temporal; el matcheo con la farmacia existente (por
// código, o por nombre si no hay código) se hace en la Server Action, no acá.
// Pura y testeable: separa filas válidas de errores con su línea.
// ─────────────────────────────────────────────────────────────

import { normalizarCodigoFarmacia } from "@/lib/business/farmacia";

/** `codigo` (código interno de la farmacia) y/o `farmacia` (su nombre): al menos uno. */
export type UsuarioImport = { codigo: string; farmacia: string; email: string; nombre: string };
export type ImportError = { linea: number; motivo: string };
export type ParseResult = { validos: UsuarioImport[]; errores: ImportError[] };

const ALIASES: Record<string, keyof UsuarioImport> = {
  codigo: "codigo",
  código: "codigo",
  codigofarmacia: "codigo",
  códigofarmacia: "codigo",
  idfarmacia: "codigo",
  farmacia: "farmacia",
  sucursal: "farmacia",
  razonsocial: "farmacia",
  email: "email",
  mail: "email",
  correo: "email",
  nombre: "nombre",
  usuario: "nombre",
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

export function parseUsuariosCsv(text: string): ParseResult {
  const validos: UsuarioImport[] = [];
  const errores: ImportError[] = [];

  const lines = (text ?? "").split(/\r?\n/).filter((l, i) => l.trim() !== "" || i === 0);
  if (lines.length === 0) return { validos, errores };

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const header = splitLine(lines[0], delimiter).map((h) => h.toLowerCase().replace(/\s+/g, ""));
  const colMap = header.map((h) => ALIASES[h] ?? null);

  const hayCodigo = colMap.includes("codigo");
  const hayFarmacia = colMap.includes("farmacia");
  if (!hayCodigo && !hayFarmacia)
    return {
      validos,
      errores: [{ linea: 1, motivo: "Falta la columna 'codigo' (o 'farmacia') para identificar la farmacia." }],
    };
  if (!colMap.includes("email"))
    return { validos, errores: [{ linea: 1, motivo: "Falta la columna 'email'." }] };

  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    const linea = i + 1;
    const cells = splitLine(lines[i], delimiter);

    const row: Partial<UsuarioImport> = {};
    colMap.forEach((key, idx) => {
      if (key) (row as Record<string, unknown>)[key] = cells[idx] ?? "";
    });

    const codigo = normalizarCodigoFarmacia(String(row.codigo ?? ""));
    const farmacia = String(row.farmacia ?? "").trim();
    if (!codigo && farmacia.length < 2) {
      errores.push({
        linea,
        motivo: hayCodigo ? "Falta el código de la farmacia" : "Farmacia faltante o demasiado corta",
      });
      continue;
    }

    const email = String(row.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      errores.push({ linea, motivo: `Email inválido: ${email || "(vacío)"}` });
      continue;
    }
    if (seen.has(email)) {
      errores.push({ linea, motivo: `Email duplicado en el archivo: ${email}` });
      continue;
    }

    seen.add(email);
    validos.push({ codigo, farmacia, email, nombre: String(row.nombre ?? "").trim() });
  }

  return { validos, errores };
}
