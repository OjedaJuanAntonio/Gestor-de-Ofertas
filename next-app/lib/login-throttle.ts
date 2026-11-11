import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────
// Freno a la fuerza bruta en el login.
//
// Cuenta intentos FALLIDOS dentro de una ventana, en la base (tabla
// login_intentos) para que valga entre todas las instancias del
// servidor: antes vivía en memoria y en serverless cada instancia
// llevaba su propia cuenta.
//
// Se cuentan tres cosas a la vez:
//   par   → un email desde una IP. Es el freno fino (10 intentos).
//   ip    → cualquier email desde una IP. Frena probar UNA clave
//           contra MUCHOS emails (password spraying), que el freno
//           por email no detectaba nunca.
//   email → un email desde cualquier IP (ataque distribuido).
//
// El límite por email solo es alto a propósito: con el anterior (10)
// cualquiera podía dejar sin acceso a un usuario fallando 10 veces con
// su email. Ahora, desde una misma IP, el atacante se bloquea a sí
// mismo (par) mucho antes de bloquear a la víctima (email).
// ─────────────────────────────────────────────────────────────

export const VENTANA_MS = 15 * 60 * 1000; // 15 minutos
export const LIMITES = { par: 10, ip: 50, email: 50 } as const;

type Tipo = keyof typeof LIMITES;

/** Claves que se cuentan para un intento. Sin IP conocida no se cuenta por IP
 *  (todos los requests "sin IP" compartirían contador y se bloquearían entre sí). */
export function clavesDe(email: string, ip: string | null): { tipo: Tipo; clave: string }[] {
  const out: { tipo: Tipo; clave: string }[] = [
    { tipo: "par", clave: `par:${email}|${ip ?? "sin-ip"}` },
    { tipo: "email", clave: `email:${email}` },
  ];
  if (ip) out.push({ tipo: "ip", clave: `ip:${ip}` });
  return out;
}

/** IP del cliente según los encabezados del proxy (Vercel los fija él mismo). */
export function ipDeRequest(request: Request | undefined): string | null {
  const h = request?.headers;
  if (!h) return null;
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  return ip && ip.length <= 64 ? ip : null;
}

/** True si alguno de los contadores vigentes llegó a su límite. */
export async function loginBloqueado(
  email: string,
  ip: string | null,
  now: Date = new Date(),
): Promise<boolean> {
  const claves = clavesDe(email, ip);
  try {
    const filas = await prisma.loginIntento.findMany({
      where: { clave: { in: claves.map((c) => c.clave) }, venceAt: { gt: now } },
      select: { clave: true, cantidad: true },
    });
    const porClave = new Map(filas.map((f) => [f.clave, f.cantidad]));
    return claves.some((c) => (porClave.get(c.clave) ?? 0) >= LIMITES[c.tipo]);
  } catch (e) {
    // Si la tabla no responde, no se le niega el login a todo el mundo.
    console.error("[login-throttle] no se pudo consultar:", e);
    return false;
  }
}

/** Registra un intento fallido (abre la ventana o la extiende). */
export async function registrarFallo(
  email: string,
  ip: string | null,
  now: Date = new Date(),
): Promise<void> {
  const venceAt = new Date(now.getTime() + VENTANA_MS);
  try {
    for (const { clave } of clavesDe(email, ip)) {
      const actual = await prisma.loginIntento.findUnique({ where: { clave } });
      if (!actual || actual.venceAt <= now) {
        await prisma.loginIntento.upsert({
          where: { clave },
          create: { clave, cantidad: 1, venceAt },
          update: { cantidad: 1, venceAt },
        });
      } else {
        await prisma.loginIntento.update({
          where: { clave },
          data: { cantidad: { increment: 1 } },
        });
      }
    }
    // Limpieza ocasional de ventanas vencidas (la tabla no crece sin límite).
    if (Math.random() < 0.02) {
      await prisma.loginIntento.deleteMany({ where: { venceAt: { lte: now } } });
    }
  } catch (e) {
    console.error("[login-throttle] no se pudo registrar el fallo:", e);
  }
}

/**
 * Tras un login exitoso se limpia solo el contador fino (ese email desde esa
 * IP). Los de IP y email NO: si no, quien tenga una cuenta válida podría
 * "resetear" el contador de su IP entre tandas de intentos contra otras.
 */
export async function limpiarIntentos(email: string, ip: string | null): Promise<void> {
  try {
    await prisma.loginIntento.deleteMany({
      where: { clave: `par:${email}|${ip ?? "sin-ip"}` },
    });
  } catch (e) {
    console.error("[login-throttle] no se pudo limpiar:", e);
  }
}
