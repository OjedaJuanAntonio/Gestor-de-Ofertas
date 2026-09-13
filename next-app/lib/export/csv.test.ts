import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

type Row = { nombre: string; cantidad: number; nota: string | null };

describe("toCsv", () => {
  const cols = [
    { header: "Nombre", value: (r: Row) => r.nombre },
    { header: "Cantidad", value: (r: Row) => r.cantidad },
    { header: "Nota", value: (r: Row) => r.nota },
  ];

  it("genera cabecera + filas con ';' por defecto", () => {
    const csv = toCsv([{ nombre: "Aspirina", cantidad: 5, nota: "ok" }], cols);
    expect(csv).toBe("Nombre;Cantidad;Nota\nAspirina;5;ok");
  });

  it("escapa celdas con delimitador, comillas y saltos", () => {
    const csv = toCsv(
      [{ nombre: 'Item "raro"', cantidad: 1, nota: "a;b\nc" }],
      cols,
    );
    expect(csv).toContain('"Item ""raro"""');
    expect(csv).toContain('"a;b\nc"');
  });

  it("maneja null y lista vacía", () => {
    expect(toCsv([{ nombre: "X", cantidad: 0, nota: null }], cols)).toBe(
      "Nombre;Cantidad;Nota\nX;0;",
    );
    expect(toCsv([], cols)).toBe("Nombre;Cantidad;Nota");
  });

  it("agrega BOM si se pide", () => {
    expect(toCsv([], cols, { bom: true }).startsWith("﻿")).toBe(true);
  });
});
