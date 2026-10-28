import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// Mockeamos auth y next/cache (revalidatePath).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { confirmarDecisiones } from "@/lib/actions/decisiones";
import { confirmarCargasERP } from "@/lib/actions/precios";
import { marcarTesterEnviado } from "@/lib/actions/testers";
import { getTestersPendientes } from "@/lib/data/testers";
import { dedupConsolidadoFarmacia } from "@/lib/business/email-keys";

const mockAuth = vi.mocked(auth);

// ─────────────────────────────────────────────────────────────
// Integración: flujo de PROBADOR / tester contra Postgres.
// Un probador se aprueba SIN condición, no pasa por el ERP, y cierra
// la solicitud (con consolidado a la farmacia) cuando se marca enviado.
// ─────────────────────────────────────────────────────────────

const MAIL_FARMACIA = "central3303@farma.com";
let compradorId: string;
let compradorEmail: string;
let solicitudId: string;
let itemId: string;
const codigo = `SOL-TEST-PROB-${Date.now()}`;

beforeAll(async () => {
  const comprador = await prisma.user.findUniqueOrThrow({ where: { email: "c1@drogueria.com" } });
  compradorId = comprador.id;
  compradorEmail = comprador.email;
  const farmacia = await prisma.farmacia.findFirstOrThrow();

  const sol = await prisma.solicitud.create({
    data: {
      codigo,
      idempotencyKey: codigo,
      farmaciaId: farmacia.id,
      nombreFarmaciaHistorico: farmacia.nombre,
      emailFarmaciaHistorico: MAIL_FARMACIA,
      items: {
        create: [
          {
            codigoBarra: "7791234500011", // Bayer → comprador c1
            cantidad: 1,
            motivo: "PROBADOR",
            compradorId,
            compradorMailHistorico: "c1@drogueria.com",
            laboratorioHistorico: "Bayer",
          },
        ],
      },
    },
    include: { items: true },
  });
  solicitudId = sol.id;
  itemId = sol.items[0].id;

  mockAuth.mockResolvedValue({
    user: { id: compradorId, role: "COMPRADOR", email: compradorEmail },
  } as never);
});

afterAll(async () => {
  await prisma.emailOutbox.deleteMany({ where: { dedupKey: dedupConsolidadoFarmacia(solicitudId) } });
  await prisma.auditLog.deleteMany({ where: { entityId: itemId } });
  await prisma.solicitud.deleteMany({ where: { id: solicitudId } });
  await prisma.$disconnect();
});

describe("flujo PROBADOR (integración)", () => {
  it("se aprueba sin condición y no finaliza la solicitud todavía", async () => {
    const res = await confirmarDecisiones({
      decisiones: [{ itemId, decision: "APROBADO", condicion: "", motivoRechazo: "" }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.solicitudesCerradas).toBe(0);

    const item = await prisma.itemSolicitud.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.estadoDecision).toBe("APROBADO");
    expect(item.condicionAutorizada).toBeNull();
    expect(item.testerEnviado).toBe(false);

    const sol = await prisma.solicitud.findUniqueOrThrow({ where: { id: solicitudId } });
    expect(sol.estado).toBe("EN_PROCESO");
  });

  it("aparece en testers pendientes y Precios no lo puede cargar en el ERP", async () => {
    const testers = await getTestersPendientes(compradorId);
    expect(testers.find((t) => t.id === itemId)).toBeTruthy();

    mockAuth.mockResolvedValueOnce({
      user: { id: "precios", role: "PRECIOS", email: "precios@drogueria.com" },
    } as never);
    const res = await confirmarCargasERP({ itemIds: [itemId] });
    expect(res.ok).toBe(false);
  });

  it("no autoriza marcar enviado a un rol que no es comprador/admin", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: "farma", role: "FARMACIA", email: "farmacia@drogueria.com" },
    } as never);
    const res = await marcarTesterEnviado({ itemIds: [itemId] });
    expect(res.ok).toBe(false);
  });

  it("marcar el tester enviado cierra la solicitud y encola el consolidado", async () => {
    const res = await marcarTesterEnviado({ itemIds: [itemId] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.enviados).toBe(1);
    expect(res.solicitudesFinalizadas).toBe(1);
    expect(res.correosEncolados).toBe(1);

    const item = await prisma.itemSolicitud.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.testerEnviado).toBe(true);
    expect(item.fechaTesterEnviado).not.toBeNull();

    const sol = await prisma.solicitud.findUniqueOrThrow({ where: { id: solicitudId } });
    expect(sol.estado).toBe("FINALIZADA");
    expect(sol.mailFarmaciaEnviado).toBe(true);

    const outbox = await prisma.emailOutbox.findUnique({
      where: { dedupKey: dedupConsolidadoFarmacia(solicitudId) },
    });
    expect(outbox?.tipo).toBe("CONSOLIDADO_FARMACIA");
  });

  it("no permite re-marcar un tester ya enviado", async () => {
    const res = await marcarTesterEnviado({ itemIds: [itemId] });
    expect(res.ok).toBe(false);
  });
});
