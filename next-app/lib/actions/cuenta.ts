"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MIN_PASSWORD_CAMBIO, esPasswordDemasiadoComun } from "@/lib/password";

// ─────────────────────────────────────────────────────────────
// Acciones de la propia cuenta (cualquier usuario logueado).
// ─────────────────────────────────────────────────────────────

type Result = { ok: true } | { ok: false; error: string };

const Schema = z.object({
  password: z
    .string()
    .min(MIN_PASSWORD_CAMBIO, `La contraseña debe tener al menos ${MIN_PASSWORD_CAMBIO} caracteres.`)
    .max(200, "La contraseña es demasiado larga."),
  // Contraseña actual: obligatoria en el cambio voluntario (ver abajo).
  actual: z.string().max(200).optional(),
});

/**
 * Cambia la contraseña del usuario logueado y baja el flag mustChangePassword.
 *
 * - Cambio OBLIGATORIO (viene de una clave temporal): no se pide la actual; la
 *   acaba de tipear para entrar.
 * - Cambio VOLUNTARIO: se exige la contraseña actual, para que una sesión
 *   abierta en una PC compartida no alcance para adueñarse de la cuenta.
 *
 * Al terminar cierra la sesión y manda al login. Como la contraseña cambió,
 * cualquier otra sesión abierta de este usuario deja de valer (ver
 * lib/session-check.ts).
 */
export async function cambiarMiPassword(input: {
  password: string;
  actual?: string;
}): Promise<Result> {
  const session = await auth();
  const u = session?.user as { id?: string } | undefined;
  if (!u?.id) return { ok: false, error: "No autorizado." };

  const p = Schema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };

  const user = await prisma.user.findUnique({
    where: { id: u.id },
    select: { password: true, mustChangePassword: true, activo: true },
  });
  if (!user || !user.activo) return { ok: false, error: "No autorizado." };

  if (!user.mustChangePassword) {
    const okActual = !!p.data.actual && (await bcrypt.compare(p.data.actual, user.password));
    if (!okActual) return { ok: false, error: "La contraseña actual no es correcta." };
  }

  if (esPasswordDemasiadoComun(p.data.password))
    return { ok: false, error: "Esa contraseña es demasiado común. Elegí otra." };
  if (await bcrypt.compare(p.data.password, user.password))
    return { ok: false, error: "Elegí una contraseña distinta a la actual." };

  const hash = await bcrypt.hash(p.data.password, 10);
  await prisma.user.update({
    where: { id: u.id },
    data: { password: hash, mustChangePassword: false, claveTemporalVence: null },
  });

  // Cierra sesión y redirige al login (signOut lanza el redirect).
  await signOut({ redirectTo: "/login?cambiada=1" });
  return { ok: true };
}
