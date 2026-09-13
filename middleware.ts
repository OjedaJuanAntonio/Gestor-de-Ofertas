import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────
// middleware.ts — Protección de rutas por rol
//
// Corre en Edge Runtime. Usa authConfig (sin Prisma/bcrypt).
// Dos niveles de protección:
//   1. ¿Está autenticado? → manejado por authConfig.authorized
//   2. ¿Tiene el rol correcto para esta ruta? → manejado aquí
// ─────────────────────────────────────────────────────────────

const { auth } = NextAuth(authConfig);

// Mapa de prefijo de ruta → roles permitidos
const ROLE_ROUTES: Record<string, string[]> = {
  "/admin":     ["ADMIN"],
  "/farmacia":  ["ADMIN", "FARMACIA"],
  "/comprador": ["ADMIN", "COMPRADOR"],
  "/precios":   ["ADMIN", "PRECIOS"],
};

export default auth(function middleware(req: NextRequest & { auth: any }) {
  const { pathname } = req.nextUrl;
  const userRole: string | undefined = req.auth?.user?.role;

  // Buscar si la ruta actual tiene restricción de rol
  const matchedPrefix = Object.keys(ROLE_ROUTES).find((prefix) =>
    pathname.startsWith(prefix)
  );

  if (matchedPrefix) {
    const allowedRoles = ROLE_ROUTES[matchedPrefix];

    // Si el usuario no tiene el rol requerido → 403 o redirect
    if (!userRole || !allowedRoles.includes(userRole)) {
      // Redirigir a la ruta raíz de su propio rol
      const roleRedirects: Record<string, string> = {
        FARMACIA:  "/farmacia/nueva-solicitud",
        COMPRADOR: "/comprador/bandeja",
        PRECIOS:   "/precios/dashboard",
        ADMIN:     "/admin/usuarios",
      };

      const redirectTo = userRole
        ? roleRedirects[userRole] ?? "/"
        : "/login";

      return NextResponse.redirect(new URL(redirectTo, req.url));
    }
  }

  return NextResponse.next();
});

// Aplica el middleware a todas las rutas excepto archivos estáticos y API de auth
export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
