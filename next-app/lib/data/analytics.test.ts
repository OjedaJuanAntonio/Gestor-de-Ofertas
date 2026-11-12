import { describe, it, expect } from "vitest";
import { desdeHaceMeses, MESES_REPORTE_DEFECTO } from "./analytics";

describe("ventana de los reportes", () => {
  it("el valor por defecto es 12 meses", () => {
    expect(MESES_REPORTE_DEFECTO).toBe(12);
  });

  it("desdeHaceMeses resta meses a una fecha dada", () => {
    const ahora = new Date("2026-11-12T10:00:00Z");
    expect(desdeHaceMeses(12, ahora).toISOString()).toBe("2025-11-12T10:00:00.000Z");
    expect(desdeHaceMeses(3, ahora).toISOString()).toBe("2026-08-12T10:00:00.000Z");
  });
});
