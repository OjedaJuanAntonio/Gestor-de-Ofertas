import "server-only";
import { prisma } from "@/lib/prisma";
import { renderEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";

// ─────────────────────────────────────────────────────────────
// Procesador del EmailOutbox (cola transaccional).
// - Toma correos PENDIENTE/FALLIDO listos (scheduledAt <= now).
// - Renderiza + envía. Éxito → ENVIADO. Falla → reintenta con
//   backoff exponencial; al agotar maxIntentos → DEAD (revisión
//   manual). Destinatario inválido (SIN_MAIL) → DEAD inmediato.
// - Claim atómico por fila para evitar doble envío entre corridas.
// ─────────────────────────────────────────────────────────────

const BACKOFF_BASE_MS = 60_000; // 1min, 2min, 4min, ...

export type ProcessResult = {
  procesados: number;
  enviados: number;
  fallidos: number;
  dead: number;
};

export async function processOutbox(limit = 50): Promise<ProcessResult> {
  const ahora = new Date();
  const candidatos = await prisma.emailOutbox.findMany({
    where: {
      estado: { in: ["PENDIENTE", "FALLIDO"] },
      scheduledAt: { lte: ahora },
    },
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });

  const res: ProcessResult = { procesados: 0, enviados: 0, fallidos: 0, dead: 0 };

  for (const correo of candidatos) {
    // Claim atómico: solo procede si nadie más lo tomó (intentos sin cambiar).
    const claim = await prisma.emailOutbox.updateMany({
      where: { id: correo.id, intentos: correo.intentos, estado: correo.estado },
      data: { intentos: correo.intentos + 1 },
    });
    if (claim.count === 0) continue; // otra corrida lo tomó

    res.procesados++;
    const intento = correo.intentos + 1;

    const { subject, html, text } = renderEmail(
      correo.tipo,
      (correo.payload ?? {}) as Record<string, unknown>,
    );

    const enviado = await sendEmail({
      to: correo.destinatario,
      subject: subject || correo.asunto,
      html,
      text,
    });

    if (enviado.ok) {
      await prisma.emailOutbox.update({
        where: { id: correo.id },
        data: { estado: "ENVIADO", sentAt: new Date(), ultimoError: null },
      });
      res.enviados++;
      continue;
    }

    // Destinatario inválido → no tiene sentido reintentar.
    const invalido = enviado.error.startsWith("Destinatario inválido");
    const agotado = intento >= correo.maxIntentos;

    if (invalido || agotado) {
      await prisma.emailOutbox.update({
        where: { id: correo.id },
        data: { estado: "DEAD", ultimoError: enviado.error },
      });
      res.dead++;
    } else {
      const delay = BACKOFF_BASE_MS * 2 ** (intento - 1);
      await prisma.emailOutbox.update({
        where: { id: correo.id },
        data: {
          estado: "FALLIDO",
          ultimoError: enviado.error,
          scheduledAt: new Date(Date.now() + delay),
        },
      });
      res.fallidos++;
    }
  }

  return res;
}
