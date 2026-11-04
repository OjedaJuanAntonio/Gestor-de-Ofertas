import { describe, it, expect } from "vitest";
import { parseArticulosCsv } from "./articulos-csv";

describe("parseArticulosCsv", () => {
  it("parsea filas válidas con cabecera estándar (coma)", () => {
    const csv = [
      "codigoBarra,descripcion,laboratorio",
      "7791234500011,Aspirina 500mg,Bayer",
      "7791234500028,Bepanthen 30g,Bayer",
    ].join("\n");
    const r = parseArticulosCsv(csv);
    expect(r.errores).toHaveLength(0);
    expect(r.validos).toHaveLength(2);
    expect(r.validos[0]).toMatchObject({
      codigoBarra: "7791234500011",
      laboratorio: "Bayer",
    });
  });

  it("soporta delimitador punto y coma, alias de columnas e ignora columnas extra", () => {
    const csv = ["EAN;Detalle;Lab;Rubro", "7791234500066;Lipitor;Pfizer;Cardio"].join(
      "\n",
    );
    const r = parseArticulosCsv(csv);
    expect(r.validos).toHaveLength(1);
    expect(r.validos[0].descripcion).toBe("Lipitor");
    expect(r.validos[0].laboratorio).toBe("Pfizer");
  });

  it("normaliza EAN con espacios/guiones", () => {
    const csv = ["codigo,descripcion,laboratorio", " 779-123-4500097 ,Novalgina,Sanofi"].join(
      "\n",
    );
    const r = parseArticulosCsv(csv);
    expect(r.validos[0].codigoBarra).toBe("7791234500097");
  });

  it("reporta errores por código faltante, inválido, duplicado y campos vacíos", () => {
    const csv = [
      "codigoBarra,descripcion,laboratorio",
      ",Sin codigo,Bayer", // falta código
      "123,Corto,Bayer", // inválido (muy corto)
      "7791234500011,Aspirina,Bayer",
      "7791234500011,Aspirina dup,Bayer", // duplicado
      "7791234500028,,Bayer", // falta descripción
      "7791234500035,Redoxon,", // falta laboratorio
    ].join("\n");
    const r = parseArticulosCsv(csv);
    expect(r.validos).toHaveLength(1);
    expect(r.errores.map((e) => e.linea)).toEqual([2, 3, 5, 6, 7]);
  });

  it("maneja comillas con delimitador adentro", () => {
    const csv = [
      "codigoBarra,descripcion,laboratorio",
      '7791234500011,"Aspirina 500mg, x20",Bayer',
    ].join("\n");
    const r = parseArticulosCsv(csv);
    expect(r.validos[0].descripcion).toBe("Aspirina 500mg, x20");
  });

  it("CSV vacío no rompe", () => {
    expect(parseArticulosCsv("")).toEqual({ validos: [], errores: [] });
  });
});
