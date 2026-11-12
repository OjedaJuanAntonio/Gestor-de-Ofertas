"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseArticulosCsv } from "@/lib/import/articulos-csv";
import { parseFarmaciasCsv } from "@/lib/import/farmacias-csv";
import { parseUsuariosCsv } from "@/lib/import/usuarios-csv";
import { invalidarTodosLosArticulos } from "@/lib/data/articulos";
import { generarClaveTemporal, vencimientoClaveTemporal } from "@/lib/clave-temporal";

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
// El id de la farmacia ES su código interno (lo carga el admin).
const FarmaciaSchema = z.object({
  codigo: z.string().min(1, "El código es obligatorio."),
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
      data: {
        id: p.data.codigo.trim(),
        nombre: p.data.nombre.trim(),
        email: p.data.email?.trim() || null,
      },
    });
    revalidatePath("/admin/farmacias");
    return { ok: true, mensaje: "Farmacia creada." };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { ok: false, error: "Ya existe una farmacia con ese código o nombre." };
    return { ok: false, error: "No se pudo crear la farmacia." };
  }
}

export async function toggleFarmacia(id: string, activa: boolean): Promise<Result> {
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
      data: validos.map((f) => ({ id: f.codigo, nombre: f.nombre, email: f.email })),
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
  farmaciaId: z.string().optional().nullable(),
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
    // Para un comprador, los "laboratorios" que se escriben se traducen en
    // asignarle esos proveedores (uno por nombre; se crean si no existen).
    const labs = d.role === "COMPRADOR"
      ? [...new Set(d.laboratorios.map((l) => l.trim()).filter(Boolean))]
      : [];
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: d.email.trim().toLowerCase(),
          nombre: d.nombre.trim(),
          password: hash,
          role: d.role,
          farmaciaId: d.role === "FARMACIA" ? d.farmaciaId : null,
          // La contraseña la eligió el admin (la conoce): el usuario debe
          // reemplazarla por una propia en su primer ingreso.
          mustChangePassword: true,
          claveTemporalVence: vencimientoClaveTemporal(),
        },
      });
      for (const nombre of labs) {
        await tx.proveedor.upsert({
          where: { nombre },
          update: { compradorId: user.id },
          create: { nombre, compradorId: user.id },
        });
      }
    });
    if (labs.length) invalidarTodosLosArticulos();
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
    // La clave la conoce el admin → es temporal: se pide cambiarla al entrar.
    await prisma.user.update({
      where: { id: p.data.id },
      data: {
        password: hash,
        mustChangePassword: true,
        claveTemporalVence: vencimientoClaveTemporal(),
      },
    });
    revalidatePath("/admin/usuarios");
    return { ok: true, mensaje: "Contraseña actualizada. Se le pedirá cambiarla al entrar." };
  } catch {
    return { ok: false, error: "No se pudo actualizar la contraseña." };
  }
}

export type ClaveTemporalResult =
  | { ok: true; clave: string; vence: string }
  | { ok: false; error: string };

/**
 * Genera una clave temporal ALEATORIA para el usuario y lo obliga a cambiarla
 * en el próximo inicio de sesión. Es la herramienta para el "me olvidé la
 * contraseña". La clave se devuelve una única vez (en la base solo queda su
 * hash): el admin se la pasa al usuario y vence a los pocos días.
 */
export async function resetearAClaveTemporal(id: string): Promise<ClaveTemporalResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  try {
    const clave = generarClaveTemporal();
    const vence = vencimientoClaveTemporal();
    await prisma.user.update({
      where: { id },
      data: {
        password: await bcrypt.hash(clave, 10),
        mustChangePassword: true,
        claveTemporalVence: vence,
      },
    });
    revalidatePath("/admin/usuarios");
    return { ok: true, clave, vence: vence.toISOString() };
  } catch {
    return { ok: false, error: "No se pudo resetear la contraseña." };
  }
}

// ── Import masivo de usuarios de farmacia (CSV) ────────────
export type CredencialNueva = { farmacia: string; email: string; clave: string };

export type ImportUsuariosResult =
  | {
      ok: true;
      importados: number;
      omitidos: number;
      noEncontradas: string[];
      errores: { linea: number; motivo: string }[];
      /** Claves temporales de los usuarios creados. Se devuelven UNA sola vez:
       *  en la base solo quedan los hashes. */
      credenciales: CredencialNueva[];
      vence: string;
    }
  | { ok: false; error: string };

/**
 * Alta masiva de logins de farmacia: un usuario (rol FARMACIA) por fila,
 * matcheado con una farmacia EXISTENTE por nombre (case-insensitive). Cada
 * usuario recibe una clave temporal aleatoria propia (con vencimiento) y
 * mustChangePassword=true. Los emails ya existentes se omiten; las farmacias
 * que no existen se informan aparte (hay que importarlas primero).
 */
export async function importarUsuariosFarmacia(csvText: string): Promise<ImportUsuariosResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };

  const { validos, errores } = parseUsuariosCsv(csvText);
  if (validos.length === 0) return { ok: false, error: "No hay filas válidas para importar." };

  // Resolver farmacias por nombre (case-insensitive, robusto a diferencias de mayúsculas).
  const todas = await prisma.farmacia.findMany({ select: { id: true, nombre: true } });
  const porNombre = new Map(todas.map((f) => [f.nombre.trim().toLowerCase(), f.id]));

  const noEncontradas: string[] = [];
  const candidatos: { farmacia: string; farmaciaId: string; email: string; nombre: string }[] = [];
  for (const v of validos) {
    const farmaciaId = porNombre.get(v.farmacia.toLowerCase());
    if (!farmaciaId) {
      noEncontradas.push(v.farmacia);
      continue;
    }
    candidatos.push({ farmacia: v.farmacia, farmaciaId, email: v.email, nombre: v.nombre || v.farmacia });
  }

  if (candidatos.length === 0)
    return {
      ok: false,
      error: "Ninguna farmacia del archivo existe en el sistema. Importá primero las farmacias.",
    };

  try {
    // Los emails que ya existen se omiten ANTES de generar claves (no tiene
    // sentido hashear ni mostrar una clave que no se va a usar).
    const yaExisten = new Set(
      (
        await prisma.user.findMany({
          where: { email: { in: candidatos.map((c) => c.email) } },
          select: { email: true },
        })
      ).map((u) => u.email),
    );
    const nuevos = candidatos.filter((c) => !yaExisten.has(c.email));

    const vence = vencimientoClaveTemporal();
    const conClave = await Promise.all(
      nuevos.map(async (c) => {
        const clave = generarClaveTemporal();
        return { ...c, clave, hash: await bcrypt.hash(clave, 10) };
      }),
    );

    // skipDuplicates cubre la carrera de dos imports simultáneos; lo que
    // devuelve createManyAndReturn son los que REALMENTE se crearon.
    const creados = await prisma.user.createManyAndReturn({
      data: conClave.map((c) => ({
        email: c.email,
        nombre: c.nombre,
        password: c.hash,
        role: "FARMACIA" as const,
        farmaciaId: c.farmaciaId,
        mustChangePassword: true,
        claveTemporalVence: vence,
      })),
      skipDuplicates: true,
      select: { email: true },
    });
    const emailsCreados = new Set(creados.map((u) => u.email));

    revalidatePath("/admin/usuarios");
    return {
      ok: true,
      importados: creados.length,
      omitidos: candidatos.length - creados.length,
      noEncontradas: [...new Set(noEncontradas)],
      errores,
      credenciales: conClave
        .filter((c) => emailsCreados.has(c.email))
        .map((c) => ({ farmacia: c.farmacia, email: c.email, clave: c.clave })),
      vence: vence.toISOString(),
    };
  } catch (e) {
    console.error("[importarUsuariosFarmacia] error:", e);
    return { ok: false, error: "Error al guardar los usuarios." };
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

  try {
    // Resolver/crear los proveedores (laboratorios) por nombre, una sola vez.
    // El CSV sigue trayendo el nombre del laboratorio; acá se mapea a su FK.
    const nombresProv = [...new Set(validos.map((a) => a.laboratorio))];
    const provIdPorNombre = new Map<string, number>();
    for (const nombre of nombresProv) {
      const p = await prisma.proveedor.upsert({
        where: { nombre },
        update: {},
        create: { nombre },
        select: { id: true, nombre: true },
      });
      provIdPorNombre.set(p.nombre, p.id);
    }

    // Upsert por lotes: el maestro real tiene ~155.000 artículos y hacerlo en una
    // sola transacción (una query por fila) excede tiempos/límites de Postgres.
    // Cada lote va en su propia transacción acotada.
    const LOTE = 1000;
    for (let i = 0; i < validos.length; i += LOTE) {
      const lote = validos.slice(i, i + LOTE);
      await prisma.$transaction(
        lote.map((a) => {
          const proveedorId = provIdPorNombre.get(a.laboratorio)!;
          return prisma.articulo.upsert({
            where: { codigoBarra: a.codigoBarra },
            update: {
              descripcion: a.descripcion,
              proveedorId,
              activo: true,
            },
            create: {
              codigoBarra: a.codigoBarra,
              descripcion: a.descripcion,
              proveedorId,
            },
          });
        }),
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

// ── Proveedores (laboratorios) ─────────────────────────────
const ProveedorSchema = z.object({
  nombre: z.string().min(2, "Nombre demasiado corto."),
  compradorId: z.string().optional().nullable(),
});

export async function crearProveedor(input: z.infer<typeof ProveedorSchema>): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  const p = ProveedorSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  try {
    await prisma.proveedor.create({
      data: { nombre: p.data.nombre.trim(), compradorId: p.data.compradorId || null },
    });
    invalidarTodosLosArticulos();
    revalidatePath("/admin/proveedores");
    return { ok: true, mensaje: "Proveedor creado." };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { ok: false, error: "Ya existe un proveedor con ese nombre." };
    return { ok: false, error: "No se pudo crear el proveedor." };
  }
}

/** Asigna (o quita, con null) el comprador responsable de un proveedor. */
export async function asignarCompradorProveedor(
  id: number,
  compradorId: string | null,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  try {
    await prisma.proveedor.update({
      where: { id },
      data: { compradorId: compradorId || null },
    });
    // El cambio de responsable afecta el ruteo → invalidar la caché de lookups.
    invalidarTodosLosArticulos();
    revalidatePath("/admin/proveedores");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo asignar el comprador." };
  }
}

export async function toggleProveedor(id: number, activo: boolean): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  await prisma.proveedor.update({ where: { id }, data: { activo } });
  revalidatePath("/admin/proveedores");
  return { ok: true };
}
