import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Envuelve el generador real: por defecto genera códigos reales, pero podemos
// forzar una colisión con mockReturnValueOnce en un test puntual.
vi.mock("@/lib/business/solicitud", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/business/solicitud")>();
  return { ...actual, generateSolicitudCodigo: vi.fn(actual.generateSolicitudCodigo) };
});

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enviarSolicitud } from "@/lib/actions/solicitudes";
import { generateSolicitudCodigo } from "@/lib/business/solicitud";

const mockAuth = vi.mocked(auth);
const mockCodigo = vi.mocked(generateSolicitudCodigo);

const EAN = "7791234500011";

let adminId: string;
let adminEmail: string;
let farmaciaId: number;
const solicitudIds: string[] = [];

const rows = [
  {
    codigoBarra: EAN,
    cantidad: 4,
    motivo: "SOBRESTOCK" as const,
    fechaVencimiento: "10/27",
    observaciones: "",
  },
];

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@drogueria.com" } });
  adminId = admin.id;
  adminEmail = admin.email;
  const f = await prisma.farmacia.create({
    data: { nombre: `Farmacia Colisión ${Date.now()}`, email: "colision@test.com" },
  });
  farmaciaId = f.id;
  mockAuth.mockResolvedValue({ user: { id: adminId, role: "ADMIN", email: adminEmail } } as never);
});

afterAll(async () => {
  const items = await prisma.itemSolicitud.findMany({
    where: { solicitudId: { in: solicitudIds } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [...solicitudIds, ...items.map((i) => i.id)] } },
  });
  await prisma.solicitud.deleteMany({ where: { id: { in: solicitudIds } } });
  await prisma.farmacia.deleteMany({ where: { id: farmaciaId } });
  await prisma.$disconnect();
});

describe("colisión del código legible", () => {
  it("si el código choca, reintenta con otro de forma transparente", async () => {
    const colision = `SOL-COLISION-${Date.now()}`;
    // Pre-ocupa ese código con otra solicitud (idempotencyKey distinta).
    const previa = await prisma.solicitud.create({
      data: {
        codigo: colision,
        idempotencyKey: `previa-${Date.now()}`,
        farmaciaId,
        nombreFarmaciaHistorico: "previa",
        emailFarmaciaHistorico: "previa@test.com",
      },
    });
    solicitudIds.push(previa.id);

    // El PRIMER intento devuelve el código ya ocupado; el resto, códigos reales.
    mockCodigo.mockReturnValueOnce(colision);

    const res = await enviarSolicitud({
      farmaciaId,
      idempotencyKey: `nueva-${Date.now()}`,
      rows,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.duplicada).toBe(false);
      expect(res.codigo).not.toBe(colision); // usó un código nuevo
      // Se llamó al generador al menos dos veces (colisión + reintento).
      expect(mockCodigo.mock.calls.length).toBeGreaterThanOrEqual(2);
      const creada = await prisma.solicitud.findFirstOrThrow({ where: { codigo: res.codigo } });
      solicitudIds.push(creada.id);
    }
  });

  it("reenviar el mismo lote (misma idempotencyKey) sigue devolviendo duplicada", async () => {
    const key = `dup-${Date.now()}`;
    const r1 = await enviarSolicitud({ farmaciaId, idempotencyKey: key, rows });
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      const creada = await prisma.solicitud.findFirstOrThrow({ where: { codigo: r1.codigo } });
      solicitudIds.push(creada.id);
    }

    const r2 = await enviarSolicitud({ farmaciaId, idempotencyKey: key, rows });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.duplicada).toBe(true);
  });
});
