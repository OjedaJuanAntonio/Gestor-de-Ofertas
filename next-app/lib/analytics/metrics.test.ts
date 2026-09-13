import { describe, it, expect } from "vitest";
import {
  promedio,
  mediana,
  tiempoRespuestaComprador,
  tiempoCargaPrecios,
  tasaEfectividadPorComprador,
  volumenDiario,
  type RegistroMetrica,
} from "./metrics";

const d = (s: string) => new Date(s);

const registros: RegistroMetrica[] = [
  {
    fechaEnvio: d("2026-06-10T10:00:00Z"),
    fechaAprobacion: d("2026-06-10T14:00:00Z"), // 4h
    fechaCargaERP: d("2026-06-11T14:00:00Z"), // 24h
    estadoDecision: "APROBADO",
    comprador: "Claudio",
    laboratorio: "Bayer",
  },
  {
    fechaEnvio: d("2026-06-10T10:00:00Z"),
    fechaAprobacion: d("2026-06-10T12:00:00Z"), // 2h
    fechaCargaERP: null,
    estadoDecision: "RECHAZADO",
    comprador: "Claudio",
    laboratorio: "Bayer",
  },
  {
    fechaEnvio: d("2026-06-11T10:00:00Z"),
    fechaAprobacion: null,
    fechaCargaERP: null,
    estadoDecision: "PENDIENTE",
    comprador: "Sandra",
    laboratorio: "Pfizer",
  },
];

describe("promedio y mediana", () => {
  it("promedio", () => expect(promedio([2, 4, 6])).toBe(4));
  it("promedio vacío", () => expect(promedio([])).toBe(0));
  it("mediana impar", () => expect(mediana([3, 1, 2])).toBe(2));
  it("mediana par", () => expect(mediana([1, 2, 3, 4])).toBe(2.5));
});

describe("tiempoRespuestaComprador", () => {
  it("promedia solo los decididos", () => {
    const r = tiempoRespuestaComprador(registros);
    expect(r.muestras).toBe(2);
    expect(r.promedioHoras).toBe(3); // (4 + 2) / 2
  });
});

describe("tiempoCargaPrecios", () => {
  it("solo cuenta los cargados en ERP", () => {
    const r = tiempoCargaPrecios(registros);
    expect(r.muestras).toBe(1);
    expect(r.promedioHoras).toBe(24);
  });
});

describe("tasaEfectividadPorComprador", () => {
  it("calcula aprobados/rechazados y % por comprador", () => {
    const t = tasaEfectividadPorComprador(registros);
    const claudio = t.find((x) => x.clave === "Claudio")!;
    expect(claudio.aprobados).toBe(1);
    expect(claudio.rechazados).toBe(1);
    expect(claudio.pctAprobacion).toBe(50);
    // Sandra está PENDIENTE → no aparece
    expect(t.find((x) => x.clave === "Sandra")).toBeUndefined();
  });
});

describe("volumenDiario", () => {
  it("agrupa por día y ordena", () => {
    const v = volumenDiario(registros);
    expect(v).toEqual([
      { fecha: "2026-06-10", cantidad: 2 },
      { fecha: "2026-06-11", cantidad: 1 },
    ]);
  });
});
