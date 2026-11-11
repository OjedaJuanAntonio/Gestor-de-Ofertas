import { describe, it, expect } from "vitest";
import { parseFarmaciasCsv } from "./farmacias-csv";

describe("parseFarmaciasCsv", () => {
  it("parsea codigo + nombre + email y acepta email vacío (null)", () => {
    const csv =
      "codigo,nombre,email\n" +
      "F001,Farmacia Uno,uno@farma.com\n" +
      "F002,Farmacia Dos,\n";
    const r = parseFarmaciasCsv(csv);
    expect(r.errores).toHaveLength(0);
    expect(r.validos).toEqual([
      { codigo: "F001", nombre: "Farmacia Uno", email: "uno@farma.com" },
      { codigo: "F002", nombre: "Farmacia Dos", email: null },
    ]);
  });

  it("acepta alias y punto y coma", () => {
    const csv = "id;farmacia;mail\n3303;Central 3303;c@f.com\n";
    const r = parseFarmaciasCsv(csv);
    expect(r.validos).toEqual([{ codigo: "3303", nombre: "Central 3303", email: "c@f.com" }]);
  });

  it("marca email inválido, nombre corto, código faltante y duplicado", () => {
    const csv =
      "codigo,nombre,email\n" +
      "F010,A,x@y.com\n" + // nombre corto
      "F011,Farmacia Ok,no-es-mail\n" + // email inválido
      ",Sin Código,a@b.com\n" + // falta código
      "F012,Farmacia Dup,a@b.com\n" +
      "F012,Farmacia Dup,c@d.com\n"; // código duplicado
    const r = parseFarmaciasCsv(csv);
    expect(r.validos.map((v) => v.nombre)).toEqual(["Farmacia Dup"]);
    expect(r.errores).toHaveLength(4);
  });

  it("normaliza el código (mayúsculas, sin espacios) y conserva ceros a la izquierda", () => {
    const r = parseFarmaciasCsv("codigo,nombre\n f 001 ,Farmacia Uno\n0012,Farmacia Dos\n");
    expect(r.errores).toHaveLength(0);
    expect(r.validos.map((v) => v.codigo)).toEqual(["F001", "0012"]);
  });

  it("\"f001\" y \"F001\" son el mismo código (duplicado) y rechaza códigos con símbolos raros", () => {
    const r = parseFarmaciasCsv("codigo,nombre\nf001,Farmacia Uno\nF001,Farmacia Dos\nA/1,Farmacia Tres\n");
    expect(r.validos).toHaveLength(1);
    expect(r.errores.map((e) => e.linea)).toEqual([3, 4]);
  });

  it("falla si no hay columna codigo", () => {
    const r = parseFarmaciasCsv("nombre,email\nFarmacia Uno,x@y.com\n");
    expect(r.validos).toHaveLength(0);
    expect(r.errores[0].motivo).toMatch(/codigo/);
  });

  it("falla si no hay columna nombre", () => {
    const r = parseFarmaciasCsv("codigo,email\nF001,x@y.com\n");
    expect(r.validos).toHaveLength(0);
    expect(r.errores[0].motivo).toMatch(/nombre/);
  });
});
