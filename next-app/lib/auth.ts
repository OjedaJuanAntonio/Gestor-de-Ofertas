import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import {
  loginBloqueado,
  registrarFallo,
  limpiarIntentos,
  ipDeRequest,
} from "@/lib/login-throttle";
import { huellaPassword, revalidarToken } from "@/lib/session-check";

// ─────────────────────────────────────────────────────────────
// lib/auth.ts — Configuración completa de NextAuth
// Solo corre en Node.js runtime (nunca en Edge).
// ─────────────────────────────────────────────────────────────

// Errores de login con un código que la pantalla sabe explicar. El resto de
// los fallos devuelve null → mensaje genérico ("email o contraseña incorrectos").
class LoginBloqueado extends CredentialsSignin {
  code = "bloqueado";
}
class ClaveTemporalVencida extends CredentialsSignin {
  code = "clave_vencida";
}

// Hash válido contra el que se compara cuando el email no existe, para que la
// respuesta tarde lo mismo exista o no el usuario (no delata qué mails hay).
const HASH_SENUELO = "$2b$10$ks3IUlxYKIAfUC9cyn1bsuo20e.mV.nhGsvUAgH1//6D/bezEd.OS";

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

      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { password } = parsed.data;
        const email = parsed.data.email.trim().toLowerCase();

        const ip = ipDeRequest(request);

        // Freno a fuerza bruta: por email+IP, por IP y por email.
        if (await loginBloqueado(email, ip)) throw new LoginBloqueado();

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
            claveTemporalVence: true,
          },
        });

        if (!user || !user.activo) {
          await bcrypt.compare(password, HASH_SENUELO);
          await registrarFallo(email, ip);
          return null;
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
          await registrarFallo(email, ip);
          return null;
        }

        // Clave temporal vencida: es la correcta, pero ya no sirve.
        if (
          user.mustChangePassword &&
          user.claveTemporalVence &&
          user.claveTemporalVence <= new Date()
        ) {
          throw new ClaveTemporalVencida();
        }

        await limpiarIntentos(email, ip);
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
