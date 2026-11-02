import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const { auth } = NextAuth(authConfig);

const ROLE_ROUTES: Record<string, string[]> = {
  "/admin":     ["ADMIN"],
  "/farmacia":  ["ADMIN", "FARMACIA"],
  "/comprador": ["ADMIN", "COMPRADOR"],
  "/precios":   ["ADMIN", "PRECIOS"],
};

type AuthedRequest = NextRequest & {
  auth: { user?: { role?: string; mustChangePassword?: boolean } } | null;
};

const CAMBIAR_CLAVE = "/cambiar-clave";

export default auth(function middleware(req: AuthedRequest) {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user;
  const userRole: string | undefined = user?.role;

  // Cambio de contraseña obligatorio: mientras el flag esté activo, todo
  // (salvo la propia pantalla de cambio) redirige a /cambiar-clave.
  if (user?.mustChangePassword && pathname !== CAMBIAR_CLAVE) {
    return NextResponse.redirect(new URL(CAMBIAR_CLAVE, req.url));
  }

  const matchedPrefix = Object.keys(ROLE_ROUTES).find((prefix) =>
    pathname.startsWith(prefix)
  );

  if (matchedPrefix) {
    const allowedRoles = ROLE_ROUTES[matchedPrefix];

    if (!userRole || !allowedRoles.includes(userRole)) {
      const roleRedirects: Record<string, string> = {
        FARMACIA:  "/farmacia/nueva-solicitud",
        COMPRADOR: "/comprador/bandeja",
        PRECIOS:   "/precios/dashboard",
        ADMIN:     "/admin/usuarios",
      };

      const redirectTo = userRole
        ? (roleRedirects[userRole] ?? "/")
        : "/login";

      return NextResponse.redirect(new URL(redirectTo, req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
