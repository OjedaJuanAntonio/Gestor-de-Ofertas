// ─────────────────────────────────────────────────────────────
// Fechas en hora de Argentina.
//
// El servidor (Vercel) corre en UTC. Sin fijar la zona, una solicitud
// enviada a las 22:00 aparecía con fecha del día siguiente, y los
// filtros "desde / hasta" quedaban corridos 3 horas. Todo lo que se
// muestra, se filtra por día o se arma a partir de la fecha pasa por
// acá. Argentina no tiene horario de verano: el desfase es fijo (-03:00).
// ─────────────────────────────────────────────────────────────

export const ZONA_HORARIA = "America/Argentina/Buenos_Aires";
const DESFASE = "-03:00";

type Entrada = Date | string | number | null | undefined;

function fmt(opciones: Intl.DateTimeFormatOptions) {
  const f = new Intl.DateTimeFormat("es-AR", { timeZone: ZONA_HORARIA, ...opciones });
  return (d: Entrada, vacio = "—"): string => (d == null ? vacio : f.format(new Date(d)));
}

/** 04/11/26 */
export const fmtFecha = fmt({ day: "2-digit", month: "2-digit", year: "2-digit" });
/** 04/11/2026 */
export const fmtFechaLarga = fmt({ day: "2-digit", month: "2-digit", year: "numeric" });
/** 04/11/26, 22:15 */
export const fmtFechaHora = fmt({
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Componentes de una fecha en hora de Argentina (para armar códigos, agrupar por día). */
export function partesEnArgentina(d: Date): {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
} {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const n = (tipo: string) => Number(p.find((x) => x.type === tipo)?.value ?? 0);
  return {
    anio: n("year"),
    mes: n("month"),
    dia: n("day"),
    hora: n("hour"),
    minuto: n("minute"),
    segundo: n("second"),
  };
}

/** Día calendario en Argentina, como "YYYY-MM-DD". */
export function diaEnArgentina(d: Entrada): string {
  const { anio, mes, dia } = partesEnArgentina(new Date(d ?? Date.now()));
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Instante en que empieza en Argentina el día "YYYY-MM-DD" (o undefined si no es una fecha). */
export function inicioDelDia(yyyyMmDd?: string): Date | undefined {
  if (!yyyyMmDd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return undefined;
  const d = new Date(`${yyyyMmDd}T00:00:00${DESFASE}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
