import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Prisma CLI carga `.env` por defecto; Next usa `.env.local`. Unificamos
// cargando `.env.local` (y `.env` como fallback) para una única fuente de verdad.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// ─────────────────────────────────────────────────────────────
// prisma.config.ts (Prisma 7)
// Las URLs de conexión para Migrate/Introspect viven acá (ya no en
// el schema). El cliente runtime usa un driver adapter en lib/prisma.ts.
//
// Usamos DIRECT_URL para migraciones (conexión directa, sin pooler).
// En local, DIRECT_URL === DATABASE_URL.
// ─────────────────────────────────────────────────────────────

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
