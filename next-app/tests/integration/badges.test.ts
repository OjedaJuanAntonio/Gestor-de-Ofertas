import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { getBadgeCounts } from "@/lib/data/badges";
import { getPendientesPrecios } from "@/lib/data/precios";

// ─────────────────────────────────────────────────────────────
// Integración: el badge "Carga ERP" debe contar lo mismo que la lista
// de Precios. Antes incluía los probadores aprobados, que nunca pasan
// por el ERP, así que el número crecía sin bajar jamás.
// ─────────────────────────────────────────────────────────────

const EAN = "7791234500011";
let farmaciaId: string;
let preciosId: string;

beforeAll(async () => {
  const precios = await prisma.user.findUniqueOrThrow({ where: { email: "precios@drogueria.com" } });
  preciosId = precios.id;
  const f = await prisma.farmacia.create({
    data: { id: `BADGE-${Date.now()}`, nombre: `Farmacia Badge ${Date.now()}`, email: null },
  });
  farmaciaId = f.id;
});

afterAll(async () => {
  await prisma.solicitud.deleteMany({ where: { farmaciaId } });
  await prisma.farmacia.deleteMany({ where: { id: farmaciaId } });
  await prisma.$disconnect();
});

describe("badge de Precios", () => {
  it("un probador aprobado no suma; un ítem común aprobado sí", async () => {
    const antes = (await getBadgeCounts("PRECIOS", preciosId)).preciosPendientes ?? 0;

    const codigo = `SOL-BADGE-${Date.now()}`;
    const base = {
      codigoBarra: EAN,
      cantidad: 1,
      estadoDecision: "APROBADO" as const,
      laboratorioHistorico: "Bayer",
      compradorMailHistorico: "c1@drogueria.com",
    };
    await prisma.solicitud.create({
      data: {
        codigo,
        idempotencyKey: codigo,
        farmaciaId,
        nombreFarmaciaHistorico: "Farmacia Badge",
        emailFarmaciaHistorico: "SIN_MAIL",
        estado: "EN_PROCESO",
        items: {
          create: [
            { ...base, motivo: "PROBADOR" },
            { ...base, motivo: "SOBRESTOCK", fechaVencimiento: "10/27", condicionAutorizada: "50%" },
          ],
        },
      },
    });

    const despues = (await getBadgeCounts("PRECIOS", preciosId)).preciosPendientes ?? 0;
    expect(despues - antes).toBe(1);
    // Y coincide con el total de la lista que ve Precios.
    expect(despues).toBe((await getPendientesPrecios(1)).total);
  });
});
