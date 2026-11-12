import type { NextAuthConfig } from "next-auth";

// ─────────────────────────────────────────────────────────────
// auth.config.ts — Configuración base de NextAuth (sin Prisma ni bcrypt)
//
// Páginas, callbacks de sesión y duración. La validación de credenciales
// y la revalidación contra la base están en lib/auth.ts.
// ─────────────────────────────────────────────────────────────

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard =
        nextUrl.pathname.startsWith("/admin") ||
        nextUrl.pathname.startsWith("/farmacia") ||
        nextUrl.pathname.startsWith("/comprador") ||
        nextUrl.pathname.startsWith("/precios");

      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false;
      } else if (isLoggedIn && nextUrl.pathname === "/login") {
        return Response.redirect(new URL("/", nextUrl));
      }

      return true;
    },

    jwt({ token, user }) {
      if (user) {
        const u = user as {
          id: string;
          role?: string;
          nombre?: string;
          farmaciaId?: string | null;
          mustChangePassword?: boolean;
          pv?: string;
        };
        token.id = u.id;
        token.role = u.role;
        token.nombre = u.nombre;
        token.farmaciaId = u.farmaciaId;
        token.mustChangePassword = u.mustChangePassword ?? false;
        // Huella de la contraseña al momento del login (ver lib/session-check.ts).
        token.pv = u.pv;
      }
      return token;
    },

    session({ session, token }) {
      if (token && session.user) {
        const su = session.user as {
          id: string;
          role?: unknown;
          nombre?: unknown;
          farmaciaId?: unknown;
          mustChangePassword?: unknown;
        };
        su.id = token.id as string;
        su.role = token.role;
        su.nombre = token.nombre;
        su.farmaciaId = token.farmaciaId;
        su.mustChangePassword = token.mustChangePassword;
      }
      return session;
    },
  },

  // Sesión de 12 h (antes: el default de Auth.js, 30 días). Se renueva con el
  // uso; alcanza para una jornada y limita el daño de una sesión robada.
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  providers: [],
};
