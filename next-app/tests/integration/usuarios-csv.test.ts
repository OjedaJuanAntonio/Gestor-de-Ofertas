import { describe, it, expect } from "vitest";
import { parseUsuariosCsv } from "@/lib/import/usuarios-csv";

// ─────────────────────────────────────────────────────────────
// Unit: parser del CSV de alta masiva de usuarios de farmacia.
// ─────────────────────────────────────────────────────────────

describe("parseUsuariosCsv", () => {
  it("parsea farmacia + email + nombre opcional", () => {
    const csv = `farmacia,email,nombre
Farmacia Central 3303,central@farma.com,Operador Central
Farmacia Norte,norte@farma.com,`;
    const { validos, errores } = parseUsuariosCsv(csv);
    expect(errores).toHaveLength(0);
    expect(validos).toHaveLength(2);
    expect(validos[0]).toEqual({ farmacia: "Farmacia Central 3303", email: "central@farma.com", nombre: "Operador Central" });
    expect(validos[1].nombre).toBe(""); // nombre vacío → la acción usará el de la farmacia
  });

  it("normaliza el email a minúsculas", () => {
    const { validos } = parseUsuariosCsv("farmacia,email\nFarma,ABC@Farma.COM");
    expect(validos[0].email).toBe("abc@farma.com");
  });

  it("acepta ';' y alias de columnas (sucursal, mail)", () => {
    const csv = `sucursal;mail
Farmacia Sur;sur@farma.com`;
    const { validos, errores } = parseUsuariosCsv(csv);
    expect(errores).toHaveLength(0);
    expect(validos[0]).toMatchObject({ farmacia: "Farmacia Sur", email: "sur@farma.com" });
  });

  it("falta columna farmacia → error en línea 1", () => {
    const r = parseUsuariosCsv("email\nx@y.com");
    expect(r.validos).toHaveLength(0);
    expect(r.errores[0]).toMatchObject({ linea: 1 });
  });

  it("falta columna email → error en línea 1", () => {
    const r = parseUsuariosCsv("farmacia\nFarma X");
    expect(r.validos).toHaveLength(0);
    expect(r.errores[0]).toMatchObject({ linea: 1 });
  });

  it("email inválido y duplicado en el archivo se reportan", () => {
    const csv = `farmacia,email
Farma A,no-es-email
Farma B,dup@farma.com
Farma C,dup@farma.com`;
    const { validos, errores } = parseUsuariosCsv(csv);
    expect(validos).toHaveLength(1); // solo Farma B
    expect(validos[0].email).toBe("dup@farma.com");
    expect(errores.map((e) => e.linea).sort()).toEqual([2, 4]); // inválido + duplicado
  });
});
