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
    const r = await getHistoricoPrecios({ page: 1 });
    const mios = r.items.filter((i) => i.solicitudCodigo === codigo);
    // Solo el cargadoERP=true aparece.
    expect(mios).toHaveLength(1);
    expect(mios[0].condicionAutorizada).toBe("20% OFF");
    expect(mios[0].fechaCargaERP).not.toBeNull();
    expect(mios[0].descripcion).toContain("Aspirina");
  });

  it("devuelve shape paginado", async () => {
    const r = await getHistoricoPrecios({ page: 1 });
    expect(r.page).toBe(1);
    expect(r.pages).toBeGreaterThanOrEqual(1);
    expect(r.total).toBeGreaterThanOrEqual(1);
  });

  it("busca por código de solicitud (casilla de búsqueda)", async () => {
    const r = await getHistoricoPrecios({ q: codigo });
    expect(r.items.length).toBe(1);
    expect(r.items[0].solicitudCodigo).toBe(codigo);
  });

  it("búsqueda sin coincidencias devuelve vacío", async () => {
    const r = await getHistoricoPrecios({ q: "NO-EXISTE-XYZ-123" });
    expect(r.items.length).toBe(0);
  });

  it("un sort desconocido cae en el orden por defecto (no rompe)", async () => {
    const r = await getHistoricoPrecios({ q: codigo, sort: "columna-invalida" });
    expect(r.items.length).toBe(1);
    expect(r.items[0].solicitudCodigo).toBe(codigo);
  });

  it("ordena por cantidad sin romper (cabecera de columna)", async () => {
    const r = await getHistoricoPrecios({ q: codigo, sort: "cantidad", dir: "asc" });
    expect(r.items.length).toBe(1);
  });

  it("filtra por rango de fechas: incluye hoy", async () => {
    const r = await getHistoricoPrecios({ q: codigo, desde: "2020-01-01" });
    expect(r.items.length).toBe(1);
  });

  it("filtra por rango de fechas: excluye con hasta en el pasado", async () => {
    const r = await getHistoricoPrecios({ q: codigo, hasta: "2020-01-01" });
    expect(r.items.length).toBe(0);
  });
});
