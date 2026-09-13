import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { confirmarCargasERP } from "@/lib/actions/precios";
import { dedupConsolidadoFarmacia } from "@/lib/business/email-keys";

const mockAuth = vi.mocked(auth);

// ─────────────────────────────────────────────────────────────
// Integración: cierre de ciclo de Precios contra Postgres.
// Una solicitud con 1 aprobado + 1 rechazado: al cargar el aprobado
// en el ERP, la solicitud finaliza y se encola el CONSOLIDADO con el
// detalle final (aprobados con condición + rechazados).
// ─────────────────────────────────────────────────────────────

let solicitudId: string;
let itemAprobadoId: string;
const codigo = `SOL-TESTP-${Date.now()}`;

beforeAll(async () => {
  const comprador = await prisma.user.findUniqueOrThrow({
    where: { email: "c1@drogueria.com" },
  });
  const farmacia = await prisma.farmacia.findFirstOrThrow({ where: { email: { not: null } } });

  const sol = await prisma.solicitud.create({
    data: {
      codigo,
      idempotencyKey: codigo,
      estado: "EN_PROCESO",
      farmaciaId: farmacia.id,
      nombreFarmaciaHistorico: farmacia.nombre,
      emailFarmaciaHistorico: farmacia.email!,
      items: {
        create: [
          {
            codigoBarra: "7791234500011",
            cantidad: 10,
            motivo: "SOBRESTOCK",
            estadoDecision: "APROBADO",
            condicionAutorizada: "50%",
            compradorId: comprador.id,
            aprobadorId: comprador.id,
            aprobadorMail: "c1@drogueria.com",
            fechaAprobacion: new Date(),
            compradorMailHistorico: "c1@drogueria.com",
            laboratorioHistorico: "Bayer",
          },
          {
            codigoBarra: "7791234500028",
            cantidad: 4,
            motivo: "VENCIMIENTO_PROXIMO",
            estadoDecision: "RECHAZADO",
            motivoRechazo: "Vence muy pronto",
            compradorId: comprador.id,
            aprobadorId: comprador.id,
            aprobadorMail: "c1@drogueria.com",
            fechaAprobacion: new Date(),
            compradorMailHistorico: "c1@drogueria.com",
            laboratorioHistorico: "Bayer",
          },
        ],
      },
    },
    include: { items: true },
  });
  solicitudId = sol.id;
  itemAprobadoId = sol.items.find((i) => i.estadoDecision === "APROBADO")!.id;

  mockAuth.mockResolvedValue({
    user: { id: "precios-test", role: "PRECIOS", email: "precios@drogueria.com" },
  } as never);
});

afterAll(async () => {
  await prisma.emailOutbox.deleteMany({ where: { dedupKey: dedupConsolidadoFarmacia(solicitudId) } });
  await prisma.auditLog.deleteMany({ where: { entityId: itemAprobadoId } });
  await prisma.solicitud.deleteMany({ where: { id: solicitudId } });
  await prisma.$disconnect();
});

describe("confirmarCargasERP (integración)", () => {
  it("cargar el aprobado finaliza la solicitud y encola el CONSOLIDADO", async () => {
    const res = await confirmarCargasERP({ itemIds: [itemAprobadoId] });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.cargados).toBe(1);
    expect(res.solicitudesFinalizadas).toBe(1);
    expect(res.correosEncolados).toBe(1);

    const sol = await prisma.solicitud.findUniqueOrThrow({ where: { id: solicitudId } });
    expect(sol.estado).toBe("FINALIZADA");
    expect(sol.mailFarmaciaEnviado).toBe(true);

    const item = await prisma.itemSolicitud.findUniqueOrThrow({ where: { id: itemAprobadoId } });
    expect(item.cargadoERP).toBe(true);
    expect(item.fechaCargaERP).not.toBeNull();

    const outbox = await prisma.emailOutbox.findUniqueOrThrow({
      where: { dedupKey: dedupConsolidadoFarmacia(solicitudId) },
    });
    expect(outbox.tipo).toBe("CONSOLIDADO_FARMACIA");
    const payload = outbox.payload as { items: unknown[] };
    expect(payload.items).toHaveLength(2); // incluye aprobado + rechazado
  });

  it("no permite recargar un ítem ya cargado", async () => {
    const res = await confirmarCargasERP({ itemIds: [itemAprobadoId] });
    expect(res.ok).toBe(false);
  });
});
