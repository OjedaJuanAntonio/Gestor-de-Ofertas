"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lookupArticulo } from "@/lib/data/articulos";
import { validateRow } from "@/lib/business/grid";
import { generateSolicitudCodigo } from "@/lib/business/solicitud";
import { agruparPorComprador } from "@/lib/business/multicomprador";

// ─────────────────────────────────────────────────────────────
// enviarSolicitud — Server Action transaccional (Módulo 1).
//
// Garantías:
//  - Idempotente vía idempotencyKey (reintentos de red no duplican).
//  - Validación server-side de cada fila (no confía en el cliente).
//  - Snapshots históricos de farmacia y comprador.
//  - Atómica: cabecera + ítems + outbox + auditoría en una sola TX.
//  - Distribución multicomprador encolada en EmailOutbox.
// ─────────────────────────────────────────────────────────────

const RowSchema = z.object({
  codigoBarra: z.string().min(1),
  cantidad: z.number().int().positive(),
  motivo: z.enum(["VENCIMIENTO_PROXIMO", "STOCK_INMOVILIZADO", "SOBRESTOCK", "PROBADOR"]),
  fechaVencimiento: z.string().optional().default(""),
  observaciones: z.string().optional().default(""),
});

const InputSchema = z.object({
  farmaciaId: z.number().int().positive(),
  emailManual: z.string().optional(), // override si la farmacia no tiene mail
  idempotencyKey: z.string().min(8),
  rows: z.array(RowSchema).min(1, "La solicitud no tiene ítems."),
});

export type EnviarSolicitudInput = z.infer<typeof InputSchema>;

export type EnviarSolicitudResult =
  | {
      ok: true;
      codigo: string;
      totalItems: number;
      compradoresConItems: number;
      itemsSinComprador: number;
      duplicada: boolean;
    }
  | {
      ok: false;
      error: string;
      erroresFila?: { index: number; error: string }[];
    };

export async function enviarSolicitud(
  input: EnviarSolicitudInput,
): Promise<EnviarSolicitudResult> {
  // 1) Autorización
  const session = await auth();
  const user = session?.user as { id: string; role?: string } | undefined;
  if (!user || (user.role !== "FARMACIA" && user.role !== "ADMIN")) {
    return { ok: false, error: "No autorizado." };
  }

  // 2) Validación de forma
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const data = parsed.data;

  // 3) Idempotencia: ¿ya se procesó este lote?
  const existente = await prisma.solicitud.findUnique({
    where: { idempotencyKey: data.idempotencyKey },
    select: { codigo: true, _count: { select: { items: true } } },
  });
  if (existente) {
    return {
      ok: true,
      codigo: existente.codigo,
      totalItems: existente._count.items,
      compradoresConItems: 0,
      itemsSinComprador: 0,
      duplicada: true,
    };
  }

  // 4) Farmacia + snapshot
  const farmacia = await prisma.farmacia.findUnique({
    where: { id: data.farmaciaId },
    select: { id: true, nombre: true, email: true, activa: true },
  });
  if (!farmacia || !farmacia.activa) {
    return { ok: false, error: "Farmacia inexistente o inactiva." };
  }
  const emailFarmacia =
    (data.emailManual?.trim() || farmacia.email?.trim() || "") || "SIN_MAIL";

  // 5) Validación + resolución server-side de cada fila
  const erroresFila: { index: number; error: string }[] = [];
  const itemsResueltos: {
    codigoBarra: string;
    cantidad: number;
    motivo: (typeof data.rows)[number]["motivo"];
    fechaVencimiento: string | null;
    observaciones: string | null;
    compradorId: string | null;
    compradorMail: string | null;
    laboratorio: string;
  }[] = [];

  for (let i = 0; i < data.rows.length; i++) {
    const row = data.rows[i];
    const articulo = await lookupArticulo(row.codigoBarra);
    const v = validateRow({
      codigoBarra: row.codigoBarra,
      articuloExiste: !!articulo,
      cantidad: row.cantidad,
      motivo: row.motivo,
      fechaVencimiento: row.fechaVencimiento ?? "",
    });
    if (!v.ok || !articulo) {
      erroresFila.push({ index: i, error: v.error ?? "Producto inexistente" });
      continue;
    }
    itemsResueltos.push({
      codigoBarra: articulo.codigoBarra,
      cantidad: row.cantidad,
      motivo: row.motivo,
      fechaVencimiento: row.fechaVencimiento?.trim() || null,
      observaciones: row.observaciones?.trim() || null,
      compradorId: articulo.compradorId,
      compradorMail: articulo.compradorMail,
      laboratorio: articulo.laboratorio,
    });
  }

  if (erroresFila.length > 0) {
    return {
      ok: false,
      error: "Hay filas con errores. Corregilas antes de enviar.",
      erroresFila,
    };
  }

  // 6) Código legible
  const codigo = generateSolicitudCodigo();

  // 7) Distribución multicomprador
  // itemsResueltos ya tiene compradorId y compradorMail → se agrupa directo.
  const { grupos, sinComprador } = agruparPorComprador(itemsResueltos);

  // 8) Transacción atómica
  try {
    await prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitud.create({
        data: {
          codigo,
          idempotencyKey: data.idempotencyKey,
          farmaciaId: farmacia.id,
          nombreFarmaciaHistorico: farmacia.nombre,
          emailFarmaciaHistorico: emailFarmacia,
          creadoPorId: user.id,
          items: {
            create: itemsResueltos.map((it) => ({
              codigoBarra: it.codigoBarra,
              cantidad: it.cantidad,
              motivo: it.motivo,
              fechaVencimiento: it.fechaVencimiento,
              observaciones: it.observaciones,
              compradorId: it.compradorId,
              compradorMailHistorico: it.compradorMail ?? "SIN_COMPRADOR",
              laboratorioHistorico: it.laboratorio,
            })),
          },
        },
        select: { id: true },
      });

      // Nota: NO se notifica por mail a los compradores (decisión de negocio,
      // igual que en el flujo de producción: evita saturarlos). Ven sus ítems
      // nuevos directamente en la bandeja. Solo se encolan correos a la farmacia
      // en el cierre (consolidado / rechazo total).

      await tx.auditLog.create({
        data: {
          entityType: "Solicitud",
          entityId: solicitud.id,
          action: "CREAR",
          actorId: user.id,
          actorEmail: session?.user?.email ?? null,
          diff: {
            codigo,
            items: itemsResueltos.length,
            compradores: grupos.length,
            sinComprador: sinComprador.length,
          } as Prisma.InputJsonValue,
        },
      });
    });
  } catch (e) {
    // Carrera con la unicidad de idempotencyKey → tratamos como duplicado OK.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const dup = await prisma.solicitud.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
        select: { codigo: true, _count: { select: { items: true } } },
      });
      if (dup) {
        return {
          ok: true,
          codigo: dup.codigo,
          totalItems: dup._count.items,
          compradoresConItems: 0,
          itemsSinComprador: 0,
          duplicada: true,
        };
      }
    }
    console.error("[enviarSolicitud] error:", e);
    return { ok: false, error: "No se pudo guardar la solicitud. Reintentá." };
  }

  return {
    ok: true,
    codigo,
    totalItems: itemsResueltos.length,
    compradoresConItems: grupos.length,
    itemsSinComprador: sinComprador.length,
    duplicada: false,
  };
}
