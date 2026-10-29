"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseArticulosCsv } from "@/lib/import/articulos-csv";
import { parseFarmaciasCsv } from "@/lib/import/farmacias-csv";
import { invalidarTodosLosArticulos } from "@/lib/data/articulos";

// ─────────────────────────────────────────────────────────────
// Server Actions del panel Admin (gestión de maestros).
// Todas exigen rol ADMIN.
// ─────────────────────────────────────────────────────────────

async function requireAdmin() {
  const session = await auth();
  const user = session?.user as { id: string; role?: string; email?: string } | undefined;
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

type Result = { ok: true; mensaje?: string } | { ok: false; error: string };

// ── Farmacias ──────────────────────────────────────────────
const FarmaciaSchema = z.object({
  nombre: z.string().min(2, "Nombre demasiado corto."),
  email: z.string().email("Email inválido.").optional().or(z.literal("")),
});

export async function crearFarmacia(input: z.infer<typeof FarmaciaSchema>): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  const p = FarmaciaSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  try {
    await prisma.farmacia.create({
      data: { nombre: p.data.nombre.trim(), email: p.data.email?.trim() || null },
    });
    revalidatePath("/admin/farmacias");
    return { ok: true, mensaje: "Farmacia creada." };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { ok: false, error: "Ya existe una farmacia con ese nombre." };
    return { ok: false, error: "No se pudo crear la farmacia." };
  }
}

export async function toggleFarmacia(id: number, activa: boolean): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  await prisma.farmacia.update({ where: { id }, data: { activa } });
  revalidatePath("/admin/farmacias");
  return { ok: true };
}

// ── Import masivo de farmacias (CSV) ───────────────────────
export type ImportFarmaciasResult =
  | { ok: true; importados: number; omitidos: number; errores: { linea: number; motivo: string }[] }
  | { ok: false; error: string };

export async function importarFarmacias(csvText: string): Promise<ImportFarmaciasResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };

  const { validos, errores } = parseFarmaciasCsv(csvText);
  if (validos.length === 0)
    return { ok: false, error: "No hay filas válidas para importar." };

  try {
    // createMany con skipDuplicates: las farmacias con nombre ya existente se
    // omiten (nombre es @unique) en vez de fallar todo el lote.
    const res = await prisma.farmacia.createMany({
      data: validos.map((f) => ({ nombre: f.nombre, email: f.email })),
      skipDuplicates: true,
    });
    revalidatePath("/admin/farmacias");
    return {
      ok: true,
      importados: res.count,
      omitidos: validos.length - res.count,
      errores,
    };
  } catch {
    return { ok: false, error: "Error al guardar las farmacias." };
  }
}

// ── Usuarios ───────────────────────────────────────────────
const UsuarioSchema = z.object({
  email: z.string().email("Email inválido."),
  nombre: z.string().min(2, "Nombre demasiado corto."),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres."),
  role: z.enum(["ADMIN", "FARMACIA", "COMPRADOR", "PRECIOS"]),
  farmaciaId: z.number().int().positive().optional().nullable(),
  laboratorios: z.array(z.string().min(1)).optional().default([]),
});

export async function crearUsuario(input: z.infer<typeof UsuarioSchema>): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  const p = UsuarioSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const d = p.data;

  if (d.role === "FARMACIA" && !d.farmaciaId)
    return { ok: false, error: "Un operador de farmacia debe tener una farmacia asignada." };

  try {
    const hash = await bcrypt.hash(d.password, 10);
    const labs = d.role === "COMPRADOR"
      ? [...new Set(d.laboratorios.map((l) => l.trim()).filter(Boolean))]
      : [];
    await prisma.user.create({
      data: {
        email: d.email.trim().toLowerCase(),
        nombre: d.nombre.trim(),
        password: hash,
        role: d.role,
        farmaciaId: d.role === "FARMACIA" ? d.farmaciaId : null,
        laboratorios: labs.length ? { create: labs.map((laboratorio) => ({ laboratorio })) } : undefined,
      },
    });
    revalidatePath("/admin/usuarios");
    return { ok: true, mensaje: "Usuario creado." };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { ok: false, error: "Ya existe un usuario con ese email." };
    return { ok: false, error: "No se pudo crear el usuario." };
  }
}

export async function toggleUsuario(id: string, activo: boolean): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  if (admin.id === id && !activo)
    return { ok: false, error: "No podés desactivar tu propio usuario." };
  await prisma.user.update({ where: { id }, data: { activo } });
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

const ResetPasswordSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres."),
});

export async function resetearPassword(
  input: z.infer<typeof ResetPasswordSchema>,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  const p = ResetPasswordSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  try {
    const hash = await bcrypt.hash(p.data.password, 10);
    await prisma.user.update({ where: { id: p.data.id }, data: { password: hash } });
    revalidatePath("/admin/usuarios");
    return { ok: true, mensaje: "Contraseña actualizada." };
  } catch {
    return { ok: false, error: "No se pudo actualizar la contraseña." };
  }
}

// ── Import de artículos (CSV) ──────────────────────────────
export type ImportResult =
  | { ok: true; importados: number; errores: { linea: number; motivo: string }[] }
  | { ok: false; error: string };

export async function importarArticulos(csvText: string): Promise<ImportResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };

  const { validos, errores } = parseArticulosCsv(csvText);
  if (validos.length === 0)
    return { ok: false, error: "No hay filas válidas para importar." };

  // Upsert por lotes: el maestro real tiene ~155.000 artículos y hacerlo en una
  // sola transacción (una query por fila) excede tiempos/límites de Postgres.
  // Cada lote va en su propia transacción acotada.
  const LOTE = 1000;
  try {
    for (let i = 0; i < validos.length; i += LOTE) {
      const lote = validos.slice(i, i + LOTE);
      await prisma.$transaction(
        lote.map((a) =>
          prisma.articulo.upsert({
            where: { codigoBarra: a.codigoBarra },
            update: {
              descripcion: a.descripcion,
              laboratorio: a.laboratorio,
              categoria: a.categoria,
              stockReferencia: a.stockReferencia,
              activo: true,
            },
            create: a,
          }),
        ),
      );
    }
    invalidarTodosLosArticulos();
    revalidatePath("/admin/articulos");
    return { ok: true, importados: validos.length, errores };
  } catch {
    return { ok: false, error: "Error al guardar los artículos." };
  }
}

// ── Correos en dead-letter ─────────────────────────────────
export async function reintentarCorreo(id: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  await prisma.emailOutbox.update({
    where: { id },
    data: { estado: "PENDIENTE", intentos: 0, scheduledAt: new Date(), ultimoError: null },
  });
  revalidatePath("/admin/correos");
  return { ok: true };
}

export async function cancelarCorreo(id: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  await prisma.emailOutbox.update({ where: { id }, data: { estado: "CANCELADO" } });
  revalidatePath("/admin/correos");
  return { ok: true };
}
