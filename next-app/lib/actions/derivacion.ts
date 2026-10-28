"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidarTodosLosArticulos } from "@/lib/data/articulos";

// ─────────────────────────────────────────────────────────────
// reasignarItems — Derivación de ítems sin comprador (Admin).
//
// Equivale al `derivarArticulos()` del flujo de Google Sheets: los
// ítems cuyo laboratorio no tenía comprador asignado al enviarse
// quedan huérfanos (compradorId = null) y no aparecen en ninguna
// bandeja. Un admin los reasigna a un comprador. Opcionalmente crea
// la regla laboratorio→comprador para que no se repita.
// ─────────────────────────────────────────────────────────────

const InputSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1, "No seleccionaste ítems."),
  compradorId: z.string().min(1, "Elegí un comprador."),
  crearMapeo: z.boolean().optional().default(false),
});

export type ReasignarResult =
  | { ok: true; derivados: number; mapeosCreados: number }
  | { ok: false; error: string };

export async function reasignarItems(
  input: z.infer<typeof InputSchema>,
): Promise<ReasignarResult> {
  const session = await auth();
  const user = session?.user as { id: string; role?: string; email?: string } | undefined;
  if (!user || user.role !== "ADMIN") {
    return { ok: false, error: "No autorizado." };
  }

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { itemIds, compradorId, crearMapeo } = parsed.data;

  // El comprador destino debe existir, estar activo y tener el rol.
  const comprador = await prisma.user.findUnique({
    where: { id: compradorId },
    select: { id: true, email: true, role: true, activo: true },
  });
  if (!comprador || !comprador.activo || comprador.role !== "COMPRADOR") {
    return { ok: false, error: "El comprador elegido no es válido." };
  }

  // Solo ítems realmente huérfanos y pendientes (optimistic check).
  const items = await prisma.itemSolicitud.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, compradorId: true, estadoDecision: true, laboratorioHistorico: true },
  });
  if (items.length !== itemIds.length) {
    return { ok: false, error: "Algunos ítems ya no existen. Refrescá." };
  }
  const invalido = items.find(
    (it) => it.compradorId !== null || it.estadoDecision !== "PENDIENTE",
  );
  if (invalido) {
    return { ok: false, error: "Algunos ítems ya fueron asignados o decididos. Refrescá." };
  }

  const labs = [...new Set(items.map((it) => it.laboratorioHistorico).filter(Boolean))];
  let mapeosCreados = 0;

  try {
    await prisma.$transaction(async (tx) => {
      // Reasigna solo si siguen huérfanos (evita carreras).
      const asignados = await tx.itemSolicitud.updateMany({
        where: { id: { in: itemIds }, compradorId: null, estadoDecision: "PENDIENTE" },
        data: {
          compradorId: comprador.id,
          compradorMailHistorico: comprador.email,
        },
      });
      if (asignados.count !== itemIds.length) {
        throw new Error("CARRERA"); // alguien los tomó entre la lectura y el update
      }

      for (const it of items) {
        await tx.auditLog.create({
          data: {
            entityType: "ItemSolicitud",
            entityId: it.id,
            action: "DERIVAR",
            actorId: user.id,
            actorEmail: user.email ?? null,
            diff: {
              compradorId: comprador.id,
              laboratorio: it.laboratorioHistorico,
            } as Prisma.InputJsonValue,
          },
        });
      }

      // Regla laboratorio→comprador para que el próximo envío rutee solo.
      if (crearMapeo && labs.length > 0) {
        const res = await tx.laboratorioComprador.createMany({
          data: labs.map((laboratorio) => ({ userId: comprador.id, laboratorio })),
          skipDuplicates: true,
        });
        mapeosCreados = res.count;
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "CARRERA") {
      return { ok: false, error: "Algunos ítems ya fueron asignados. Refrescá." };
    }
    console.error("[reasignarItems] error:", e);
    return { ok: false, error: "No se pudo derivar. Reintentá." };
  }

  // Si se crearon reglas, la caché de lookups puede estar desactualizada.
  if (mapeosCreados > 0) invalidarTodosLosArticulos();
  revalidatePath("/admin/sin-asignar");

  return { ok: true, derivados: itemIds.length, mapeosCreados };
}
