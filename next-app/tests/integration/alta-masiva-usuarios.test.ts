import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { importarUsuariosFarmacia, resetearAClaveTemporal } from "@/lib/actions/admin";
import { CLAVE_TEMPORAL } from "@/lib/password";

const mockAuth = vi.mocked(auth);

// ─────────────────────────────────────────────────────────────
// Integración: alta masiva de usuarios de farmacia + reseteo a clave temporal.
// Usa farmacias/usuarios nuevos (no del seed) y limpia al final.
// ─────────────────────────────────────────────────────────────

const FARM_A = "ZZ Alta Masiva A";
const FARM_B = "ZZ Alta Masiva B";
const EMAIL_A = "am-a@farma.test";
const EMAIL_B = "am-b@farma.test";
const EMAIL_RESET = "am-reset@farma.test";
const EMAILS = [EMAIL_A, EMAIL_B, EMAIL_RESET];

async function limpiar() {
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.farmacia.deleteMany({ where: { nombre: { in: [FARM_A, FARM_B] } } });
}

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@drogueria.com" } });
  mockAuth.mockResolvedValue({ user: { id: admin.id, role: "ADMIN", email: admin.email } } as never);
  await limpiar();
  await prisma.farmacia.createMany({ data: [{ nombre: FARM_A }, { nombre: FARM_B }] });
});

afterAll(async () => {
  await limpiar();
  await prisma.$disconnect();
});

describe("importarUsuariosFarmacia", () => {
  it("crea un login FARMACIA por fila con clave temporal y mustChangePassword", async () => {
    const csv = `farmacia,email
${FARM_A},${EMAIL_A}
${FARM_B},${EMAIL_B}
ZZ No Existe,fantasma@farma.test`;

    const res = await importarUsuariosFarmacia(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.importados).toBe(2);
    expect(res.omitidos).toBe(0);
    expect(res.noEncontradas).toContain("ZZ No Existe");

    const uA = await prisma.user.findUniqueOrThrow({
      where: { email: EMAIL_A },
      include: { farmacia: true },
    });
    expect(uA.role).toBe("FARMACIA");
    expect(uA.mustChangePassword).toBe(true);
    expect(uA.farmacia?.nombre).toBe(FARM_A);
    expect(await bcrypt.compare(CLAVE_TEMPORAL, uA.password)).toBe(true);
  });

  it("omite emails ya existentes al re-importar (idempotente)", async () => {
    const csv = `farmacia,email\n${FARM_A},${EMAIL_A}\n${FARM_B},${EMAIL_B}`;
    const res = await importarUsuariosFarmacia(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.importados).toBe(0);
    expect(res.omitidos).toBe(2);
  });

  it("matchea la farmacia aunque difiera la capitalización", async () => {
    const csv = `farmacia,email\n${FARM_A.toUpperCase()},${EMAIL_RESET}`;
    const res = await importarUsuariosFarmacia(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.importados).toBe(1);
    expect(res.noEncontradas).toHaveLength(0);
  });
});

describe("resetearAClaveTemporal", () => {
  it("deja la clave temporal y fuerza el cambio", async () => {
    // El usuario EMAIL_RESET fue creado en el test anterior; lo normalizamos
    // a una contraseña propia y sin flag, para probar el reseteo.
    const u0 = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL_RESET } });
    await prisma.user.update({
      where: { id: u0.id },
      data: { password: await bcrypt.hash("claveLargaPropia1", 10), mustChangePassword: false },
    });

    const res = await resetearAClaveTemporal(u0.id);
    expect(res.ok).toBe(true);

    const u = await prisma.user.findUniqueOrThrow({ where: { id: u0.id } });
    expect(u.mustChangePassword).toBe(true);
    expect(await bcrypt.compare(CLAVE_TEMPORAL, u.password)).toBe(true);
  });
});
