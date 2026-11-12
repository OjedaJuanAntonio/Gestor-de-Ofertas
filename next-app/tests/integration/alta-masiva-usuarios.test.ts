import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { importarUsuariosFarmacia, resetearAClaveTemporal } from "@/lib/actions/admin";

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
  await prisma.farmacia.createMany({
    data: [
      { id: `ALTA-A-${Date.now()}`, nombre: FARM_A },
      { id: `ALTA-B-${Date.now()}`, nombre: FARM_B },
    ],
  });
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

    // Cada alta recibe SU clave (aleatoria, distinta) y solo se devuelve acá.
    expect(res.credenciales.map((c) => c.email).sort()).toEqual([EMAIL_A, EMAIL_B].sort());
    const cA = res.credenciales.find((c) => c.email === EMAIL_A)!;
    const cB = res.credenciales.find((c) => c.email === EMAIL_B)!;
    expect(cA.clave).toMatch(/^[a-z2-9]{10}$/);
    expect(cA.clave).not.toBe(cB.clave);
    expect(await bcrypt.compare(cA.clave, uA.password)).toBe(true);
    expect(await bcrypt.compare("123456", uA.password)).toBe(false);
    // Y vence: no queda una cuenta abierta para siempre.
    expect(uA.claveTemporalVence!.getTime()).toBeGreaterThan(Date.now());
  });

  it("omite emails ya existentes al re-importar (idempotente)", async () => {
    const csv = `farmacia,email\n${FARM_A},${EMAIL_A}\n${FARM_B},${EMAIL_B}`;
    const res = await importarUsuariosFarmacia(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.importados).toBe(0);
    expect(res.omitidos).toBe(2);
    // A quien ya existía no se le genera (ni se le pisa) ninguna clave.
    expect(res.credenciales).toHaveLength(0);
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

describe("importarUsuariosFarmacia por código", () => {
  const EMAIL_COD = "por-codigo@farma.test";

  it("matchea por el código interno de la farmacia y usa su nombre", async () => {
    await prisma.user.deleteMany({ where: { email: EMAIL_COD } });
    const fA = await prisma.farmacia.findUniqueOrThrow({ where: { nombre: FARM_A } });
    try {
      const res = await importarUsuariosFarmacia(`codigo,email\n${fA.id.toLowerCase()},${EMAIL_COD}\nNO-EXISTE-99,otro@farma.test`);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.importados).toBe(1);
      expect(res.noEncontradas).toEqual(["NO-EXISTE-99"]);
      expect(res.credenciales[0]).toMatchObject({ farmacia: FARM_A, email: EMAIL_COD });

      const u = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL_COD } });
      expect(u.farmaciaId).toBe(fA.id);
      expect(u.nombre).toBe(FARM_A);
    } finally {
      await prisma.user.deleteMany({ where: { email: EMAIL_COD } });
    }
  });
});

describe("resetearAClaveTemporal", () => {
  it("genera una clave temporal aleatoria con vencimiento y fuerza el cambio", async () => {
    // El usuario EMAIL_RESET fue creado en el test anterior; lo normalizamos
    // a una contraseña propia y sin flag, para probar el reseteo.
    const u0 = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL_RESET } });
    await prisma.user.update({
      where: { id: u0.id },
      data: { password: await bcrypt.hash("claveLargaPropia1", 10), mustChangePassword: false },
    });

    const res = await resetearAClaveTemporal(u0.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const u = await prisma.user.findUniqueOrThrow({ where: { id: u0.id } });
    expect(u.mustChangePassword).toBe(true);
    expect(await bcrypt.compare(res.clave, u.password)).toBe(true);
    expect(await bcrypt.compare("claveLargaPropia1", u.password)).toBe(false);
    expect(u.claveTemporalVence!.getTime()).toBeGreaterThan(Date.now());

    // Dos reseteos nunca dan la misma clave.
    const res2 = await resetearAClaveTemporal(u0.id);
    expect(res2.ok && res2.clave !== res.clave).toBe(true);
  });
});
