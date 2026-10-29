import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/lib/prisma";
import { lookupArticulosBatch, invalidarTodosLosArticulos } from "@/lib/data/articulos";

// ─────────────────────────────────────────────────────────────
// Integración: resolución por lotes del maestro contra Postgres.
// Usa los EAN del seed (Bayer/Roche → c1; Genéricos SA → sin comprador).
// ─────────────────────────────────────────────────────────────

const EAN_BAYER = "7791234500011"; // Aspirina → Bayer → c1
const EAN_ROCHE = "7791234500042"; // Rivotril → Roche → c1
const EAN_SIN_COMPRADOR = "7791234500110"; // Genéricos SA → sin comprador
const EAN_INEXISTENTE = "0000000000000";

beforeAll(() => {
  // Partimos de caché limpia para no depender de otros tests.
  invalidarTodosLosArticulos();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("lookupArticulosBatch (integración)", () => {
  it("resuelve varios EAN con su comprador en una sola pasada", async () => {
    const c1 = await prisma.user.findUniqueOrThrow({ where: { email: "c1@drogueria.com" } });

    const map = await lookupArticulosBatch([
      EAN_BAYER,
      EAN_ROCHE,
      EAN_SIN_COMPRADOR,
      EAN_INEXISTENTE,
    ]);

    // Bayer y Roche → comprador c1.
    expect(map.get(EAN_BAYER)?.compradorId).toBe(c1.id);
    expect(map.get(EAN_BAYER)?.laboratorio).toBe("Bayer");
    expect(map.get(EAN_ROCHE)?.compradorId).toBe(c1.id);

    // Laboratorio sin responsable → artículo existe pero comprador null.
    const sinComprador = map.get(EAN_SIN_COMPRADOR);
    expect(sinComprador).toBeTruthy();
    expect(sinComprador?.compradorId).toBeNull();

    // EAN inexistente → null explícito en el Map.
    expect(map.get(EAN_INEXISTENTE)).toBeNull();
  });

  it("deduplica EAN repetidos y normaliza la clave", async () => {
    invalidarTodosLosArticulos();
    const map = await lookupArticulosBatch([EAN_BAYER, `  ${EAN_BAYER}  `, EAN_BAYER]);
    expect(map.size).toBe(1);
    expect(map.get(EAN_BAYER)?.descripcion).toContain("Aspirina");
  });

  it("devuelve un Map vacío si no hay EAN válidos", async () => {
    const map = await lookupArticulosBatch(["", "   "]);
    expect(map.size).toBe(0);
  });
});
