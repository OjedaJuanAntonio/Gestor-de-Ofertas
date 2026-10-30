import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";

vi.mock("@/lib/auth", () => ({ auth: vi.fn(), signOut: vi.fn() }));

import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cambiarMiPassword } from "@/lib/actions/cuenta";
import { CLAVE_TEMPORAL } from "@/lib/password";

const mockAuth = vi.mocked(auth);
const mockSignOut = vi.mocked(signOut);

// ─────────────────────────────────────────────────────────────
// Integración: cambio de contraseña propia (baja el flag + cierra sesión).
// ─────────────────────────────────────────────────────────────

const EMAIL = "cambio-pass@farma.test";
let userId: string;

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const u = await prisma.user.create({
    data: {
      email: EMAIL,
      nombre: "Usuario Cambio",
      password: await bcrypt.hash(CLAVE_TEMPORAL, 10),
      role: "PRECIOS",
      mustChangePassword: true,
    },
  });
  userId = u.id;
  mockAuth.mockResolvedValue({ user: { id: userId } } as never);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

describe("cambiarMiPassword", () => {
  it("rechaza contraseñas cortas (< 8) sin tocar la base", async () => {
    const res = await cambiarMiPassword({ password: "corta" });
    expect(res.ok).toBe(false);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.mustChangePassword).toBe(true); // sigue obligado
  });

  it("rechaza reusar la clave temporal", async () => {
    const res = await cambiarMiPassword({ password: CLAVE_TEMPORAL });
    expect(res.ok).toBe(false);
  });

  it("cambia la contraseña, baja el flag y cierra sesión", async () => {
    mockSignOut.mockClear();
    const res = await cambiarMiPassword({ password: "miClaveNueva1" });
    expect(res.ok).toBe(true);
    expect(mockSignOut).toHaveBeenCalledOnce();

    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.mustChangePassword).toBe(false);
    expect(await bcrypt.compare("miClaveNueva1", u.password)).toBe(true);
  });
});
