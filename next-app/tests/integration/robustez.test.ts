import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enviarSolicitud } from "@/lib/actions/solicitudes";

const mockAuth = vi.mocked(auth);

// ─────────────────────────────────────────────────────────────
// "A prueba de idiotas": entradas disparatadas o fuera de lugar no
// deben romper el sistema ni colarse. Testea el Server Action real.
// ─────────────────────────────────────────────────────────────

const EAN = "7791234500011"; // existe en el seed

let farmaciaUserId: string;
let farmaciaPropiaId: number;
let farmaciaAjenaId: number;
let adminId: string;
const solicitudIds: string[] = [];

beforeAll(async () => {
  const fUser = await prisma.user.findFirstOrThrow({
    where: { role: "FARMACIA", farmaciaId: { not: null } },
    select: { id: true, farmaciaId: true },
  });
  farmaciaUserId = fUser.id;
  farmaciaPropiaId = fUser.farmaciaId!;
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@drogueria.com" } });
  adminId = admin.id;
  const ajena = await prisma.farmacia.create({
    data: { nombre: `Farmacia Ajena ${Date.now()}`, email: null },
  });
  farmaciaAjenaId = ajena.id;
});

afterAll(async () => {
  if (solicitudIds.length) {
    const items = await prisma.itemSolicitud.findMany({
      where: { solicitudId: { in: solicitudIds } },
      select: { id: true },
    });
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [...solicitudIds, ...items.map((i) => i.id)] } },
    });
    await prisma.solicitud.deleteMany({ where: { id: { in: solicitudIds } } });
  }
  await prisma.farmacia.deleteMany({ where: { id: farmaciaAjenaId } });
  await prisma.$disconnect();
});

const row = (over: Partial<{ cantidad: number }> = {}) => ({
  codigoBarra: EAN,
  cantidad: over.cantidad ?? 5,
  motivo: "SOBRESTOCK" as const,
  fechaVencimiento: "10/27",
  observaciones: "",
});

describe("robustez / a prueba de idiotas", () => {
  it("una farmacia NO puede cargar para otra farmacia", async () => {
    mockAuth.mockResolvedValue({
      user: { id: farmaciaUserId, role: "FARMACIA", farmaciaId: farmaciaPropiaId },
    } as never);

    const res = await enviarSolicitud({
      farmaciaId: farmaciaAjenaId, // ← otra farmacia
      idempotencyKey: `robustez-ajena-${Date.now()}`,
      rows: [row()],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/otra farmacia/i);
  });

  it("una farmacia SÍ puede cargar para la suya", async () => {
    mockAuth.mockResolvedValue({
      user: { id: farmaciaUserId, role: "FARMACIA", farmaciaId: farmaciaPropiaId },
    } as never);

    const res = await enviarSolicitud({
      farmaciaId: farmaciaPropiaId,
      idempotencyKey: `robustez-propia-${Date.now()}`,
      rows: [row()],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const creada = await prisma.solicitud.findFirstOrThrow({ where: { codigo: res.codigo } });
      solicitudIds.push(creada.id);
    }
  });

  it("una cantidad disparatada no rompe: falla con error de fila, sin crash", async () => {
    mockAuth.mockResolvedValue({
      user: { id: adminId, role: "ADMIN", email: "admin@drogueria.com" },
    } as never);

    const res = await enviarSolicitud({
      farmaciaId: farmaciaPropiaId,
      idempotencyKey: `robustez-cantidad-${Date.now()}`,
      rows: [row({ cantidad: 2_147_483_648 })], // > Int de 32 bits
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.erroresFila?.length).toBeGreaterThan(0);
      expect(res.erroresFila?.[0].error).toMatch(/cantidad/i);
    }
    // No se creó ninguna solicitud con esa key.
    const creadas = await prisma.solicitud.count({
      where: { idempotencyKey: { startsWith: "robustez-cantidad-" } },
    });
    expect(creadas).toBe(0);
  });

  it("sin ítems: rechaza (no se puede enviar una solicitud vacía)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: adminId, role: "ADMIN", email: "admin@drogueria.com" },
    } as never);
    const res = await enviarSolicitud({
      farmaciaId: farmaciaPropiaId,
      idempotencyKey: `robustez-vacia-${Date.now()}`,
      rows: [],
    });
    expect(res.ok).toBe(false);
  });
});
