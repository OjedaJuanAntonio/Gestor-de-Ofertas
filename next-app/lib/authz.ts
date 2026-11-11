import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Role } from "@/types";

// ─────────────────────────────────────────────────────────────
// Autorización en el servidor, cerca de los datos.
//
// proxy.ts ya filtra las rutas por rol, pero no puede ser la única
// barrera: si el proxy se saltea o se configura mal su `matcher`,
// las páginas quedarían leyendo datos sin ningún control. Cada
// página de una sección llama a `requireRole` antes de consultar.
// ─────────────────────────────────────────────────────────────

export type SessionUser = {
  id: string;
  role: Role;
  nombre: string;
  email: string;
  farmaciaId: string | null;
  mustChangePassword: boolean;
};

/** Usuario de la sesión actual, o null. Una sola lectura por request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const u = session?.user as
    | {
        id?: string;
        role?: Role;
        nombre?: string;
        email?: string | null;
        farmaciaId?: string | null;
        mustChangePassword?: boolean;
      }
    | undefined;
  if (!u?.id || !u.role) return null;
  return {
    id: u.id,
    role: u.role,
    nombre: u.nombre ?? "",
    email: u.email ?? "",
    farmaciaId: u.farmaciaId ?? null,
    mustChangePassword: !!u.mustChangePassword,
  };
});

/**
 * Exige sesión y uno de los roles indicados. Sin sesión → /login; con sesión
 * pero otro rol → "/" (que redirige al inicio de su rol).
 */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/cambiar-clave");
  if (!roles.includes(user.role)) redirect("/");
  return user;
}

/**
 * Alcance de datos de farmacia para un usuario: null = ve todas (solo ADMIN);
 * un id = solo esa farmacia. Un usuario FARMACIA sin farmacia asignada NO ve
 * nada (antes ese caso caía en "todas": fallaba abierto).
 */
export function alcanceFarmacia(user: SessionUser): string | null {
  if (user.role === "ADMIN") return null;
  if (user.role === "FARMACIA" && user.farmaciaId) return user.farmaciaId;
  notFound();
}
