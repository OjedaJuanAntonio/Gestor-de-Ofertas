"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CLAVE_TEMPORAL, MIN_PASSWORD_CAMBIO } from "@/lib/password";

// ─────────────────────────────────────────────────────────────
// Acciones de la propia cuenta (cualquier usuario logueado).
// ─────────────────────────────────────────────────────────────

type Result = { ok: true } | { ok: false; error: string };

const Schema = z.object({
  password: z
    .string()
    .min(MIN_PASSWORD_CAMBIO, `La contraseña debe tener al menos ${MIN_PASSWORD_CAMBIO} caracteres.`),
});

/**
 * Cambia la contraseña del usuario logueado y baja el flag mustChangePassword.
 * Al terminar cierra la sesión y lo manda al login para que entre con la nueva
 * (evita servir un token viejo que todavía diga "debe cambiar").
 */
export async function cambiarMiPassword(input: { password: string }): Promise<Result> {
  const session = await auth();
  const u = session?.user as { id?: string } | undefined;
  if (!u?.id) return { ok: false, error: "No autorizado." };

  const p = Schema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (p.data.password === CLAVE_TEMPORAL)
    return { ok: false, error: "Elegí una contraseña distinta a la temporal." };

  const hash = await bcrypt.hash(p.data.password, 10);
  await prisma.user.update({
    where: { id: u.id },
    data: { password: hash, mustChangePassword: false },
  });

  // Cierra sesión y redirige al login (signOut lanza el redirect).
  await signOut({ redirectTo: "/login?cambiada=1" });
  return { ok: true };
}
