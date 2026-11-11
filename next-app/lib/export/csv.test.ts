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

  it("neutraliza textos que Excel tomaría como fórmula; los números no", () => {
    const csv = toCsv(
      [
        { nombre: "=HYPERLINK(\"http://x\")", cantidad: -5, nota: "+54 11" },
        { nombre: "@cmd", cantidad: 1, nota: "-ojo" },
      ],
      cols,
    );
    const [, f1, f2] = csv.split("\n");
    expect(f1.startsWith(`"'=HYPERLINK`)).toBe(true);
    expect(f1).toContain(";-5;"); // número negativo intacto
    expect(f1.endsWith("'+54 11")).toBe(true);
    expect(f2).toBe("'@cmd;1;'-ojo");
  });

  it("agrega BOM si se pide", () => {
    expect(toCsv([], cols, { bom: true }).startsWith("﻿")).toBe(true);
  });
});
