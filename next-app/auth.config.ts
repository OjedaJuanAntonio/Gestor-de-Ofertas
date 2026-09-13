import type { NextAuthConfig } from "next-auth";

// ─────────────────────────────────────────────────────────────
// auth.config.ts — Configuración Edge-compatible de NextAuth
//
// No importa Prisma ni bcrypt (no disponibles en Edge Runtime).
// La validación real de credenciales ocurre en lib/auth.ts
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
          farmaciaId?: number | null;
        };
        token.id = u.id;
        token.role = u.role;
        token.nombre = u.nombre;
        token.farmaciaId = u.farmaciaId;
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
        };
        su.id = token.id as string;
        su.role = token.role;
        su.nombre = token.nombre;
        su.farmaciaId = token.farmaciaId;
      }
      return session;
    },
  },

  session: { strategy: "jwt" },
  providers: [],
};
