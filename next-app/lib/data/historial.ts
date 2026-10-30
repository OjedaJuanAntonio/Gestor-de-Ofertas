import "server-only";

// ─────────────────────────────────────────────────────────────
// Helpers compartidos por los historiales: dirección de orden y
// filtro por rango de fechas (a partir de strings YYYY-MM-DD de los
// <input type="date">). La lista de columnas ordenables la define
// cada consulta (allowlist), para no exponer campos arbitrarios.
// ─────────────────────────────────────────────────────────────

export type Dir = "asc" | "desc";

export function normalizarDir(dir?: string): Dir {
  return dir === "asc" ? "asc" : "desc";
}

function parseDia(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Filtro Prisma de rango de fechas, inclusivo en ambos extremos.
 * `hasta` incluye todo su día (gte desde 00:00, lt el día siguiente).
 * Devuelve undefined si no hay fechas válidas.
 */
export function rangoFecha(
  desde?: string,
  hasta?: string,
): { gte?: Date; lt?: Date } | undefined {
  const g = parseDia(desde);
  const h = parseDia(hasta);
  if (!g && !h) return undefined;
  const out: { gte?: Date; lt?: Date } = {};
  if (g) out.gte = g;
  if (h) out.lt = new Date(h.getTime() + 24 * 60 * 60 * 1000);
  return out;
}
