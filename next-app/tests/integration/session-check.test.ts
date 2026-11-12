import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import type { JWT } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { huellaPassword, revalidarToken, REVALIDAR_CADA_MS } from "@/lib/session-check";

// ─────────────────────────────────────────────────────────────
// Integración: la sesión (JWT) se revalida contra la base. Cubre el
// hallazgo "desactivar un usuario o resetearle la clave no cortaba
// la sesión abierta".
// ─────────────────────────────────────────────────────────────

const EMAIL = "session-check@drogueria.test";
let userId: string;
let hash: string;

const viejo = () => Date.now() - REVALIDAR_CADA_MS - 1000;
const tokenDe = (extra: Partial<JWT> = {}): JWT => ({
  id: userId,
  role: "COMPRADOR",
  nombre: "Sesión Test",
  farmaciaId: null,
  mustChangePassword: false,
  pv: huellaPassword(hash),
  checkedAt: viejo(),
  ...extra,
});

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  hash = await bcrypt.hash("claveOriginal123", 4);
  const u = await prisma.user.create({
    data: { email: EMAIL, nombre: "Sesión Test", password: hash, role: "COMPRADOR" },
  });
  userId = u.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

describe("revalidarToken", () => {
  it("usuario vigente: mantiene la sesión y sella checkedAt", async () => {
    const ahora = Date.now();
    const t = await revalidarToken(tokenDe(), ahora);
    expect(t).not.toBeNull();
    expect(t!.checkedAt).toBe(ahora);
    expect(t!.role).toBe("COMPRADOR");
  });

  it("dentro de la ventana no consulta la base (devuelve el mismo token)", async () => {
    const token = tokenDe({ checkedAt: Date.now(), id: "id-que-no-existe" });
    expect(await revalidarToken(token)).toBe(token);
  });

  it("refresca rol y mustChangePassword con lo que dice la base", async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { role: "PRECIOS", mustChangePassword: true },
    });
    const t = await revalidarToken(tokenDe());
    expect(t!.role).toBe("PRECIOS");
    expect(t!.mustChangePassword).toBe(true);
    await prisma.user.update({
      where: { id: userId },
      data: { role: "COMPRADOR", mustChangePassword: false },
    });
  });

  it("un token viejo sin huella de contraseña la recibe (no se invalida)", async () => {
    const t = await revalidarToken(tokenDe({ pv: undefined }));
    expect(t!.pv).toBe(huellaPassword(hash));
  });

  it("usuario desactivado → sesión inválida", async () => {
    await prisma.user.update({ where: { id: userId }, data: { activo: false } });
    expect(await revalidarToken(tokenDe())).toBeNull();
    await prisma.user.update({ where: { id: userId }, data: { activo: true } });
  });

  it("cambió la contraseña desde el login → sesión inválida", async () => {
    const tokenAnterior = tokenDe();
    const nuevo = await bcrypt.hash("otraClave456789", 4);
    await prisma.user.update({ where: { id: userId }, data: { password: nuevo } });
    expect(await revalidarToken(tokenAnterior)).toBeNull();
  });

  it("usuario borrado → sesión inválida", async () => {
    expect(await revalidarToken(tokenDe({ id: "id-que-no-existe" }))).toBeNull();
  });
});
