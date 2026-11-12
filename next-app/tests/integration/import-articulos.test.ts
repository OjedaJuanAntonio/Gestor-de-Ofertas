import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { importarArticulos, importarArticulosLote } from "@/lib/actions/admin";
import { guardarArticulos, claveProveedor } from "@/lib/import/articulos-bulk";
import { lookupArticulo } from "@/lib/data/articulos";
import { FILAS_POR_LOTE } from "@/lib/import/limites";

const mockAuth = vi.mocked(auth);

// ─────────────────────────────────────────────────────────────
// Integración: import del maestro de artículos contra Postgres.
// Usa códigos NUEVOS (prefijo 9990) para no pisar datos compartidos.
// ─────────────────────────────────────────────────────────────

const COD1 = "9990000000011";
const COD2 = "9990000000028";
const LAB = "LabTest Importación";

async function limpiar() {
  await prisma.articulo.deleteMany({ where: { codigoBarra: { startsWith: "9990" } } });
  await prisma.proveedor.deleteMany({ where: { nombre: { startsWith: "LabTest", mode: "insensitive" } } });
}

let adminSession: never;

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@drogueria.com" } });
  adminSession = { user: { id: admin.id, role: "ADMIN", email: admin.email } } as never;
  mockAuth.mockResolvedValue(adminSession);
  await limpiar();
});

afterAll(async () => {
  await limpiar();
  await prisma.$disconnect();
});

describe("importarArticulos (CSV de una vez)", () => {
  it("crea artículos nuevos y su proveedor", async () => {
    const csv =
      "codigoBarra,descripcion,laboratorio\n" +
      `${COD1},Producto Test Uno,${LAB}\n` +
      `${COD2},Producto Test Dos,${LAB}\n`;

    const res = await importarArticulos(csv);
    expect(res).toMatchObject({ ok: true, importados: 2 });

    const a1 = await prisma.articulo.findUnique({
      where: { codigoBarra: COD1 },
      include: { proveedor: true },
    });
    expect(a1?.descripcion).toBe("Producto Test Uno");
    expect(a1?.proveedor.nombre).toBe(LAB);
  });

  it("actualiza un artículo existente y lo reactiva", async () => {
    await prisma.articulo.update({ where: { codigoBarra: COD1 }, data: { activo: false } });
    const csv = `codigoBarra,descripcion,laboratorio\n${COD1},Producto Test Uno MODIFICADO,${LAB}\n`;

    expect(await importarArticulos(csv)).toMatchObject({ ok: true, importados: 1 });

    const a1 = await prisma.articulo.findUniqueOrThrow({ where: { codigoBarra: COD1 } });
    expect(a1.descripcion).toBe("Producto Test Uno MODIFICADO");
    expect(a1.activo).toBe(true);
  });

  it("no duplica el proveedor por mayúsculas o espacios de más", async () => {
    const csv =
      "codigoBarra,descripcion,laboratorio\n" +
      `9990000000035,Producto Tres,${LAB.toUpperCase()}\n` +
      `9990000000042,Producto Cuatro,  ${LAB.replace(" ", "   ")}\n`;
    expect(await importarArticulos(csv)).toMatchObject({ ok: true, importados: 2 });

    const provs = await prisma.proveedor.findMany({
      where: { nombre: { equals: LAB, mode: "insensitive" } },
      include: { _count: { select: { articulos: true } } },
    });
    expect(provs).toHaveLength(1);
    expect(provs[0].nombre).toBe(LAB); // conserva la forma en que ya estaba escrito
    expect(provs[0]._count.articulos).toBe(4);
  });

  it("lo importado se ve en la búsqueda de inmediato (invalida la caché)", async () => {
    const antes = await lookupArticulo("9990000000059");
    expect(antes).toBeNull(); // queda cacheado como inexistente
    await importarArticulos(`codigoBarra,descripcion,laboratorio\n9990000000059,Producto Cinco,${LAB}\n`);
    expect((await lookupArticulo("9990000000059"))?.descripcion).toBe("Producto Cinco");
  });

  it("rechaza si no hay filas válidas", async () => {
    expect((await importarArticulos("codigoBarra,descripcion\n")).ok).toBe(false);
  });
});

describe("importarArticulosLote (por tandas, desde el navegador)", () => {
  it("guarda las filas válidas y rechaza las que el servidor no acepta", async () => {
    const res = await importarArticulosLote({
      filas: [
        { codigoBarra: " 999-0000-000110 ", descripcion: "  Con guiones y espacios ", laboratorio: LAB },
        { codigoBarra: "123", descripcion: "EAN corto", laboratorio: LAB },
        { codigoBarra: "9990000000127", descripcion: "   ", laboratorio: LAB },
        { codigoBarra: "9990000000134", descripcion: "Sin laboratorio", laboratorio: "" },
        { codigoBarra: "9990000000141", descripcion: "x".repeat(301), laboratorio: LAB },
      ],
    });
    expect(res).toMatchObject({ ok: true, guardados: 1, rechazados: 4 });

    const a = await prisma.articulo.findUniqueOrThrow({ where: { codigoBarra: "9990000000110" } });
    expect(a.descripcion).toBe("Con guiones y espacios");
    expect(await prisma.articulo.count({ where: { codigoBarra: "9990000000127" } })).toBe(0);
  });

  it("un código repetido dentro de la tanda no rompe: gana el último", async () => {
    const res = await importarArticulosLote({
      filas: [
        { codigoBarra: "9990000000158", descripcion: "Primera versión", laboratorio: LAB },
        { codigoBarra: "9990000000158", descripcion: "Última versión", laboratorio: LAB },
      ],
    });
    expect(res).toMatchObject({ ok: true, guardados: 1 });
    const a = await prisma.articulo.findUniqueOrThrow({ where: { codigoBarra: "9990000000158" } });
    expect(a.descripcion).toBe("Última versión");
  });

  it("no acepta tandas vacías ni más grandes que el límite", async () => {
    expect((await importarArticulosLote({ filas: [] })).ok).toBe(false);
    const enorme = Array.from({ length: FILAS_POR_LOTE + 1 }, (_, i) => ({
      codigoBarra: `9990${String(i).padStart(9, "0")}`,
      descripcion: "x",
      laboratorio: LAB,
    }));
    expect((await importarArticulosLote({ filas: enorme })).ok).toBe(false);
  });

  it("solo el admin puede importar", async () => {
    mockAuth.mockResolvedValue({ user: { id: "x", role: "FARMACIA" } } as never);
    const fila = { codigoBarra: "9990000000165", descripcion: "Intruso", laboratorio: LAB };
    expect(await importarArticulosLote({ filas: [fila] })).toEqual({ ok: false, error: "No autorizado." });
    expect(await importarArticulos(`codigoBarra,descripcion,laboratorio\n9990000000165,Intruso,${LAB}`)).toEqual({
      ok: false,
      error: "No autorizado.",
    });
    expect(await prisma.articulo.count({ where: { codigoBarra: "9990000000165" } })).toBe(0);
    mockAuth.mockResolvedValue(adminSession);
  });
});

describe("guardarArticulos (volumen)", () => {
  it("guarda 12.000 artículos de 300 proveedores en pocas sentencias", async () => {
    const filas = Array.from({ length: 12_000 }, (_, i) => ({
      codigoBarra: `9990${String(100_000 + i).padStart(9, "0")}`,
      descripcion: `Producto volumen ${i}`,
      // La mitad en mayúsculas: no debe duplicar proveedores.
      laboratorio: i % 2 ? `LabTest Volumen ${i % 300}` : `LABTEST VOLUMEN ${i % 300}`,
    }));
    const t0 = Date.now();
    const res = await guardarArticulos(prisma, filas);
    expect(res).toEqual({ guardados: 12_000, proveedoresNuevos: 300 });
    expect(Date.now() - t0).toBeLessThan(15_000);

    expect(await prisma.articulo.count({ where: { codigoBarra: { startsWith: "99900001" } } })).toBe(12_000);
    expect(
      await prisma.proveedor.count({ where: { nombre: { startsWith: "LabTest Volumen", mode: "insensitive" } } }),
    ).toBe(300);

    // Volver a cargar lo mismo no crea nada nuevo.
    expect(await guardarArticulos(prisma, filas)).toEqual({ guardados: 12_000, proveedoresNuevos: 0 });
  });

  it("claveProveedor ignora mayúsculas y espacios, no acentos", () => {
    expect(claveProveedor("  BAYER   S.A. ")).toBe(claveProveedor("Bayer S.A."));
    expect(claveProveedor("Genéricos")).not.toBe(claveProveedor("Genericos"));
  });
});
