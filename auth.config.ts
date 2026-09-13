import type { NextAuthConfig } from "next-auth";

// ─────────────────────────────────────────────────────────────
// auth.config.ts — Configuración Edge-compatible de NextAuth
//
// Este archivo NO puede importar Prisma ni bcrypt porque ambas
// librerías usan APIs de Node.js que no están disponibles en el
// Edge Runtime donde corre el middleware.
//
// La validación real de credenciales ocurre en src/lib/auth.ts
// ─────────────────────────────────────────────────────────────

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
    error: "/login", // Redirige errores de auth a la página de login
  },

  callbacks: {
    // Este callback corre en el Edge Runtime (middleware).
    // Solo verifica si el usuario tiene sesión activa para proteger rutas.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/admin") ||
        nextUrl.pathname.startsWith("/farmacia") ||
        nextUrl.pathname.startsWith("/comprador") ||
        nextUrl.pathname.startsWith("/precios");

      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false; // Redirige a /login
      } else if (isLoggedIn && nextUrl.pathname === "/login") {
        // Usuario ya autenticado intenta ir a login → redirigir a home
        return Response.redirect(new URL("/", nextUrl));
      }

      return true;
    },

    // Inyecta role, id y nombre en el token JWT
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.nombre = (user as any).nombre;
      }
      return token;
    },

    // Expone role, id y nombre en el objeto session del cliente
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role;
        (session.user as any).nombre = token.nombre;
      }
      return session;
    },
  },

  // Usamos JWT (stateless) — no se necesita Prisma Adapter para la sesión
  session: { strategy: "jwt" },

  providers: [], // Los providers reales se definen en src/lib/auth.ts
};
