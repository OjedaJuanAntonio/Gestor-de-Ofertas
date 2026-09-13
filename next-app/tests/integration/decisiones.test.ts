import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// Mockeamos auth (sesión del comprador) y next/cache (revalidatePath).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { confirmarDecisiones } from "@/lib/actions/decisiones";
import { dedupRechazoTotal } from "@/lib/business/email-keys";

const mockAuth = vi.mocked(auth);

// ─────────────────────────────────────────────────────────────
// Integración: el Server Action real del comprador contra Postgres.
// Verifica la corrección del bug: una solicitud 100% rechazada
// queda FINALIZADA y notifica a la farmacia (RECHAZO_TOTAL).
// ─────────────────────────────────────────────────────────────

let compradorId: string;
let solicitudId: string;
const itemIds: string[] = [];
const codigo = `SOL-TEST-${Date.now()}`;

beforeAll(async () => {
  const comprador = await prisma.user.findUniqueOrThrow({
    where: { email: "c1@drogueria.com" },
  });
  compradorId = comprador.id;
  const farmacia = await prisma.farmacia.findFirstOrThrow();

  const sol = await prisma.solicitud.create({
    data: {
      codigo,
      idempotencyKey: codigo,
      farmaciaId: farmacia.id,
      nombreFarmaciaHistorico: farmacia.nombre,
      emailFarmaciaHistorico: farmacia.email ?? "SIN_MAIL",
      items: {
        create: [
          {
            codigoBarra: "7791234500011",
            cantidad: 5,
            motivo: "SOBRESTOCK",
            compradorId,
            compradorMailHistorico: "c1@drogueria.com",
            laboratorioHistorico: "Bayer",
          },
          {
            codigoBarra: "7791234500028",
            cantidad: 3,
            motivo: "STOCK_INMOVILIZADO",
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
  itemIds.push(...sol.items.map((i) => i.id));

  mockAuth.mockResolvedValue({
    user: { id: compradorId, role: "COMPRADOR", email: "c1@drogueria.com" },
  } as never);
});

afterAll(async () => {
  await prisma.emailOutbox.deleteMany({ where: { dedupKey: dedupRechazoTotal(solicitudId) } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [solicitudId, ...itemIds] } } });
  await prisma.solicitud.deleteMany({ where: { id: solicitudId } });
  await prisma.$disconnect();
});

describe("confirmarDecisiones (integración)", () => {
  it("rechazar todos cierra la solicitud y encola RECHAZO_TOTAL", async () => {
    const res = await confirmarDecisiones({
      decisiones: itemIds.map((itemId) => ({
        itemId,
        decision: "RECHAZADO" as const,
        condicion: "",
        motivoRechazo: "Sin interés comercial",
      })),
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.actualizados).toBe(2);
    expect(res.solicitudesCerradas).toBe(1);
    expect(res.rechazosNotificados).toBe(1);

    const sol = await prisma.solicitud.findUniqueOrThrow({ where: { id: solicitudId } });
    expect(sol.estado).toBe("FINALIZADA");
    expect(sol.mailFarmaciaEnviado).toBe(true);

    const outbox = await prisma.emailOutbox.findUnique({
      where: { dedupKey: dedupRechazoTotal(solicitudId) },
    });
    expect(outbox).not.toBeNull();
    expect(outbox?.tipo).toBe("RECHAZO_TOTAL_FARMACIA");

    const items = await prisma.itemSolicitud.findMany({ where: { solicitudId } });
    expect(items.every((i) => i.estadoDecision === "RECHAZADO")).toBe(true);
    expect(items.every((i) => i.aprobadorId === compradorId)).toBe(true);
  });

  it("rechaza ítems que ya no están pendientes", async () => {
    const res = await confirmarDecisiones({
      decisiones: [
        { itemId: itemIds[0], decision: "APROBADO", condicion: "50%", motivoRechazo: "" },
      ],
    });
    expect(res.ok).toBe(false);
  });
});
