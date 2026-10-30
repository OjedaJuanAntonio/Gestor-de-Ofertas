import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/lib/prisma";
import { getHistoricoPrecios } from "@/lib/data/precios";

// ─────────────────────────────────────────────────────────────
// Integración: historial de carga de Precios (ítems ya cargados en el ERP).
// ─────────────────────────────────────────────────────────────

const EAN = "7791234500011";

let farmaciaId: number;
let solicitudId: string;
const codigo = `SOL-HPREC-${Date.now()}`;

beforeAll(async () => {
  const f = await prisma.farmacia.create({
    data: { nombre: `Farmacia Hist Precios ${Date.now()}`, email: null },
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
            cantidad: 6,
            motivo: "SOBRESTOCK",
            fechaVencimiento: "10/27",
            estadoDecision: "APROBADO",
            condicionAutorizada: "20% OFF",
            cargadoERP: true,
            fechaCargaERP: new Date(),
            laboratorioHistorico: "Bayer",
            compradorMailHistorico: "c1@drogueria.com",
          },
          {
            codigoBarra: EAN,
            cantidad: 2,
            motivo: "SOBRESTOCK",
            fechaVencimiento: "11/27",
            estadoDecision: "APROBADO",
            condicionAutorizada: "10% OFF",
            cargadoERP: false, // pendiente → NO debe salir en el historial
            laboratorioHistorico: "Bayer",
            compradorMailHistorico: "c1@drogueria.com",
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

describe("getHistoricoPrecios", () => {
  it("incluye los ítems cargados y excluye los pendientes", async () => {
    const r = await getHistoricoPrecios(1);
    const mios = r.items.filter((i) => i.solicitudCodigo === codigo);
    // Solo el cargadoERP=true aparece.
    expect(mios).toHaveLength(1);
    expect(mios[0].condicionAutorizada).toBe("20% OFF");
    expect(mios[0].fechaCargaERP).not.toBeNull();
    expect(mios[0].descripcion).toContain("Aspirina");
  });

  it("devuelve shape paginado", async () => {
    const r = await getHistoricoPrecios(1);
    expect(r.page).toBe(1);
    expect(r.pages).toBeGreaterThanOrEqual(1);
    expect(r.total).toBeGreaterThanOrEqual(1);
  });
});
