import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/lib/prisma";
import { getSolicitudDetalle } from "@/lib/data/farmacia";

// ─────────────────────────────────────────────────────────────
// Integración: detalle de una solicitud + scoping por farmacia.
// Usa farmacias dedicadas y un EAN del seed (FK a Articulo).
// ─────────────────────────────────────────────────────────────

const EAN = "7791234500011"; // Aspirina (Bayer), existe en el seed

let farmaciaA: number;
let farmaciaB: number;
let solicitudId: string;

beforeAll(async () => {
  const a = await prisma.farmacia.create({
    data: { nombre: `Farmacia Detalle A ${Date.now()}`, email: null },
  });
  const b = await prisma.farmacia.create({
    data: { nombre: `Farmacia Detalle B ${Date.now()}`, email: null },
  });
  farmaciaA = a.id;
  farmaciaB = b.id;

  const codigo = `SOL-DET-${Date.now()}`;
  const sol = await prisma.solicitud.create({
    data: {
      codigo,
      idempotencyKey: codigo,
      farmaciaId: farmaciaA,
      nombreFarmaciaHistorico: a.nombre,
      emailFarmaciaHistorico: "SIN_MAIL",
      estado: "FINALIZADA",
      items: {
        create: [
          {
            codigoBarra: EAN,
            cantidad: 5,
            motivo: "SOBRESTOCK",
            fechaVencimiento: "10/27",
            estadoDecision: "APROBADO",
            condicionAutorizada: "50% OFF",
            laboratorioHistorico: "Bayer",
            compradorMailHistorico: "c1@drogueria.com",
          },
          {
            codigoBarra: EAN,
            cantidad: 3,
            motivo: "STOCK_INMOVILIZADO",
            fechaVencimiento: "11/27",
            estadoDecision: "RECHAZADO",
            motivoRechazo: "No hay demanda",
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
  await prisma.farmacia.deleteMany({ where: { id: { in: [farmaciaA, farmaciaB] } } });
  await prisma.$disconnect();
});

describe("getSolicitudDetalle", () => {
  it("devuelve el detalle con sus ítems para la farmacia dueña", async () => {
    const d = await getSolicitudDetalle(solicitudId, farmaciaA);
    expect(d).not.toBeNull();
    expect(d!.items).toHaveLength(2);
    const aprobado = d!.items.find((i) => i.estadoDecision === "APROBADO");
    const rechazado = d!.items.find((i) => i.estadoDecision === "RECHAZADO");
    expect(aprobado?.condicionAutorizada).toBe("50% OFF");
    expect(aprobado?.descripcion).toContain("Aspirina");
    expect(rechazado?.motivoRechazo).toBe("No hay demanda");
  });

  it("no la devuelve a otra farmacia (scoping)", async () => {
    const d = await getSolicitudDetalle(solicitudId, farmaciaB);
    expect(d).toBeNull();
  });

  it("admin (farmaciaId null) ve cualquiera", async () => {
    const d = await getSolicitudDetalle(solicitudId, null);
    expect(d).not.toBeNull();
    expect(d!.codigo).toMatch(/^SOL-DET-/);
  });

  it("id inexistente devuelve null", async () => {
    const d = await getSolicitudDetalle("no-existe-id", null);
    expect(d).toBeNull();
  });
});
