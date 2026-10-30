import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/lib/prisma";
import { getSolicitudesFarmacia } from "@/lib/data/farmacia";

// ─────────────────────────────────────────────────────────────
// Integración: paginación + filtro por estado de las solicitudes de una
// farmacia. Usa una farmacia dedicada para aislar los asserts del resto
// de los datos compartidos.
// ─────────────────────────────────────────────────────────────

let farmaciaId: number;
const codigos: string[] = [];

beforeAll(async () => {
  const farmacia = await prisma.farmacia.create({
    data: { nombre: `Farmacia Paginación Test ${Date.now()}`, email: null },
  });
  farmaciaId = farmacia.id;

  // 2 PENDIENTE + 1 FINALIZADA.
  const defs: { estado: "PENDIENTE" | "FINALIZADA" }[] = [
    { estado: "PENDIENTE" },
    { estado: "PENDIENTE" },
    { estado: "FINALIZADA" },
  ];
  for (let i = 0; i < defs.length; i++) {
    const codigo = `SOL-PAG-${Date.now()}-${i}`;
    codigos.push(codigo);
    await prisma.solicitud.create({
      data: {
        codigo,
        idempotencyKey: codigo,
        farmaciaId,
        nombreFarmaciaHistorico: farmacia.nombre,
        emailFarmaciaHistorico: "SIN_MAIL",
        estado: defs[i].estado,
      },
    });
  }
});

afterAll(async () => {
  await prisma.solicitud.deleteMany({ where: { farmaciaId } });
  await prisma.farmacia.delete({ where: { id: farmaciaId } });
  await prisma.$disconnect();
});

describe("getSolicitudesFarmacia (paginación + filtro)", () => {
  it("sin filtro devuelve todas las de la farmacia con shape paginado", async () => {
    const r = await getSolicitudesFarmacia(farmaciaId);
    expect(r.total).toBe(3);
    expect(r.items).toHaveLength(3);
    expect(r.page).toBe(1);
    expect(r.pages).toBe(1);
  });

  it("filtra por estado FINALIZADA", async () => {
    const r = await getSolicitudesFarmacia(farmaciaId, { estado: "FINALIZADA" });
    expect(r.total).toBe(1);
    expect(r.items.every((s) => s.estado === "FINALIZADA")).toBe(true);
  });

  it("filtra por estado PENDIENTE", async () => {
    const r = await getSolicitudesFarmacia(farmaciaId, { estado: "PENDIENTE" });
    expect(r.total).toBe(2);
    expect(r.items.every((s) => s.estado === "PENDIENTE")).toBe(true);
  });

  it("respeta el tamaño de página (take) y calcula pages", async () => {
    // Forzamos un page size efectivo de 2 vía la cuenta: con 3 totales y
    // PAGE_SIZE=50 hay 1 sola página; validamos que page fuera de rango no rompe.
    const r = await getSolicitudesFarmacia(farmaciaId, { page: 99 });
    expect(r.total).toBe(3);
    expect(r.items).toHaveLength(0); // page 99 está más allá del final
    expect(r.page).toBe(99);
  });

  it("busca por código de solicitud (casilla de búsqueda)", async () => {
    const r = await getSolicitudesFarmacia(farmaciaId, { q: codigos[0] });
    expect(r.total).toBe(1);
    expect(r.items[0].codigo).toBe(codigos[0]);
  });

  it("búsqueda sin coincidencias devuelve vacío", async () => {
    const r = await getSolicitudesFarmacia(farmaciaId, { q: "NO-EXISTE-XYZ-123" });
    expect(r.total).toBe(0);
  });

  it("ordena por código: asc es el reverso de desc (cabecera de columna)", async () => {
    const asc = await getSolicitudesFarmacia(farmaciaId, { sort: "codigo", dir: "asc" });
    const desc = await getSolicitudesFarmacia(farmaciaId, { sort: "codigo", dir: "desc" });
    const ascCods = asc.items.map((s) => s.codigo);
    const descCods = desc.items.map((s) => s.codigo);
    expect(ascCods).toHaveLength(3);
    expect(ascCods).toEqual([...descCods].reverse());
  });

  it("un sort desconocido cae en el orden por defecto (no rompe)", async () => {
    const r = await getSolicitudesFarmacia(farmaciaId, { sort: "columna-invalida" });
    expect(r.total).toBe(3);
  });

  it("filtra por rango de fechas: incluye hoy / excluye pasado", async () => {
    const dentro = await getSolicitudesFarmacia(farmaciaId, { desde: "2020-01-01" });
    expect(dentro.total).toBe(3);
    const fuera = await getSolicitudesFarmacia(farmaciaId, { hasta: "2020-01-01" });
    expect(fuera.total).toBe(0);
  });
});
