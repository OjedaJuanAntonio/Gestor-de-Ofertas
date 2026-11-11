import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetearPassword, importarFarmacias, actualizarFarmacia } from "@/lib/actions/admin";

const mockAuth = vi.mocked(auth);

// ─────────────────────────────────────────────────────────────
// Integración: reset de contraseña e import masivo de farmacias.
// Usa entidades NUEVAS (no del seed) y limpia al final.
// ─────────────────────────────────────────────────────────────

const USER_EMAIL = "reset-test@drogueria.com";
const FARM_A = "ZZ Test Farmacia A";
const FARM_B = "ZZ Test Farmacia B";
const COD_A = "ZZ-TEST-A";
const COD_B = "ZZ-TEST-B";
const COD_C = "ZZ-TEST-C";
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

  await prisma.farmacia.deleteMany({ where: { id: { in: [COD_A, COD_B, COD_C] } } });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: USER_EMAIL } });
  await prisma.farmacia.deleteMany({ where: { id: { in: [COD_A, COD_B, COD_C] } } });
  await prisma.$disconnect();
});

describe("resetearPassword (integración)", () => {
  it("cambia la contraseña (hash nuevo válido)", async () => {
    const res = await resetearPassword({ id: userId, password: "passwordNueva123" });
    expect(res.ok).toBe(true);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await bcrypt.compare("passwordNueva123", u.password)).toBe(true);
    // La clave la eligió el admin: el usuario debe cambiarla al entrar.
    expect(u.mustChangePassword).toBe(true);
    expect(u.claveTemporalVence).not.toBeNull();
  });

  it("rechaza contraseñas cortas (< 10)", async () => {
    const res = await resetearPassword({ id: userId, password: "corta" });
    expect(res.ok).toBe(false);
  });
});

describe("importarFarmacias (integración)", () => {
  it("crea las nuevas, y al re-importar no cambia nada", async () => {
    const csv = `codigo,nombre,email\n${COD_A},${FARM_A},a@farma.com\n${COD_B},${FARM_B},\n`;

    const res1 = await importarFarmacias(csv);
    expect(res1).toMatchObject({ ok: true, creadas: 2, actualizadas: 0, sinCambios: 0, conflictos: [] });
    expect(await prisma.farmacia.count({ where: { id: { in: [COD_A, COD_B, COD_C] } } })).toBe(2);

    const res2 = await importarFarmacias(csv);
    expect(res2).toMatchObject({ ok: true, creadas: 0, actualizadas: 0, sinCambios: 2 });
  });

  it("actualiza nombre y mail de las existentes; un mail vacío no borra el cargado", async () => {
    const csv = `codigo,nombre,email\n${COD_A},${FARM_A} (renombrada),\n${COD_B},${FARM_B},b@farma.com\n`;
    const res = await importarFarmacias(csv);
    expect(res).toMatchObject({ ok: true, creadas: 0, actualizadas: 2 });

    const a = await prisma.farmacia.findUniqueOrThrow({ where: { id: COD_A } });
    expect(a.nombre).toBe(`${FARM_A} (renombrada)`);
    expect(a.email).toBe("a@farma.com"); // se conserva
    const b = await prisma.farmacia.findUniqueOrThrow({ where: { id: COD_B } });
    expect(b.email).toBe("b@farma.com");
  });

  it("normaliza el código: minúsculas y espacios son la misma farmacia", async () => {
    const res = await importarFarmacias(`codigo,nombre\n zz-test-a ,${FARM_A}\n`);
    expect(res).toMatchObject({ ok: true, creadas: 0, actualizadas: 1 });
    expect(await prisma.farmacia.count({ where: { id: { contains: "zz-test-a" } } })).toBe(0);
  });

  it("informa como conflicto un nombre que ya usa otra farmacia (y aplica el resto)", async () => {
    const csv = `codigo,nombre\n${COD_C},${FARM_B}\n`;
    const res = await importarFarmacias(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.creadas).toBe(0);
    expect(res.conflictos).toEqual([
      { codigo: COD_C, nombre: FARM_B, motivo: `El nombre ya lo usa la farmacia ${COD_B}` },
    ]);
    expect(await prisma.farmacia.count({ where: { id: COD_C } })).toBe(0);
  });
});

describe("actualizarFarmacia (integración)", () => {
  it("cambiar el código arrastra a sus usuarios y solicitudes", async () => {
    const u = await prisma.user.create({
      data: {
        email: "operador-zz-test@farma.test",
        nombre: "Operador ZZ",
        password: "x",
        role: "FARMACIA",
        farmaciaId: COD_B,
      },
    });
    const sol = await prisma.solicitud.create({
      data: {
        codigo: `SOL-ZZ-${Date.now()}`,
        idempotencyKey: `SOL-ZZ-${Date.now()}`,
        farmaciaId: COD_B,
        nombreFarmaciaHistorico: FARM_B,
        emailFarmaciaHistorico: "SIN_MAIL",
      },
    });
    try {
      const res = await actualizarFarmacia({ id: COD_B, codigo: " zz-test-c ", nombre: FARM_B, email: "" });
      expect(res.ok).toBe(true);

      expect(await prisma.farmacia.count({ where: { id: COD_B } })).toBe(0);
      const f = await prisma.farmacia.findUniqueOrThrow({ where: { id: COD_C } });
      expect(f.email).toBeNull();
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).farmaciaId).toBe(COD_C);
      expect((await prisma.solicitud.findUniqueOrThrow({ where: { id: sol.id } })).farmaciaId).toBe(COD_C);
    } finally {
      await prisma.solicitud.deleteMany({ where: { id: sol.id } });
      await prisma.user.deleteMany({ where: { id: u.id } });
    }
  });

  it("rechaza un código o nombre que ya tiene otra farmacia, y códigos inválidos", async () => {
    expect((await actualizarFarmacia({ id: COD_C, codigo: COD_A, nombre: FARM_B })).ok).toBe(false);
    expect((await actualizarFarmacia({ id: COD_C, codigo: COD_C, nombre: FARM_A })).ok).toBe(false);
    expect((await actualizarFarmacia({ id: COD_C, codigo: "con/barra", nombre: FARM_B })).ok).toBe(false);
    expect((await actualizarFarmacia({ id: "NO-EXISTE", codigo: "NO-EXISTE", nombre: "Farmacia Fantasma" })).ok).toBe(false);
  });
});
