"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseArticulosCsv, type ArticuloImport } from "@/lib/import/articulos-csv";
import {
  guardarArticulos,
  claveProveedor,
  nombreProveedorLimpio,
} from "@/lib/import/articulos-bulk";
import { FILAS_POR_LOTE, MAX_DESCRIPCION, MAX_NOMBRE_PROVEEDOR } from "@/lib/import/limites";
import { normalizeEan, isValidEanFormat } from "@/lib/business/ean";
import {
  normalizarCodigoFarmacia,
  esCodigoFarmaciaValido,
  MENSAJE_CODIGO_INVALIDO,
} from "@/lib/business/farmacia";
import { parseFarmaciasCsv } from "@/lib/import/farmacias-csv";
import { parseUsuariosCsv } from "@/lib/import/usuarios-csv";
import { invalidarTodosLosArticulos } from "@/lib/data/articulos";
import { generarClaveTemporal, vencimientoClaveTemporal } from "@/lib/clave-temporal";

// ─────────────────────────────────────────────────────────────
// Server Actions del panel Admin (gestión de maestros).
// Todas exigen rol ADMIN.
// ─────────────────────────────────────────────────────────────

/**
 * Busca un proveedor por nombre sin distinguir mayúsculas ni espacios de más
 * ("BAYER" = "Bayer"). Devuelve su id o null.
 */
async function buscarProveedorId(
  db: Pick<typeof prisma, "proveedor">,
  nombre: string,
): Promise<number | null> {
  const limpio = nombreProveedorLimpio(nombre);
  const candidatos = await db.proveedor.findMany({
    where: { nombre: { equals: limpio, mode: "insensitive" } },
    select: { id: true, nombre: true },
  });
  const clave = claveProveedor(limpio);
  return candidatos.find((c) => claveProveedor(c.nombre) === clave)?.id ?? null;
}

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
  codigo: z.string().min(1, "El código es obligatorio.").max(60),
  nombre: z.string().trim().min(2, "Nombre demasiado corto.").max(120),
  email: z.string().email("Email inválido.").optional().or(z.literal("")),
});

const esP2002 = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export async function crearFarmacia(input: z.infer<typeof FarmaciaSchema>): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  const p = FarmaciaSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const codigo = normalizarCodigoFarmacia(p.data.codigo);
  if (!esCodigoFarmaciaValido(codigo)) return { ok: false, error: MENSAJE_CODIGO_INVALIDO };
  try {
    await prisma.farmacia.create({
      data: { id: codigo, nombre: p.data.nombre, email: p.data.email?.trim() || null },
    });
    revalidatePath("/admin/farmacias");
    return { ok: true, mensaje: "Farmacia creada." };
  } catch (e) {
    if (esP2002(e)) return { ok: false, error: "Ya existe una farmacia con ese código o nombre." };
    console.error("[crearFarmacia] error:", e);
    return { ok: false, error: "No se pudo crear la farmacia." };
  }
}

const EditarFarmaciaSchema = FarmaciaSchema.extend({
  /** Código actual (el id antes de editar). */
  id: z.string().min(1),
});

/**
 * Edita nombre, email y/o código de una farmacia. Cambiar el código cambia su
 * id: usuarios y solicitudes lo siguen solos (FK con ON UPDATE CASCADE). Las
 * solicitudes ya enviadas conservan el nombre y el mail de ese momento.
 */
export async function actualizarFarmacia(
  input: z.infer<typeof EditarFarmaciaSchema>,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  const p = EditarFarmaciaSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const codigo = normalizarCodigoFarmacia(p.data.codigo);
  if (!esCodigoFarmaciaValido(codigo)) return { ok: false, error: MENSAJE_CODIGO_INVALIDO };
  try {
    await prisma.farmacia.update({
      where: { id: p.data.id },
      data: { id: codigo, nombre: p.data.nombre, email: p.data.email?.trim() || null },
    });
    revalidatePath("/admin/farmacias");
    revalidatePath("/admin/usuarios");
    return { ok: true, mensaje: "Farmacia actualizada." };
  } catch (e) {
    if (esP2002(e)) return { ok: false, error: "Ya existe otra farmacia con ese código o nombre." };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
      return { ok: false, error: "La farmacia ya no existe. Refrescá." };
    console.error("[actualizarFarmacia] error:", e);
    return { ok: false, error: "No se pudo actualizar la farmacia." };
  }
}

export async function toggleFarmacia(id: string, activa: boolean): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  try {
    await prisma.farmacia.update({ where: { id: String(id) }, data: { activa: activa === true } });
  } catch {
    return { ok: false, error: "La farmacia ya no existe. Refrescá." };
  }
  revalidatePath("/admin/farmacias");
  return { ok: true };
}

// ── Import masivo de farmacias (CSV) ───────────────────────
export type ConflictoFarmacia = { codigo: string; nombre: string; motivo: string };

export type ImportFarmaciasResult =
  | {
      ok: true;
      creadas: number;
      actualizadas: number;
      sinCambios: number;
      /** Filas que no se pudieron aplicar, con el motivo (antes se omitían en silencio). */
      conflictos: ConflictoFarmacia[];
      errores: { linea: number; motivo: string }[];
    }
  | { ok: false; error: string };

/**
 * Crea las farmacias nuevas y ACTUALIZA las existentes (por código): sirve para
 * corregir nombres o mails volviendo a subir la planilla. Un mail vacío en el
 * archivo no borra el mail ya cargado. Si el nombre ya lo usa OTRA farmacia,
 * la fila se informa como conflicto.
 */
export async function importarFarmacias(csvText: string): Promise<ImportFarmaciasResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };

  const { validos, errores } = parseFarmaciasCsv(csvText);
  if (validos.length === 0)
    return { ok: false, error: "No hay filas válidas para importar." };

  try {
    const existentes = await prisma.farmacia.findMany({
      select: { id: true, nombre: true, email: true },
    });
    const porId = new Map(existentes.map((f) => [f.id, f]));
    const idPorNombre = new Map(existentes.map((f) => [f.nombre.trim().toLowerCase(), f.id]));

    const conflictos: ConflictoFarmacia[] = [];
    const aCrear: { id: string; nombre: string; email: string | null }[] = [];
    const aActualizar: { id: string; nombre: string; email: string | null }[] = [];
    let sinCambios = 0;

    for (const f of validos) {
      const clave = f.nombre.trim().toLowerCase();
      const duenio = idPorNombre.get(clave);
      if (duenio !== undefined && duenio !== f.codigo) {
        conflictos.push({
          codigo: f.codigo,
          nombre: f.nombre,
          motivo: `El nombre ya lo usa la farmacia ${duenio}`,
        });
        continue;
      }
      const actual = porId.get(f.codigo);
      if (!actual) {
        aCrear.push({ id: f.codigo, nombre: f.nombre, email: f.email });
        idPorNombre.set(clave, f.codigo);
        continue;
      }
      const email = f.email ?? actual.email; // mail vacío en el archivo = no tocar
      if (actual.nombre === f.nombre && actual.email === email) {
        sinCambios++;
        continue;
      }
      aActualizar.push({ id: f.codigo, nombre: f.nombre, email });
      idPorNombre.delete(actual.nombre.trim().toLowerCase());
      idPorNombre.set(clave, f.codigo);
    }

    await prisma.$transaction(async (tx) => {
      if (aCrear.length) await tx.farmacia.createMany({ data: aCrear });
      for (const f of aActualizar) {
        await tx.farmacia.update({
          where: { id: f.id },
          data: { nombre: f.nombre, email: f.email },
        });
      }
    });

    revalidatePath("/admin/farmacias");
    return {
      ok: true,
      creadas: aCrear.length,
      actualizadas: aActualizar.length,
      sinCambios,
      conflictos,
      errores,
    };
  } catch (e) {
    if (esP2002(e))
      return {
        ok: false,
        error: "Hay códigos o nombres repetidos entre sí en el archivo. No se guardó nada.",
      };
    console.error("[importarFarmacias] error:", e);
    return { ok: false, error: "Error al guardar las farmacias. No se guardó nada." };
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
      ? [
          ...new Map(
            d.laboratorios
              .map((l) => l.trim())
              .filter(Boolean)
              .map((l) => [claveProveedor(l), l] as const),
          ).values(),
        ]
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
      for (const lab of labs) {
        const existente = await buscarProveedorId(tx, lab);
        if (existente !== null) {
          await tx.proveedor.update({ where: { id: existente }, data: { compradorId: user.id } });
        } else {
          await tx.proveedor.create({
            data: { nombre: nombreProveedorLimpio(lab), compradorId: user.id },
          });
        }
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
 * matcheado con una farmacia EXISTENTE por código (o por nombre). Cada
 * usuario recibe una clave temporal aleatoria propia (con vencimiento) y
 * mustChangePassword=true. Los emails ya existentes se omiten; las farmacias
 * que no existen se informan aparte (hay que importarlas primero).
 */
export async function importarUsuariosFarmacia(csvText: string): Promise<ImportUsuariosResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };

  const { validos, errores } = parseUsuariosCsv(csvText);
  if (validos.length === 0) return { ok: false, error: "No hay filas válidas para importar." };

  // Resolver la farmacia: por CÓDIGO si la fila lo trae (inequívoco); si no,
  // por nombre sin distinguir mayúsculas.
  const todas = await prisma.farmacia.findMany({ select: { id: true, nombre: true } });
  const porCodigo = new Map(todas.map((f) => [f.id, f]));
  const porNombre = new Map(todas.map((f) => [f.nombre.trim().toLowerCase(), f]));

  const noEncontradas: string[] = [];
  const candidatos: { farmacia: string; farmaciaId: string; email: string; nombre: string }[] = [];
  for (const v of validos) {
    const f = v.codigo ? porCodigo.get(v.codigo) : porNombre.get(v.farmacia.toLowerCase());
    if (!f) {
      noEncontradas.push(v.codigo || v.farmacia);
      continue;
    }
    candidatos.push({
      farmacia: f.nombre,
      farmaciaId: f.id,
      email: v.email,
      nombre: v.nombre || f.nombre,
    });
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

/**
 * Import de un CSV chico de una sola vez (texto pegado). Para el maestro
 * completo la pantalla usa `importarArticulosLote`, por tandas.
 */
export async function importarArticulos(csvText: string): Promise<ImportResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };

  const { validos, errores } = parseArticulosCsv(csvText);
  if (validos.length === 0)
    return { ok: false, error: "No hay filas válidas para importar." };

  try {
    const { guardados } = await guardarArticulos(prisma, validos);
    invalidarTodosLosArticulos();
    revalidatePath("/admin/articulos");
    return { ok: true, importados: guardados, errores };
  } catch (e) {
    console.error("[importarArticulos] error:", e);
    return { ok: false, error: "Error al guardar los artículos." };
  }
}

const FilaArticuloSchema = z.object({
  codigoBarra: z.string().max(40),
  descripcion: z.string().max(MAX_DESCRIPCION * 2),
  laboratorio: z.string().max(MAX_NOMBRE_PROVEEDOR * 2),
});
const LoteArticulosSchema = z.object({
  filas: z.array(FilaArticuloSchema).min(1).max(FILAS_POR_LOTE),
});

export type ImportLoteResult =
  | { ok: true; guardados: number; rechazados: number; proveedoresNuevos: number }
  | { ok: false; error: string };

/**
 * Guarda UNA tanda de artículos ya parseados en el navegador. El maestro real
 * (~155.000 filas) no entra en un solo request, así que la pantalla lo parte y
 * llama a esta acción una vez por tanda (ver components/admin/ImportArticulos).
 * Cada fila se vuelve a validar acá: lo que manda el navegador no es confiable.
 */
export async function importarArticulosLote(
  input: z.infer<typeof LoteArticulosSchema>,
): Promise<ImportLoteResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };

  const p = LoteArticulosSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "La tanda de artículos no es válida." };

  const validas: ArticuloImport[] = [];
  for (const f of p.data.filas) {
    const codigoBarra = normalizeEan(f.codigoBarra);
    const descripcion = f.descripcion.trim();
    const laboratorio = f.laboratorio.trim();
    if (
      isValidEanFormat(codigoBarra) &&
      descripcion.length > 0 &&
      descripcion.length <= MAX_DESCRIPCION &&
      laboratorio.length > 0 &&
      laboratorio.length <= MAX_NOMBRE_PROVEEDOR
    ) {
      validas.push({ codigoBarra, descripcion, laboratorio });
    }
  }

  try {
    const { guardados, proveedoresNuevos } = await guardarArticulos(prisma, validas);
    // Se invalida en cada tanda: si la carga se corta a la mitad, lo ya
    // guardado no queda tapado por la caché.
    invalidarTodosLosArticulos();
    return {
      ok: true,
      guardados,
      rechazados: p.data.filas.length - validas.length,
      proveedoresNuevos,
    };
  } catch (e) {
    console.error("[importarArticulosLote] error:", e);
    return { ok: false, error: "Error al guardar la tanda de artículos." };
  }
}

/** Cierra una carga por tandas: refresca el contador de la pantalla. */
export async function finalizarImportArticulos(): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  invalidarTodosLosArticulos();
  revalidatePath("/admin/articulos");
  revalidatePath("/admin/proveedores");
  return { ok: true };
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
    if ((await buscarProveedorId(prisma, p.data.nombre)) !== null)
      return { ok: false, error: "Ya existe un proveedor con ese nombre." };
    await prisma.proveedor.create({
      data: {
        nombre: nombreProveedorLimpio(p.data.nombre),
        compradorId: p.data.compradorId || null,
      },
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
