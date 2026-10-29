import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetearPassword, importarFarmacias } from "@/lib/actions/admin";

const mockAuth = vi.mocked(auth);

// ─────────────────────────────────────────────────────────────
// Integración: reset de contraseña e import masivo de farmacias.
// Usa entidades NUEVAS (no del seed) y limpia al final.
// ─────────────────────────────────────────────────────────────

const USER_EMAIL = "reset-test@drogueria.com";
const FARM_A = "ZZ Test Farmacia A";
const FARM_B = "ZZ Test Farmacia B";
let userId: string;

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@drogueria.com" } });
  mockAuth.mockResolvedValue({ user: { id: admin.id, role: "ADMIN", email: admin.email } } as never);

  await prisma.user.deleteMany({ where: { email: USER_EMAIL } });
  const u = await prisma.user.create({
    data: {
      email: USER_EMAIL,
      nombre: "Usuario Reset",
      password: await bcrypt.hash("passwordVieja1", 10),
      role: "PRECIOS",
    },
  });
  userId = u.id;

  await prisma.farmacia.deleteMany({ where: { nombre: { in: [FARM_A, FARM_B] } } });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: USER_EMAIL } });
  await prisma.farmacia.deleteMany({ where: { nombre: { in: [FARM_A, FARM_B] } } });
  await prisma.$disconnect();
});

describe("resetearPassword (integración)", () => {
  it("cambia la contraseña (hash nuevo válido)", async () => {
    const res = await resetearPassword({ id: userId, password: "passwordNueva123" });
    expect(res.ok).toBe(true);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await bcrypt.compare("passwordNueva123", u.password)).toBe(true);
  });

  it("rechaza contraseñas cortas (< 10)", async () => {
    const res = await resetearPassword({ id: userId, password: "corta" });
    expect(res.ok).toBe(false);
  });
});

describe("importarFarmacias (integración)", () => {
  it("crea farmacias nuevas y omite duplicados al re-importar", async () => {
    const csv = `nombre,email\n${FARM_A},a@farma.com\n${FARM_B},\n`;

    const res1 = await importarFarmacias(csv);
    expect(res1.ok).toBe(true);
    if (!res1.ok) return;
    expect(res1.importados).toBe(2);
    expect(res1.omitidos).toBe(0);

    const count = await prisma.farmacia.count({ where: { nombre: { in: [FARM_A, FARM_B] } } });
    expect(count).toBe(2);

    const res2 = await importarFarmacias(csv);
    expect(res2.ok).toBe(true);
    if (!res2.ok) return;
    expect(res2.importados).toBe(0);
    expect(res2.omitidos).toBe(2);
  });
});
