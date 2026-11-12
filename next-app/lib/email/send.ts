import "server-only";

// ─────────────────────────────────────────────────────────────
// Envío de correos vía Resend (API REST, sin SDK).
//
// Modo simulación (no envía, solo registra):
//   - EMAIL_DRY_RUN=true, siempre (decisión explícita);
//   - sin RESEND_API_KEY, SOLO fuera de producción (dev / tests).
//
// En producción sin RESEND_API_KEY el envío FALLA. Antes entraba en
// simulación y el correo quedaba marcado como "enviado" sin haber
// salido: las farmacias no se enteraban y nadie lo veía.
// ─────────────────────────────────────────────────────────────

export type SendResult = { ok: true; dryRun: boolean } | { ok: false; error: string };

export type ModoEnvio = "real" | "simulacion" | "sin-configurar";

/** Cómo se van a tratar los correos con la configuración actual. */
export function modoEnvio(env: NodeJS.ProcessEnv = process.env): ModoEnvio {
  if (env.EMAIL_DRY_RUN === "true") return "simulacion";
  if (env.RESEND_API_KEY) return "real";
  return env.NODE_ENV === "production" ? "sin-configurar" : "simulacion";
}

const DESTINATARIO_INVALIDO = /^(SIN_MAIL|)$/i;
const TIMEOUT_MS = 15_000;

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const { to, subject, html, text } = params;

  if (DESTINATARIO_INVALIDO.test(to.trim()) || !to.includes("@")) {
    return { ok: false, error: `Destinatario inválido: "${to}"` };
  }

  const modo = modoEnvio();
  if (modo === "simulacion") {
    console.log(`[email:simulación] → ${to} · "${subject}"`);
    return { ok: true, dryRun: true };
  }
  if (modo === "sin-configurar") {
    return { ok: false, error: "Falta RESEND_API_KEY: el servidor no puede enviar correos." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? "Farmar · Gestor de Ofertas <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
        text,
      }),
      // Sin límite, un Resend colgado dejaba trabada toda la tanda.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true, dryRun: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red" };
  }
}
