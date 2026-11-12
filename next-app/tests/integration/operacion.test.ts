import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  toggleUsuario,
  asignarCompradorProveedor,
  toggleProveedor,
  crearFarmacia,
  resetearAClaveTemporal,
} from "@/lib/actions/admin";
import { enviarSolicitud } from "@/lib/actions/solicitudes";
import { lookupArticulo, invalidarTodosLosArticulos } from "@/lib/data/articulos";
import { getBandejaComprador } from "@/lib/data/comprador";
import { getBadgeCounts } from "@/lib/data/badges";
import { listAuditoria, resumenColaCorreos } from "@/lib/data/admin";
import { POST as cronOutbox } from "@/app/api/cron/outbox/route";

const mockAuth = vi.mocked(auth);

// ─────────────────────────────────────────────────────────────
// Integración — operación del día a día (tanda 4 de la auditoría):
//  - ítems que quedaban varados al desactivar un comprador o al
//    reasignar un proveedor;
//  - el envío decide el comprador con la base, no con la caché;
//  - el admin ve los pendientes de todos;
//  - las acciones de admin quedan en la auditoría;
//  - el endpoint del cron solo acepta el secreto.
// ─────────────────────────────────────────────────────────────

const TAG = `OPER-${Date.now()}`;
const EAN = `9966${String(Date.now()).slice(-9)}`;
const mail = (n: string) => `${n}-${TAG}@farma.test`.toLowerCase();
// Código de farmacia válido (hasta 20 caracteres) para probar la auditoría del alta.
const COD_AUD = `AUD${String(Date.now()).slice(-9)}`;

let adminId: string;
let adminSession: never;
let farmaciaId: string;
let proveedorId: number;
let compA: string;
let compB: string;

async function crearSolicitud(items: { estado: "PENDIENTE" | "APROBADO"; compradorId: string | null }[]) {
  const codigo = `SOL-${TAG}-${Math.random().toString(36).slice(2, 8)}`;
  const sol = await prisma.solicitud.create({
    data: {
      codigo,
      idempotencyKey: codigo,
      farmaciaId,
      nombreFarmaciaHistorico: "Farmacia Operación",
      emailFarmaciaHistorico: "SIN_MAIL",
      items: {
        create: items.map((i) => ({
          codigoBarra: EAN,
          cantidad: 1,
          motivo: "SOBRESTOCK" as const,
          fechaVencimiento: "10/27",
          estadoDecision: i.estado,
          compradorId: i.compradorId,
          compradorMailHistorico: "snapshot@farma.test",
          laboratorioHistorico: `Lab ${TAG}`,
        })),
      },
    },
    include: { items: { orderBy: { id: "asc" } } },
  });
  return sol.items;
}

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@drogueria.com" } });
  adminId = admin.id;
  adminSession = { user: { id: admin.id, role: "ADMIN", email: admin.email } } as never;
  mockAuth.mockResolvedValue(adminSession);

  farmaciaId = (await prisma.farmacia.create({ data: { id: TAG, nombre: `Farmacia ${TAG}` } })).id;
  const mk = (n: string) =>
    prisma.user.create({
      data: { email: mail(n), nombre: `Comprador ${n} ${TAG}`, password: "x", role: "COMPRADOR" },
    });
  compA = (await mk("a")).id;
  compB = (await mk("b")).id;
  proveedorId = (await prisma.proveedor.create({ data: { nombre: `Lab ${TAG}`, compradorId: compA } })).id;
  await prisma.articulo.create({ data: { codigoBarra: EAN, descripcion: `Producto ${TAG}`, proveedorId } });
});

afterAll(async () => {
  await prisma.solicitud.deleteMany({ where: { farmaciaId } });
  await prisma.articulo.deleteMany({ where: { codigoBarra: EAN } });
  await prisma.proveedor.deleteMany({ where: { id: proveedorId } });
  await prisma.user.deleteMany({ where: { id: { in: [compA, compB] } } });
  await prisma.farmacia.deleteMany({ where: { id: { in: [farmaciaId, COD_AUD] } } });
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [COD_AUD, compA, compB, String(proveedorId)] } },
  });
  invalidarTodosLosArticulos();
  await prisma.$disconnect();
});

describe("el envío decide el comprador con la base, no con la caché", () => {
  it("tras reasignar el proveedor en OTRA instancia, la solicitud va al comprador nuevo", async () => {
    // Esta instancia cachea el artículo con el comprador A...
    expect((await lookupArticulo(EAN))?.compradorId).toBe(compA);
    // ...y "otra instancia" reasigna el proveedor (la caché local no se entera).
    await prisma.proveedor.update({ where: { id: proveedorId }, data: { compradorId: compB } });
    expect((await lookupArticulo(EAN))?.compradorId).toBe(compA); // caché vieja

    const res = await enviarSolicitud({
      farmaciaId,
      idempotencyKey: `idem-${TAG}-1`,
      rows: [{ codigoBarra: EAN, cantidad: 2, motivo: "SOBRESTOCK", fechaVencimiento: "10/27", observaciones: "" }],
    });
    expect(res.ok).toBe(true);

    const item = await prisma.itemSolicitud.findFirstOrThrow({
      where: { solicitud: { idempotencyKey: `idem-${TAG}-1` } },
    });
    expect(item.compradorId).toBe(compB);

    await prisma.proveedor.update({ where: { id: proveedorId }, data: { compradorId: compA } });
    invalidarTodosLosArticulos();
  });

  it("un proveedor desactivado deja de rutear: sus ítems van a Sin asignar", async () => {
    expect((await toggleProveedor(proveedorId, false)).ok).toBe(true);
    expect((await lookupArticulo(EAN))?.compradorId).toBeNull();
    expect((await toggleProveedor(proveedorId, true)).ok).toBe(true);
    expect((await lookupArticulo(EAN))?.compradorId).toBe(compA);
  });
});

describe("ítems varados", () => {
  it("reasignar el proveedor mueve sus pendientes (no los ya decididos)", async () => {
    const [pendiente, aprobado] = await crearSolicitud([
      { estado: "PENDIENTE", compradorId: compA },
      { estado: "APROBADO", compradorId: compA },
    ]);

    const r1 = await asignarCompradorProveedor(proveedorId, compB);
    expect(r1.ok).toBe(true);
    const p1 = await prisma.itemSolicitud.findUniqueOrThrow({ where: { id: pendiente.id } });
    expect(p1.compradorId).toBe(compB);
    expect(p1.compradorMailHistorico).toBe(mail("b"));
    expect((await prisma.itemSolicitud.findUniqueOrThrow({ where: { id: aprobado.id } })).compradorId).toBe(compA);

    // Quitar el comprador los manda a "Sin asignar".
    const r2 = await asignarCompradorProveedor(proveedorId, null);
    expect(r2).toMatchObject({ ok: true });
    expect((await prisma.itemSolicitud.findUniqueOrThrow({ where: { id: pendiente.id } })).compradorId).toBeNull();

    // Un "comprador" inexistente o que no es comprador se rechaza.
    expect((await asignarCompradorProveedor(proveedorId, "no-existe")).ok).toBe(false);
    expect((await asignarCompradorProveedor(proveedorId, adminId)).ok).toBe(false);

    await asignarCompradorProveedor(proveedorId, compA);
  });

  it("desactivar un comprador pasa sus pendientes a Sin asignar", async () => {
    const [pendiente, aprobado] = await crearSolicitud([
      { estado: "PENDIENTE", compradorId: compB },
      { estado: "APROBADO", compradorId: compB },
    ]);

    const res = await toggleUsuario(compB, false);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.mensaje).toContain("Sin asignar");

    expect((await prisma.itemSolicitud.findUniqueOrThrow({ where: { id: pendiente.id } })).compradorId).toBeNull();
    // Lo ya decidido conserva a quién lo decidió.
    expect((await prisma.itemSolicitud.findUniqueOrThrow({ where: { id: aprobado.id } })).compradorId).toBe(compB);

    // Reactivarlo no le devuelve los ítems solo (los deriva el admin).
    expect((await toggleUsuario(compB, true)).ok).toBe(true);
    expect((await prisma.itemSolicitud.findUniqueOrThrow({ where: { id: pendiente.id } })).compradorId).toBeNull();
  });

  it("el admin no puede desactivarse a sí mismo, y un id inexistente no rompe", async () => {
    expect((await toggleUsuario(adminId, false)).ok).toBe(false);
    expect((await toggleUsuario("no-existe", false)).ok).toBe(false);
  });

  it("la bandeja del admin trae los pendientes de TODOS los compradores, y su badge coincide", async () => {
    const [deA] = await crearSolicitud([{ estado: "PENDIENTE", compradorId: compA }]);

    const propia = await getBandejaComprador(compA);
    expect(propia.map((i) => i.id)).toContain(deA.id);
    expect(propia.every((i) => i.compradorNombre?.includes(TAG))).toBe(true);

    const deTodos = await getBandejaComprador(null);
    expect(deTodos.map((i) => i.id)).toContain(deA.id);
    // Sin los "sin asignar" (tienen su propia pantalla).
    expect(deTodos.every((i) => i.compradorNombre !== null)).toBe(true);

    const badge = (await getBadgeCounts("ADMIN", adminId)).compradorPendientes;
    expect(badge).toBe(deTodos.length);
  });
});

describe("auditoría de acciones administrativas", () => {
  it("registra quién hizo qué, sin guardar contraseñas", async () => {
    const alta0 = await crearFarmacia({ codigo: COD_AUD.toLowerCase(), nombre: `Farmacia Auditada ${TAG}`, email: "" });
    expect(alta0.ok).toBe(true);
    const clave = await resetearAClaveTemporal(compA);
    expect(clave.ok).toBe(true);

    const { filas } = await listAuditoria({ q: COD_AUD });
    const alta = filas.find((f) => f.action === "CREAR_FARMACIA");
    expect(alta).toMatchObject({ actorEmail: "admin@drogueria.com", entityId: COD_AUD });

    const reset = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: compA, action: "GENERAR_CLAVE_TEMPORAL" },
    });
    expect(reset.actorId).toBe(adminId);
    if (clave.ok) expect(JSON.stringify(reset.diff)).not.toContain(clave.clave);

    // Las acciones de los tests anteriores también quedaron.
    const acciones = (
      await prisma.auditLog.findMany({
        where: { entityId: { in: [compB, String(proveedorId)] } },
        select: { action: true },
      })
    ).map((a) => a.action);
    expect(acciones).toEqual(
      expect.arrayContaining(["DESACTIVAR_USUARIO", "ACTIVAR_USUARIO", "ASIGNAR_COMPRADOR", "DESACTIVAR_PROVEEDOR"]),
    );
  });

  it("quien no es admin no deja rastro ni efecto", async () => {
    mockAuth.mockResolvedValue({ user: { id: compA, role: "COMPRADOR" } } as never);
    expect(await toggleUsuario(compB, false)).toEqual({ ok: false, error: "No autorizado." });
    expect(await asignarCompradorProveedor(proveedorId, compB)).toEqual({ ok: false, error: "No autorizado." });
    mockAuth.mockResolvedValue(adminSession);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: compB } })).activo).toBe(true);
  });
});

describe("cola de correos", () => {
  const req = (auth?: string) =>
    new Request("http://localhost/api/cron/outbox", {
      method: "POST",
      headers: auth ? { authorization: auth } : {},
    }) as unknown as NextRequest;

  it("el endpoint del cron solo acepta el secreto (la sesión de admin ya no alcanza)", async () => {
    const previo = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "secreto-de-prueba-123";
    try {
      expect((await cronOutbox(req())).status).toBe(401); // con sesión de admin mockeada
      expect((await cronOutbox(req("Bearer otro-secreto-00000000"))).status).toBe(401);
      expect((await cronOutbox(req("Bearer secreto-de-prueba-12"))).status).toBe(401);
      const ok = await cronOutbox(req("Bearer secreto-de-prueba-123"));
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ ok: true });

      // Sin secreto configurado no entra nadie (ni con "Bearer " vacío).
      delete process.env.CRON_SECRET;
      expect((await cronOutbox(req("Bearer "))).status).toBe(401);
      expect((await cronOutbox(req("Bearer undefined"))).status).toBe(401);
    } finally {
      if (previo === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previo;
    }
  });

  it("el resumen muestra lo que está en cola (antes era invisible)", async () => {
    const antes = await resumenColaCorreos();
    const c = await prisma.emailOutbox.create({
      data: {
        tipo: "RECHAZO_TOTAL_FARMACIA",
        destinatario: "cola@farma.test",
        asunto: `En cola ${TAG}`,
        payload: {},
        scheduledAt: new Date(Date.now() + 3_600_000), // no la toma ningún proceso durante el test
      },
    });
    try {
      const despues = await resumenColaCorreos();
      expect(despues.pendientes).toBe(antes.pendientes + 1);
      expect(despues.masViejo).not.toBeNull();
    } finally {
      await prisma.emailOutbox.delete({ where: { id: c.id } });
    }
  });
});
