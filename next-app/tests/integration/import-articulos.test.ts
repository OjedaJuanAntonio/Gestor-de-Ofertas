import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { importarArticulos } from "@/lib/actions/admin";

const mockAuth = vi.mocked(auth);

// ─────────────────────────────────────────────────────────────
// Integración: import de artículos por lotes contra Postgres.
// Usa códigos NUEVOS (no del seed) para no pisar datos compartidos.
// ─────────────────────────────────────────────────────────────

const COD1 = "9990000000011";
const COD2 = "9990000000028";

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@drogueria.com" } });
  mockAuth.mockResolvedValue({
    user: { id: admin.id, role: "ADMIN", email: admin.email },
  } as never);
  await prisma.articulo.deleteMany({ where: { codigoBarra: { in: [COD1, COD2] } } });
});

afterAll(async () => {
  await prisma.articulo.deleteMany({ where: { codigoBarra: { in: [COD1, COD2] } } });
  await prisma.$disconnect();
});

describe("importarArticulos (integración, por lotes)", () => {
  it("crea artículos nuevos", async () => {
    const csv =
      "codigoBarra,descripcion,laboratorio,categoria,stock\n" +
      `${COD1},Producto Test Uno,LabTest,Rubro,100\n` +
      `${COD2},Producto Test Dos,LabTest,Rubro,50\n`;

    const res = await importarArticulos(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.importados).toBe(2);

    const a1 = await prisma.articulo.findUnique({ where: { codigoBarra: COD1 } });
    expect(a1?.descripcion).toBe("Producto Test Uno");
    expect(a1?.laboratorio).toBe("LabTest");
  });

  it("actualiza un artículo existente (upsert)", async () => {
    const csv =
      "codigoBarra,descripcion,laboratorio,categoria,stock\n" +
      `${COD1},Producto Test Uno MODIFICADO,LabTest,Rubro,999\n`;

    const res = await importarArticulos(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.importados).toBe(1);

    const a1 = await prisma.articulo.findUnique({ where: { codigoBarra: COD1 } });
    expect(a1?.descripcion).toBe("Producto Test Uno MODIFICADO");
    expect(a1?.stockReferencia).toBe(999);
  });

  it("rechaza si no hay filas válidas", async () => {
    const res = await importarArticulos("codigoBarra,descripcion\n");
    expect(res.ok).toBe(false);
  });
});
