import "server-only";

// ─────────────────────────────────────────────────────────────
// Envío de correos vía Resend (API REST, sin SDK).
// Si no hay RESEND_API_KEY o EMAIL_DRY_RUN=true → modo dry-run:
// no envía, loguea y reporta éxito (útil en dev/test).
// ─────────────────────────────────────────────────────────────

export type SendResult = { ok: true; dryRun: boolean } | { ok: false; error: string };

const DESTINATARIO_INVALIDO = /^(SIN_MAIL|)$/i;

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

  const apiKey = process.env.RESEND_API_KEY;
  const dryRun = process.env.EMAIL_DRY_RUN === "true" || !apiKey;

  if (dryRun) {
    console.log(`[email:dry-run] → ${to} · "${subject}"`);
    return { ok: true, dryRun: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:
          process.env.RESEND_FROM_EMAIL ??
          "Droguería Central <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
        text,
      }),
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
