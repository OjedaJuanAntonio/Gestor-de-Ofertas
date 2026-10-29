import { describe, it, expect } from "vitest";
import { esMarcaCargado, idsMarcados } from "./precios-xlsx";

describe("esMarcaCargado", () => {
  it("reconoce marcas positivas (varias formas)", () => {
    for (const v of ["SI", "sí", " si ", "X", "1", "true", "OK", "cargado", "ENVIADO", true]) {
      expect(esMarcaCargado(v)).toBe(true);
    }
  });

  it("trata vacío / NO / 0 como no cargado", () => {
    for (const v of ["", "   ", "NO", "0", "false", null, undefined, "tal vez"]) {
      expect(esMarcaCargado(v)).toBe(false);
    }
  });
});

describe("idsMarcados", () => {
  it("devuelve solo los ids marcados, sin vacíos ni duplicados", () => {
    const ids = idsMarcados([
      { id: "a", cargado: true },
      { id: "b", cargado: false },
      { id: "c", cargado: true },
      { id: "a", cargado: true }, // duplicado
      { id: "  ", cargado: true }, // vacío
      { id: "", cargado: true },
    ]);
    expect(ids).toEqual(["a", "c"]);
  });
});
