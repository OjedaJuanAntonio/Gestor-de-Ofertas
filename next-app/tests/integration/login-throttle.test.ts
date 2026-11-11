import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  loginBloqueado,
  registrarFallo,
  limpiarIntentos,
  ipDeRequest,
  LIMITES,
  VENTANA_MS,
} from "@/lib/login-throttle";

// ─────────────────────────────────────────────────────────────
// Integración: freno a la fuerza bruta guardado en la base.
// Cubre los tres contadores (email+IP, IP, email) y los dos huecos
// que tenía el freno anterior (solo por email, en memoria):
//   - probar UNA clave contra MUCHOS emails no se frenaba nunca;
//   - cualquiera podía bloquear a un usuario fallando con su email.
// ─────────────────────────────────────────────────────────────

const TAG = "throttle-test";
const mail = (n: number | string) => `${TAG}-${n}@farma.test`;
const IP_A = "203.0.113.10";
const IP_B = "203.0.113.20";

async function limpiar() {
  await prisma.loginIntento.deleteMany({
    where: { OR: [{ clave: { contains: TAG } }, { clave: { in: [`ip:${IP_A}`, `ip:${IP_B}`] } }] },
  });
}

async function fallar(email: string, ip: string | null, veces: number, now?: Date) {
  for (let i = 0; i < veces; i++) await registrarFallo(email, ip, now);
}

beforeEach(limpiar);
afterAll(async () => {
  await limpiar();
  await prisma.$disconnect();
});

describe("login-throttle", () => {
  it("no bloquea por debajo del límite y bloquea al alcanzarlo (email + IP)", async () => {
    await fallar(mail(1), IP_A, LIMITES.par - 1);
    expect(await loginBloqueado(mail(1), IP_A)).toBe(false);
    await fallar(mail(1), IP_A, 1);
    expect(await loginBloqueado(mail(1), IP_A)).toBe(true);
  });

  it("fallar con el email de alguien desde OTRA IP no lo deja afuera", async () => {
    // El "atacante" (IP_A) se bloquea a sí mismo...
    await fallar(mail("victima"), IP_A, LIMITES.par);
    expect(await loginBloqueado(mail("victima"), IP_A)).toBe(true);
    // ...pero la víctima, desde su propia IP, sigue pudiendo entrar.
    expect(await loginBloqueado(mail("victima"), IP_B)).toBe(false);
  });

  it("frena el password spraying: una IP probando muchos emails distintos", async () => {
    // Un intento por email: el freno por email nunca lo vería.
    for (let i = 0; i < LIMITES.ip; i++) await registrarFallo(mail(`spray-${i}`), IP_A);
    // Un email nunca probado, desde esa misma IP → bloqueado.
    expect(await loginBloqueado(mail("nunca-probado"), IP_A)).toBe(true);
    // Desde otra IP, no.
    expect(await loginBloqueado(mail("nunca-probado"), IP_B)).toBe(false);
  });

  it("un ataque distribuido contra un email termina bloqueándolo", async () => {
    for (let i = 0; i < LIMITES.email; i++) {
      await registrarFallo(mail("objetivo"), `198.51.100.${i}`);
    }
    expect(await loginBloqueado(mail("objetivo"), IP_B)).toBe(true);
    await prisma.loginIntento.deleteMany({ where: { clave: { startsWith: "ip:198.51.100." } } });
  });

  it("un login exitoso limpia el contador fino pero no el de la IP", async () => {
    await fallar(mail(2), IP_A, LIMITES.par);
    await limpiarIntentos(mail(2), IP_A);
    expect(await loginBloqueado(mail(2), IP_A)).toBe(false);
    const ip = await prisma.loginIntento.findUnique({ where: { clave: `ip:${IP_A}` } });
    expect(ip?.cantidad).toBe(LIMITES.par);
  });

  it("se desbloquea al pasar la ventana, y un fallo posterior la reabre en 1", async () => {
    const t0 = new Date("2026-01-01T12:00:00Z");
    await fallar(mail(3), IP_A, LIMITES.par, t0);
    expect(await loginBloqueado(mail(3), IP_A, t0)).toBe(true);

    const despues = new Date(t0.getTime() + VENTANA_MS + 1000);
    expect(await loginBloqueado(mail(3), IP_A, despues)).toBe(false);

    await registrarFallo(mail(3), IP_A, despues);
    const par = await prisma.loginIntento.findUnique({
      where: { clave: `par:${mail(3)}|${IP_A}` },
    });
    expect(par?.cantidad).toBe(1);
  });

  it("sin IP conocida no se cuenta por IP (no se bloquean entre sí)", async () => {
    await fallar(mail(4), null, LIMITES.par);
    expect(await loginBloqueado(mail(4), null)).toBe(true);
    expect(await loginBloqueado(mail(5), null)).toBe(false);
    expect(await prisma.loginIntento.count({ where: { clave: { startsWith: "ip:sin" } } })).toBe(0);
  });
});

describe("ipDeRequest", () => {
  const req = (h: Record<string, string>) => new Request("http://x/", { headers: h });

  it("toma la primera IP de x-forwarded-for", () => {
    expect(ipDeRequest(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });
  it("cae a x-real-ip, y a null si no hay nada", () => {
    expect(ipDeRequest(req({ "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8");
    expect(ipDeRequest(req({}))).toBeNull();
    expect(ipDeRequest(undefined)).toBeNull();
  });
  it("descarta valores absurdamente largos", () => {
    expect(ipDeRequest(req({ "x-forwarded-for": "9".repeat(200) }))).toBeNull();
  });
});
