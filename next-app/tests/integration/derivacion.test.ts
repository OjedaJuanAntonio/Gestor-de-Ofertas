import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// Mockeamos auth (sesión del admin) y next/cache (revalidatePath).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reasignarItems } from "@/lib/actions/derivacion";
import { listItemsSinComprador } from "@/lib/data/admin";

const mockAuth = vi.mocked(auth);

// ─────────────────────────────────────────────────────────────
// Integración: derivación de ítems sin comprador (Admin) contra
// Postgres. "Genéricos SA" es un laboratorio sin comprador en el
// seed → sus ítems quedan huérfanos y deben poder derivarse.
// ─────────────────────────────────────────────────────────────

const LAB_HUERFANO = "Genéricos SA";
const CODIGO_HUERFANO = "7791234500110"; // Paracetamol Genérico (lab sin comprador)

let adminId: string;
let adminEmail: string;
let compradorId: string;
let compradorEmail: string;
let solicitudId: string;
let itemId: string;
const codigo = `SOL-TEST-DERIV-${Date.now()}`;

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@drogueria.com" } });
  adminId = admin.id;
  adminEmail = admin.email;
  const comprador = await prisma.user.findUniqueOrThrow({ where: { email: "c1@drogueria.com" } });
  compradorId = comprador.id;
  compradorEmail = comprador.email;
  const farmacia = await prisma.farmacia.findFirstOrThrow();

  // Solicitud con un ítem huérfano (compradorId = null), como lo dejaría
  // enviarSolicitud cuando el laboratorio no tiene comprador asignado.
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
            codigoBarra: CODIGO_HUERFANO,
            cantidad: 7,
            motivo: "SOBRESTOCK",
            compradorId: null,
            compradorMailHistorico: "SIN_COMPRADOR",
            laboratorioHistorico: LAB_HUERFANO,
          },
        ],
      },
    },
    include: { items: true },
  });
  solicitudId = sol.id;
  itemId = sol.items[0].id;

  mockAuth.mockResolvedValue({
    user: { id: adminId, role: "ADMIN", email: adminEmail },
  } as never);
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: itemId } });
  await prisma.solicitud.deleteMany({ where: { id: solicitudId } });
  await prisma.laboratorioComprador.deleteMany({
    where: { userId: compradorId, laboratorio: LAB_HUERFANO },
  });
  await prisma.$disconnect();
});

describe("reasignarItems (integración)", () => {
  it("lista el ítem huérfano como sin asignar", async () => {
    const huerfanos = await listItemsSinComprador();
    const found = huerfanos.find((h) => h.id === itemId);
    expect(found).toBeTruthy();
    expect(found?.laboratorioHistorico).toBe(LAB_HUERFANO);
  });

  it("rechaza la derivación si no es admin", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: compradorId, role: "COMPRADOR", email: compradorEmail },
    } as never);
    const res = await reasignarItems({ itemIds: [itemId], compradorId, crearMapeo: false });
    expect(res.ok).toBe(false);
  });

  it("deriva el ítem al comprador y crea la regla laboratorio→comprador", async () => {
    const res = await reasignarItems({ itemIds: [itemId], compradorId, crearMapeo: true });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.derivados).toBe(1);
    expect(res.mapeosCreados).toBe(1);

    const item = await prisma.itemSolicitud.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.compradorId).toBe(compradorId);
    expect(item.compradorMailHistorico).toBe(compradorEmail);
    expect(item.estadoDecision).toBe("PENDIENTE"); // sigue pendiente, ahora en la bandeja del comprador

    const regla = await prisma.laboratorioComprador.findUnique({
      where: { userId_laboratorio: { userId: compradorId, laboratorio: LAB_HUERFANO } },
    });
    expect(regla).not.toBeNull();

    const auditoria = await prisma.auditLog.findFirst({
      where: { entityId: itemId, action: "DERIVAR" },
    });
    expect(auditoria).not.toBeNull();

    // Ya no debe figurar como sin asignar.
    const huerfanos = await listItemsSinComprador();
    expect(huerfanos.find((h) => h.id === itemId)).toBeUndefined();
  });

  it("no permite re-derivar un ítem que ya tiene comprador", async () => {
    const res = await reasignarItems({ itemIds: [itemId], compradorId, crearMapeo: false });
    expect(res.ok).toBe(false);
  });
});
