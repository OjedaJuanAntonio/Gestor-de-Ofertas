import { createHash } from "node:crypto";
import type { JWT } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────
// Revalidación de la sesión contra la base.
//
// La sesión es un JWT: lo que guarda (rol, farmacia, "debe cambiar
// la clave") se fija en el login. Sin esto, desactivar un usuario,
// cambiarle el rol o resetearle la contraseña no tenía efecto sobre
// quien ya estaba logueado hasta que venciera el token.
//
// Cada REVALIDAR_CADA_MS se relee el usuario:
//   - no existe o está inactivo            → sesión inválida (null)
//   - cambió la contraseña desde el login  → sesión inválida (null)
//   - si sigue vigente, se refrescan rol / nombre / farmacia /
//     mustChangePassword con lo que diga la base.
// ─────────────────────────────────────────────────────────────

// Cada cuánto se relee el usuario (5 min por defecto). SESSION_REVALIDAR_SEG
// permite ajustarlo sin tocar código (los tests e2e lo bajan a 1 s).
const segundos = Number(process.env.SESSION_REVALIDAR_SEG);
export const REVALIDAR_CADA_MS =
  (Number.isFinite(segundos) && segundos > 0 ? segundos : 5 * 60) * 1000;

/**
 * Huella corta del hash de la contraseña. Cambia cuando cambia la clave, lo
 * que permite invalidar las sesiones abiertas sin agregar una columna. No es
 * reversible y viaja dentro del JWT, que Auth.js cifra.
 */
export function huellaPassword(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

export async function revalidarToken(
  token: JWT,
  now: number = Date.now(),
): Promise<JWT | null> {
  const id = typeof token.id === "string" ? token.id : null;
  if (!id) return token;

  const ultima = typeof token.checkedAt === "number" ? token.checkedAt : 0;
  if (now - ultima < REVALIDAR_CADA_MS) return token;

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { id },
      select: {
        activo: true,
        role: true,
        nombre: true,
        farmaciaId: true,
        mustChangePassword: true,
        password: true,
      },
    });
  } catch (e) {
    // Base caída: no se desloguea a todo el mundo por un corte transitorio.
    // No se actualiza checkedAt, así que se reintenta en el próximo request.
    console.error("[session] no se pudo revalidar la sesión:", e);
    return token;
  }

  if (!user || !user.activo) return null;

  const pv = huellaPassword(user.password);
  // Tokens anteriores a este control no traen huella: se les asigna ahora.
  if (typeof token.pv === "string" && token.pv !== pv) return null;

  return {
    ...token,
    role: user.role,
    nombre: user.nombre,
    farmaciaId: user.farmaciaId,
    mustChangePassword: user.mustChangePassword,
    pv,
    checkedAt: now,
  };
}
