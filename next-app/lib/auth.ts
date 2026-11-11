import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import {
  loginBloqueado,
  registrarFallo,
  limpiarIntentos,
} from "@/lib/login-throttle";
import { huellaPassword, revalidarToken } from "@/lib/session-check";

// ─────────────────────────────────────────────────────────────
// lib/auth.ts — Configuración completa de NextAuth
// Solo corre en Node.js runtime (nunca en Edge).
// ─────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,

  callbacks: {
    ...authConfig.callbacks,
    // En el login copia los datos del usuario al token (callback base). En
    // cada uso posterior revalida contra la base: si el usuario fue
    // desactivado o cambió su contraseña, devuelve null y la sesión cae.
    async jwt(params) {
      const token = await authConfig.callbacks!.jwt!(params);
      if (!token) return token;
      if (params.user) return { ...token, checkedAt: Date.now() };
      return revalidarToken(token);
    },
  },

  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },

      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { password } = parsed.data;
        const email = parsed.data.email.trim().toLowerCase();

        // Freno a fuerza bruta: bloquea tras demasiados intentos fallidos.
        if (loginBloqueado(email)) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            nombre: true,
            password: true,
            role: true,
            activo: true,
            farmaciaId: true,
            mustChangePassword: true,
          },
        });

        if (!user || !user.activo) {
          registrarFallo(email);
          return null;
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
          registrarFallo(email);
          return null;
        }

        limpiarIntentos(email);
        return {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          role: user.role,
          farmaciaId: user.farmaciaId,
          mustChangePassword: user.mustChangePassword,
          pv: huellaPassword(user.password),
        };
      },
    }),
  ],
});
