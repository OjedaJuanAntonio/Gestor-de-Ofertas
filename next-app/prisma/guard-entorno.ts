// ─────────────────────────────────────────────────────────────
// Guarda de seguridad para los seeds.
//
// Los seeds crean usuarios con una contraseña PÚBLICA (está en el
// repo y en el README) y pisan la contraseña de esos usuarios si ya
// existen. Corrido contra producción, deja un admin con clave
// conocida. Por eso se niegan a correr contra una base que no sea
// local, salvo que se pida explícitamente.
// ─────────────────────────────────────────────────────────────

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres", "db"]);

export function hostDe(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function esBaseLocal(url: string | undefined): boolean {
  const host = hostDe(url);
  return host !== null && HOSTS_LOCALES.has(host);
}

/** Corta el proceso si el seed apunta a una base remota sin permiso explícito. */
export function exigirBaseLocal(nombre: string): void {
  const url = process.env.DATABASE_URL;
  if (esBaseLocal(url) && process.env.NODE_ENV !== "production") return;
  if (process.env.SEED_PERMITIR_REMOTO === "si") {
    console.warn(`⚠️  ${nombre}: corriendo contra "${hostDe(url)}" porque SEED_PERMITIR_REMOTO=si.`);
    return;
  }
  console.error(
    [
      `❌ ${nombre} se negó a correr: la base no es local (host: ${hostDe(url) ?? "desconocido"}).`,
      "   Este seed crea usuarios DEMO con una contraseña pública y pisa la de los existentes.",
      "   Para crear el administrador real en producción usá:",
      "       npm run admin:crear -- <email> \"<nombre>\"",
      "   Si de verdad querés datos demo en esa base (por ejemplo, una de pruebas):",
      "       SEED_PERMITIR_REMOTO=si npx prisma db seed",
    ].join("\n"),
  );
  process.exit(1);
}
