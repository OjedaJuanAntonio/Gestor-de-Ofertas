// ─────────────────────────────────────────────────────────────
// Métricas gerenciales (Sección 7 del prompt). Funciones puras y
// testeables que operan sobre registros planos de ítems.
// ─────────────────────────────────────────────────────────────

export type RegistroMetrica = {
  fechaEnvio: Date;
  fechaAprobacion: Date | null;
  fechaCargaERP: Date | null;
  estadoDecision: "PENDIENTE" | "APROBADO" | "RECHAZADO";
  comprador: string; // nombre o "(sin asignar)"
  laboratorio: string;
};

const MS_POR_HORA = 1000 * 60 * 60;

export function promedio(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function mediana(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function horasEntre(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  return (new Date(b).getTime() - new Date(a).getTime()) / MS_POR_HORA;
}

/** Tiempo de respuesta del comprador (envío → aprobación), en horas. */
export function tiempoRespuestaComprador(registros: RegistroMetrica[]) {
  const horas = registros
    .map((r) => horasEntre(r.fechaEnvio, r.fechaAprobacion))
    .filter((h): h is number => h !== null && h >= 0);
  return { promedioHoras: promedio(horas), medianaHoras: mediana(horas), muestras: horas.length };
}

/** Tiempo de carga de Precios (aprobación → carga ERP), en horas. */
export function tiempoCargaPrecios(registros: RegistroMetrica[]) {
  const horas = registros
    .map((r) => horasEntre(r.fechaAprobacion, r.fechaCargaERP))
    .filter((h): h is number => h !== null && h >= 0);
  return { promedioHoras: promedio(horas), medianaHoras: mediana(horas), muestras: horas.length };
}

export type TasaEfectividad = {
  clave: string;
  aprobados: number;
  rechazados: number;
  total: number;
  pctAprobacion: number;
};

function tasaPor(
  registros: RegistroMetrica[],
  key: (r: RegistroMetrica) => string,
): TasaEfectividad[] {
  const mapa = new Map<string, { aprobados: number; rechazados: number }>();
  for (const r of registros) {
    if (r.estadoDecision === "PENDIENTE") continue;
    const k = key(r);
    const acc = mapa.get(k) ?? { aprobados: 0, rechazados: 0 };
    if (r.estadoDecision === "APROBADO") acc.aprobados++;
    else acc.rechazados++;
    mapa.set(k, acc);
  }
  return [...mapa.entries()]
    .map(([clave, v]) => {
      const total = v.aprobados + v.rechazados;
      return {
        clave,
        aprobados: v.aprobados,
        rechazados: v.rechazados,
        total,
        pctAprobacion: total ? Math.round((v.aprobados / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export const tasaEfectividadPorComprador = (r: RegistroMetrica[]) =>
  tasaPor(r, (x) => x.comprador);
export const tasaEfectividadPorLaboratorio = (r: RegistroMetrica[]) =>
  tasaPor(r, (x) => x.laboratorio);

export type PuntoVolumen = { fecha: string; cantidad: number };

/** Volumen de ítems ingresados por día (YYYY-MM-DD), ordenado asc. */
export function volumenDiario(registros: RegistroMetrica[]): PuntoVolumen[] {
  const mapa = new Map<string, number>();
  for (const r of registros) {
    const f = new Date(r.fechaEnvio).toISOString().slice(0, 10);
    mapa.set(f, (mapa.get(f) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([fecha, cantidad]) => ({ fecha, cantidad }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}
