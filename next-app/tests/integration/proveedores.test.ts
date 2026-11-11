import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  crearProveedor,
  asignarCompradorProveedor,
  toggleProveedor,
} from "@/lib/actions/admin";

const mockAuth = vi.mocked(auth);

// ─────────────────────────────────────────────────────────────
// Integración: ABM de proveedores (laboratorios) por el admin.
// ─────────────────────────────────────────────────────────────

const NOMBRE = "ZZ Proveedor Test";
let compradorId: string;

async function limpiar() {
  await prisma.proveedor.deleteMany({ where: { nombre: NOMBRE } });
}

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@drogueria.com" } });
  mockAuth.mockResolvedValue({ user: { id: admin.id, role: "ADMIN", email: admin.email } } as never);
  const c1 = await prisma.user.findUniqueOrThrow({ where: { email: "c1@drogueria.com" } });
  compradorId = c1.id;
  await limpiar();
});

afterAll(async () => {
  await limpiar();
  await prisma.$disconnect();
});

describe("ABM de proveedores", () => {
  it("crea un proveedor con comprador responsable", async () => {
    const res = await crearProveedor({ nombre: NOMBRE, compradorId });
    expect(res.ok).toBe(true);
    const p = await prisma.proveedor.findUniqueOrThrow({ where: { nombre: NOMBRE } });
    expect(p.compradorId).toBe(compradorId);
    expect(p.activo).toBe(true);
  });

  it("rechaza nombre duplicado", async () => {
    const res = await crearProveedor({ nombre: NOMBRE });
    expect(res.ok).toBe(false);
  });

  it("rechaza el mismo nombre con otras mayúsculas o espacios de más", async () => {
    expect((await crearProveedor({ nombre: NOMBRE.toUpperCase() })).ok).toBe(false);
    expect((await crearProveedor({ nombre: `  ${NOMBRE.replace(" ", "   ")} ` })).ok).toBe(false);
    expect(
      await prisma.proveedor.count({ where: { nombre: { equals: NOMBRE, mode: "insensitive" } } }),
    ).toBe(1);
  });

  it("quita y reasigna el comprador responsable", async () => {
    const p = await prisma.proveedor.findUniqueOrThrow({ where: { nombre: NOMBRE } });
    const r1 = await asignarCompradorProveedor(p.id, null);
    expect(r1.ok).toBe(true);
    expect((await prisma.proveedor.findUniqueOrThrow({ where: { id: p.id } })).compradorId).toBeNull();

    const r2 = await asignarCompradorProveedor(p.id, compradorId);
    expect(r2.ok).toBe(true);
    expect((await prisma.proveedor.findUniqueOrThrow({ where: { id: p.id } })).compradorId).toBe(compradorId);
  });

  it("activa/desactiva el proveedor", async () => {
    const p = await prisma.proveedor.findUniqueOrThrow({ where: { nombre: NOMBRE } });
    await toggleProveedor(p.id, false);
    expect((await prisma.proveedor.findUniqueOrThrow({ where: { id: p.id } })).activo).toBe(false);
  });
});
