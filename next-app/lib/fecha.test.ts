import { describe, it, expect } from "vitest";
import { fmtFecha, fmtFechaHora, diaEnArgentina, inicioDelDia, partesEnArgentina } from "./fecha";
import { generateSolicitudCodigo } from "./business/solicitud";
import { volumenDiario, type RegistroMetrica } from "./analytics/metrics";

// 05/11/2026 01:30 UTC = 04/11/2026 22:30 en Argentina.
const NOCHE = new Date("2026-11-05T01:30:00Z");

describe("fechas en hora de Argentina", () => {
  it("lo cargado a la noche conserva la fecha de Argentina, no la del servidor (UTC)", () => {
    expect(fmtFecha(NOCHE)).toBe("04/11/26");
    expect(fmtFechaHora(NOCHE)).toMatch(/^04\/11\/26,? 22:30$/);
    expect(diaEnArgentina(NOCHE)).toBe("2026-11-04");
    expect(partesEnArgentina(NOCHE)).toMatchObject({ dia: 4, hora: 22, minuto: 30 });
  });

  it("valores vacíos", () => {
    expect(fmtFecha(null)).toBe("—");
    expect(fmtFecha(undefined, "")).toBe("");
  });

  it("el día empieza a las 00:00 de Argentina (03:00 UTC)", () => {
    expect(inicioDelDia("2026-11-04")?.toISOString()).toBe("2026-11-04T03:00:00.000Z");
    expect(inicioDelDia("no-es-fecha")).toBeUndefined();
    expect(inicioDelDia("2026-13-45")).toBeUndefined();
    expect(inicioDelDia(undefined)).toBeUndefined();
  });

  it("el código de la solicitud usa la fecha y hora de Argentina", () => {
    expect(generateSolicitudCodigo(NOCHE, "ABCD")).toBe("SOL-261104-223000-ABCD");
  });

  it("el volumen diario agrupa por día de Argentina", () => {
    const r = (fechaEnvio: string): RegistroMetrica => ({
      fechaEnvio: new Date(fechaEnvio),
      fechaAprobacion: null,
      fechaCargaERP: null,
      estadoDecision: "PENDIENTE",
      comprador: "x",
      laboratorio: "y",
    });
    // 22:30 del 4 y 09:00 del 4 (hora Argentina) → mismo día; 00:10 del 5 → otro.
    const v = volumenDiario([r("2026-11-05T01:30:00Z"), r("2026-11-04T12:00:00Z"), r("2026-11-05T03:10:00Z")]);
    expect(v).toEqual([
      { fecha: "2026-11-04", cantidad: 2 },
      { fecha: "2026-11-05", cantidad: 1 },
    ]);
  });
});
