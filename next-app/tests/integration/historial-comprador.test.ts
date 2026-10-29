import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/lib/prisma";
import { getHistoricoComprador } from "@/lib/data/comprador";

// ─────────────────────────────────────────────────────────────
// Integración: histórico del comprador (aprobados/rechazados) + filtro.
// Crea una solicitud dedicada con ítems decididos para c1 y verifica
// el invariante del filtro (robusto ante otros datos del test DB).
// ─────────────────────────────────────────────────────────────

const EAN = "7791234500011"; // Aspirina (Bayer), existe en el seed

let compradorId: string;
let farmaciaId: number;
let solicitudId: string;
const codigo = `SOL-HIST-${Date.now()}`;

beforeAll(async () => {
  const c1 = await prisma.user.findUniqueOrThrow({ where: { email: "c1@drogueria.com" } });
  compradorId = c1.id;
  const f = await prisma.farmacia.create({
    data: { nombre: `Farmacia Hist Comprador ${Date.now()}`, email: null },
  });
  farmaciaId = f.id;

  const sol = await prisma.solicitud.create({
    data: {
      codigo,
      idempotencyKey: codigo,
      farmaciaId,
      nombreFarmaciaHistorico: f.nombre,
      emailFarmaciaHistorico: "SIN_MAIL",
      estado: "FINALIZADA",
      items: {
        create: [
          {
            codigoBarra: EAN,
            cantidad: 4,
            motivo: "SOBRESTOCK",
            fechaVencimiento: "10/27",
            estadoDecision: "APROBADO",
            condicionAutorizada: "30% OFF",
            fechaAprobacion: new Date(),
            compradorId,
            compradorMailHistorico: "c1@drogueria.com",
            laboratorioHistorico: "Bayer",
          },
          {
            codigoBarra: EAN,
            cantidad: 2,
            motivo: "STOCK_INMOVILIZADO",
            fechaVencimiento: "11/27",
            estadoDecision: "RECHAZADO",
            motivoRechazo: "Sin interés comercial",
            fechaAprobacion: new Date(),
            compradorId,
            compradorMailHistorico: "c1@drogueria.com",
            laboratorioHistorico: "Bayer",
          },
        ],
      },
    },
  });
  solicitudId = sol.id;
});

afterAll(async () => {
  await prisma.solicitud.deleteMany({ where: { id: solicitudId } });
  await prisma.farmacia.deleteMany({ where: { id: farmaciaId } });
  await prisma.$disconnect();
});

describe("getHistoricoComprador (filtro por estado)", () => {
  it("sin filtro incluye los ítems decididos de la solicitud", async () => {
    const r = await getHistoricoComprador(compradorId);
    const mios = r.items.filter((i) => i.solicitudCodigo === codigo);
    // La solicitud está recién creada (fechaAprobacion = ahora) → aparece en page 1.
    expect(mios.map((i) => i.estadoDecision).sort()).toEqual(["APROBADO", "RECHAZADO"]);
    const aprob = mios.find((i) => i.estadoDecision === "APROBADO");
    expect(aprob?.condicionAutorizada).toBe("30% OFF");
  });

  it("filtrando APROBADO solo trae aprobados", async () => {
    const r = await getHistoricoComprador(compradorId, { estado: "APROBADO" });
    expect(r.items.every((i) => i.estadoDecision === "APROBADO")).toBe(true);
    expect(r.items.some((i) => i.solicitudCodigo === codigo)).toBe(true);
  });

  it("filtrando RECHAZADO solo trae rechazados", async () => {
    const r = await getHistoricoComprador(compradorId, { estado: "RECHAZADO" });
    expect(r.items.every((i) => i.estadoDecision === "RECHAZADO")).toBe(true);
    const mio = r.items.find((i) => i.solicitudCodigo === codigo);
    expect(mio?.motivoRechazo).toBe("Sin interés comercial");
  });
});
