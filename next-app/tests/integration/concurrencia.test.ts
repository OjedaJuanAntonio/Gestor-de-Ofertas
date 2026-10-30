import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enviarSolicitud } from "@/lib/actions/solicitudes";
import { confirmarDecisiones } from "@/lib/actions/decisiones";
import { confirmarCargasERP } from "@/lib/actions/precios";
import { marcarTesterEnviado } from "@/lib/actions/testers";
import { dedupConsolidadoFarmacia } from "@/lib/business/email-keys";

const mockAuth = vi.mocked(auth);

// ─────────────────────────────────────────────────────────────
// "Mucho uso en simultáneo": verificamos que las operaciones críticas
// no se rompan ni dupliquen bajo concurrencia real (Postgres). Cada
// prueba dispara N llamadas en paralelo a la misma operación y asegura
// que gane exactamente una (guards TOCTOU / idempotencia / dedup).
// ─────────────────────────────────────────────────────────────

const EAN = "7791234500011"; // Bayer → comprador c1 (seed)
const N = 8;

let adminId: string;
let adminEmail: string;
let c1Id: string;
let preciosId: string;
let farmaciaId: number;
const solicitudIds: string[] = [];

async function crearSolicitudConItem(estadoDecision: "PENDIENTE" | "APROBADO", opts: {
  motivo?: "SOBRESTOCK" | "PROBADOR";
  cargadoERP?: boolean;
  condicion?: string | null;
} = {}) {
  const codigo = `SOL-CONC-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const sol = await prisma.solicitud.create({
    data: {
      codigo,
      idempotencyKey: codigo,
      farmaciaId,
      nombreFarmaciaHistorico: "Farmacia Concurrencia",
      emailFarmaciaHistorico: "concurrencia@test.com",
      estado: estadoDecision === "PENDIENTE" ? "PENDIENTE" : "EN_PROCESO",
      items: {
        create: [
          {
            codigoBarra: EAN,
            cantidad: 3,
            motivo: opts.motivo ?? "SOBRESTOCK",
            fechaVencimiento: "10/27",
            estadoDecision,
            condicionAutorizada: opts.condicion ?? null,
            cargadoERP: opts.cargadoERP ?? false,
            compradorId: c1Id,
            compradorMailHistorico: "c1@drogueria.com",
            laboratorioHistorico: "Bayer",
            ...(estadoDecision === "APROBADO" ? { fechaAprobacion: new Date() } : {}),
          },
        ],
      },
    },
    include: { items: true },
  });
  solicitudIds.push(sol.id);
  return { solId: sol.id, itemId: sol.items[0].id };
}

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@drogueria.com" } });
  const c1 = await prisma.user.findUniqueOrThrow({ where: { email: "c1@drogueria.com" } });
  const precios = await prisma.user.findUniqueOrThrow({ where: { email: "precios@drogueria.com" } });
  adminId = admin.id;
  adminEmail = admin.email;
  c1Id = c1.id;
  preciosId = precios.id;
  const f = await prisma.farmacia.create({
    data: { nombre: `Farmacia Concurrencia ${Date.now()}`, email: "concurrencia@test.com" },
  });
  farmaciaId = f.id;
});

afterAll(async () => {
  // Limpia outbox, auditoría y solicitudes creadas por estas pruebas.
  for (const solId of solicitudIds) {
    await prisma.emailOutbox.deleteMany({ where: { dedupKey: dedupConsolidadoFarmacia(solId) } });
  }
  const items = await prisma.itemSolicitud.findMany({
    where: { solicitudId: { in: solicitudIds } },
    select: { id: true },
  });
  const itemIds = items.map((i) => i.id);
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [...solicitudIds, ...itemIds] } },
  });
  await prisma.solicitud.deleteMany({ where: { id: { in: solicitudIds } } });
  await prisma.farmacia.deleteMany({ where: { id: farmaciaId } });
  await prisma.$disconnect();
});

describe("concurrencia", () => {
  it("enviarSolicitud es idempotente: N envíos con la misma key → 1 sola solicitud", async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "ADMIN", email: adminEmail } } as never);
    const key = `idem-conc-${Date.now()}`;
    const payload = {
      farmaciaId,
      idempotencyKey: key,
      rows: [{ codigoBarra: EAN, cantidad: 5, motivo: "SOBRESTOCK" as const, fechaVencimiento: "10/27", observaciones: "" }],
    };

    const results = await Promise.all(Array.from({ length: N }, () => enviarSolicitud(payload)));

    // Ninguna debe fallar con error (todas OK: 1 crea, el resto detecta duplicado).
    expect(results.every((r) => r.ok)).toBe(true);
    // En la DB hay exactamente UNA solicitud con esa key.
    const creadas = await prisma.solicitud.count({ where: { idempotencyKey: key } });
    expect(creadas).toBe(1);
    // Exactamente una respuesta NO es "duplicada".
    const nuevas = results.filter((r) => r.ok && !r.duplicada);
    expect(nuevas.length).toBe(1);

    const sol = await prisma.solicitud.findUnique({ where: { idempotencyKey: key }, select: { id: true } });
    if (sol) solicitudIds.push(sol.id);
  });

  it("confirmarDecisiones sobre el mismo ítem: gana exactamente una", async () => {
    mockAuth.mockResolvedValue({ user: { id: c1Id, role: "COMPRADOR", email: "c1@drogueria.com" } } as never);
    const { itemId } = await crearSolicitudConItem("PENDIENTE");

    const results = await Promise.all(
      Array.from({ length: N }, () =>
        confirmarDecisiones({ decisiones: [{ itemId, decision: "APROBADO", condicion: "50%", motivoRechazo: "" }] }),
      ),
    );

    const oks = results.filter((r) => r.ok);
    expect(oks.length).toBe(1); // solo una confirma; el resto "ya decidido"
    const item = await prisma.itemSolicitud.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.estadoDecision).toBe("APROBADO");
    // Un solo registro de auditoría APROBAR para ese ítem (no se duplicó).
    const audits = await prisma.auditLog.count({
      where: { entityId: itemId, action: "APROBAR" },
    });
    expect(audits).toBe(1);
  });

  it("confirmarCargasERP sobre el mismo ítem: no duplica el correo consolidado", async () => {
    mockAuth.mockResolvedValue({ user: { id: preciosId, role: "PRECIOS", email: "precios@drogueria.com" } } as never);
    const { solId, itemId } = await crearSolicitudConItem("APROBADO", { condicion: "50%" });

    const results = await Promise.all(
      Array.from({ length: N }, () => confirmarCargasERP({ itemIds: [itemId] })),
    );

    // Al menos una confirma; ninguna lanza excepción no controlada.
    expect(results.some((r) => r.ok)).toBe(true);
    const item = await prisma.itemSolicitud.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.cargadoERP).toBe(true);
    // Exactamente UN correo consolidado encolado (dedup lo garantiza).
    const correos = await prisma.emailOutbox.count({
      where: { dedupKey: dedupConsolidadoFarmacia(solId) },
    });
    expect(correos).toBe(1);
  });

  it("marcarTesterEnviado sobre el mismo tester: gana exactamente una", async () => {
    mockAuth.mockResolvedValue({ user: { id: c1Id, role: "COMPRADOR", email: "c1@drogueria.com" } } as never);
    const { itemId } = await crearSolicitudConItem("APROBADO", { motivo: "PROBADOR" });

    const results = await Promise.all(
      Array.from({ length: N }, () => marcarTesterEnviado({ itemIds: [itemId] })),
    );

    const oks = results.filter((r) => r.ok);
    expect(oks.length).toBe(1);
    const item = await prisma.itemSolicitud.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.testerEnviado).toBe(true);
  });
});
