import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { processOutbox } from "@/lib/email/outbox";

// ─────────────────────────────────────────────────────────────
// Integración: procesador del EmailOutbox (modo dry-run).
// Un correo con destinatario válido → ENVIADO.
// Un correo con destinatario SIN_MAIL → DEAD (revisión manual).
// ─────────────────────────────────────────────────────────────

const tag = `outbox-test-${Date.now()}`;
let okId: string;
let deadId: string;

beforeAll(async () => {
  process.env.EMAIL_DRY_RUN = "true";
  const ok = await prisma.emailOutbox.create({
    data: {
      tipo: "RECHAZO_TOTAL_FARMACIA",
      destinatario: "farmacia@ejemplo.com",
      asunto: "Test OK",
      dedupKey: `${tag}-ok`,
      payload: { codigo: "SOL-OK" },
    },
  });
  const dead = await prisma.emailOutbox.create({
    data: {
      tipo: "RECHAZO_TOTAL_FARMACIA",
      destinatario: "SIN_MAIL",
      asunto: "Test DEAD",
      dedupKey: `${tag}-dead`,
      payload: { codigo: "SOL-DEAD" },
    },
  });
  okId = ok.id;
  deadId = dead.id;
});

afterAll(async () => {
  await prisma.emailOutbox.deleteMany({ where: { dedupKey: { startsWith: tag } } });
  await prisma.$disconnect();
});

describe("processOutbox (integración, dry-run)", () => {
  it("envía los válidos y manda a DEAD los de destinatario inválido", async () => {
    const res = await processOutbox();
    expect(res.procesados).toBeGreaterThanOrEqual(2);

    const ok = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: okId } });
    expect(ok.estado).toBe("ENVIADO");
    expect(ok.sentAt).not.toBeNull();

    const dead = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: deadId } });
    expect(dead.estado).toBe("DEAD");
    expect(dead.ultimoError).toContain("Destinatario inválido");
  });

  it("no reprocesa los ya enviados (idempotente)", async () => {
    const ok = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: okId } });
    const intentosAntes = ok.intentos;
    await processOutbox();
    const despues = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: okId } });
    expect(despues.intentos).toBe(intentosAntes); // no se volvió a tocar
  });
});
