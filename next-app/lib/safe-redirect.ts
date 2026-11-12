// ─────────────────────────────────────────────────────────────
// Destino seguro para redirigir después del login.
//
// El login toma `callbackUrl` de la URL. Sin validar, un link como
// /login?callbackUrl=https://sitio-falso.com mandaba al usuario a un
// sitio externo apenas ingresaba bien (redirección abierta, útil para
// phishing). Solo se aceptan rutas internas de esta misma app.
// ─────────────────────────────────────────────────────────────

/**
 * Devuelve una ruta interna ("/algo?x=1") o `fallback` si `raw` apunta afuera.
 * Acepta también una URL absoluta del MISMO origen (si se pasa `origin`), que
 * es lo que arma Auth.js en algunos flujos, y la reduce a su ruta.
 */
export function rutaInternaSegura(
  raw: string | null | undefined,
  opts: { fallback?: string; origin?: string } = {},
): string {
  const fallback = opts.fallback ?? "/";
  if (!raw) return fallback;
  // Caracteres de control (tab, salto de línea): los navegadores los quitan
  // al resolver la URL y sirven para disfrazar un "//".
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;

  if (raw.startsWith("/")) {
    // "//host" y "/\host" son URLs relativas al protocolo → otro sitio.
    if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
    return raw;
  }

  if (opts.origin) {
    try {
      const u = new URL(raw);
      if (u.origin === opts.origin) return `${u.pathname}${u.search}${u.hash}`;
    } catch {
      /* no es una URL válida */
    }
  }
  return fallback;
}
