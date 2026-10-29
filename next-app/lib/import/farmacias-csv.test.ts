import { describe, it, expect } from "vitest";
import { parseFarmaciasCsv } from "./farmacias-csv";

describe("parseFarmaciasCsv", () => {
  it("parsea nombre + email y acepta email vacío (null)", () => {
    const csv =
      "nombre,email\n" +
      "Farmacia Uno,uno@farma.com\n" +
      "Farmacia Dos,\n";
    const r = parseFarmaciasCsv(csv);
    expect(r.errores).toHaveLength(0);
    expect(r.validos).toEqual([
      { nombre: "Farmacia Uno", email: "uno@farma.com" },
      { nombre: "Farmacia Dos", email: null },
    ]);
  });

  it("acepta alias y punto y coma", () => {
    const csv = "farmacia;mail\nCentral 3303;c@f.com\n";
    const r = parseFarmaciasCsv(csv);
    expect(r.validos).toEqual([{ nombre: "Central 3303", email: "c@f.com" }]);
  });

  it("marca email inválido, nombre corto y duplicado", () => {
    const csv =
      "nombre,email\n" +
      "A,x@y.com\n" + // nombre corto
      "Farmacia Ok,no-es-mail\n" + // email inválido
      "Farmacia Dup,a@b.com\n" +
      "Farmacia Dup,c@d.com\n"; // duplicado
    const r = parseFarmaciasCsv(csv);
    expect(r.validos.map((v) => v.nombre)).toEqual(["Farmacia Dup"]);
    expect(r.errores).toHaveLength(3);
  });

  it("falla si no hay columna nombre", () => {
    const r = parseFarmaciasCsv("email\nx@y.com\n");
    expect(r.validos).toHaveLength(0);
    expect(r.errores[0].motivo).toMatch(/nombre/);
  });
});
