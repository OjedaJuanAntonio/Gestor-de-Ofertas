import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const esDev = process.env.NODE_ENV !== "production";

// ─────────────────────────────────────────────────────────────
// Cabeceras de seguridad para todas las respuestas.
//
// - frame-ancestors / X-Frame-Options: la app no se puede embeber en
//   otro sitio (evita clickjacking sobre "Confirmar decisiones").
// - CSP: solo se cargan recursos del propio origen. Next inyecta
//   scripts y estilos en línea para hidratar, por eso 'unsafe-inline'
//   (una CSP con nonce obligaría a renderizar todo dinámico). En
//   desarrollo hacen falta además 'unsafe-eval' y websockets (HMR).
// - HSTS: fuerza HTTPS (los navegadores lo ignoran sobre http://).
// ─────────────────────────────────────────────────────────────
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${esDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${esDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Hay otro package-lock.json en el home del usuario; fijamos la raíz
  // del workspace a este proyecto para que Turbopack resuelva bien.
  turbopack: {
    root: projectRoot,
  },

  // No anunciar el framework en cada respuesta.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
