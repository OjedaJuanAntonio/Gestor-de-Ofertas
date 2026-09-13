import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/../auth.config";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────
// src/lib/auth.ts — Configuración completa de NextAuth
//
// Importa Prisma + bcrypt (solo Node.js runtime, nunca Edge).
// Extiende authConfig con el Credentials Provider real.
// ─────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,

  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },

      async authorize(credentials) {
        // 1. Validar shape de los datos entrantes
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // 2. Buscar usuario en la base de datos
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
          },
        });

        // 3. Verificar existencia, estado activo y contraseña
        if (!user || !user.activo) return null;

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return null;

        // 4. Retornar objeto usuario (sin el hash de contraseña)
        return {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          role: user.role,
          farmaciaId: user.farmaciaId,
        };
      },
    }),
  ],
});
