import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";

vi.mock("@/lib/auth", () => ({ auth: vi.fn(), signOut: vi.fn() }));

import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cambiarMiPassword } from "@/lib/actions/cuenta";

const mockAuth = vi.mocked(auth);
const mockSignOut = vi.mocked(signOut);

// ─────────────────────────────────────────────────────────────
// Integración: cambio de contraseña propia.
//  - Obligatorio (clave temporal): no pide la actual; baja el flag y el
//    vencimiento, y cierra sesión.
//  - Voluntario: exige la contraseña actual.
// ─────────────────────────────────────────────────────────────

const EMAIL = "cambio-pass@farma.test";
const TEMPORAL = "k7m2p9x4wq";
let userId: string;

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const u = await prisma.user.create({
    data: {
      email: EMAIL,
      nombre: "Usuario Cambio",
      password: await bcrypt.hash(TEMPORAL, 10),
      role: "PRECIOS",
      mustChangePassword: true,
      claveTemporalVence: new Date(Date.now() + 86_400_000),
    },
  });
  userId = u.id;
  mockAuth.mockResolvedValue({ user: { id: userId } } as never);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

describe("cambiarMiPassword — cambio obligatorio", () => {
  it("rechaza contraseñas cortas (< 8) sin tocar la base", async () => {
    const res = await cambiarMiPassword({ password: "corta" });
    expect(res.ok).toBe(false);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.mustChangePassword).toBe(true); // sigue obligado
  });

  it("rechaza reusar la clave temporal (la actual)", async () => {
    const res = await cambiarMiPassword({ password: TEMPORAL });
    expect(res).toEqual({ ok: false, error: "Elegí una contraseña distinta a la actual." });
  });

  it("rechaza contraseñas demasiado comunes", async () => {
    for (const comun of ["12345678", "Farmacia123", "password"]) {
      const res = await cambiarMiPassword({ password: comun });
      expect(res.ok, comun).toBe(false);
    }
  });

  it("cambia la contraseña, baja el flag y el vencimiento, y cierra sesión", async () => {
    mockSignOut.mockClear();
    const res = await cambiarMiPassword({ password: "miClaveNueva1" });
    expect(res.ok).toBe(true);
    expect(mockSignOut).toHaveBeenCalledOnce();

    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.mustChangePassword).toBe(false);
    expect(u.claveTemporalVence).toBeNull();
    expect(await bcrypt.compare("miClaveNueva1", u.password)).toBe(true);
  });
});

describe("cambiarMiPassword — cambio voluntario", () => {
  it("sin la contraseña actual (o con una incorrecta) no cambia nada", async () => {
    expect((await cambiarMiPassword({ password: "otraClaveNueva2" })).ok).toBe(false);
    const res = await cambiarMiPassword({ password: "otraClaveNueva2", actual: "no-es-esta" });
    expect(res).toEqual({ ok: false, error: "La contraseña actual no es correcta." });

    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await bcrypt.compare("miClaveNueva1", u.password)).toBe(true);
  });

  it("con la contraseña actual correcta, cambia", async () => {
    const res = await cambiarMiPassword({ password: "otraClaveNueva2", actual: "miClaveNueva1" });
    expect(res.ok).toBe(true);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await bcrypt.compare("otraClaveNueva2", u.password)).toBe(true);
  });

  it("un usuario desactivado no puede cambiarla", async () => {
    await prisma.user.update({ where: { id: userId }, data: { activo: false } });
    const res = await cambiarMiPassword({ password: "terceraClave333", actual: "otraClaveNueva2" });
    expect(res.ok).toBe(false);
  });
});
