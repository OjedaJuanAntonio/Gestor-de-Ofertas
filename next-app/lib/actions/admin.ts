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
import { processOutbox } from "@/lib/email/outbox";
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

type Actor = { id: string; email?: string };

/**
 * Deja constancia en el AuditLog de una acción administrativa (quién, qué y
 * sobre qué). Nunca se guardan contraseñas ni claves temporales en `diff`.
 */
async function auditar(
  db: Pick<typeof prisma, "auditLog">,
  actor: Actor,
  entrada: { entityType: string; entityId: string; action: string; diff?: Prisma.InputJsonValue },
): Promise<void> {
  await db.auditLog.create({
    data: {
      entityType: entrada.entityType,
      entityId: entrada.entityId,
      action: entrada.action,
      actorId: actor.id,
      actorEmail: actor.email ?? null,
      diff: entrada.diff,
    },
  });
}

/** Igual que `auditar`, pero un fallo al registrar no rompe la acción ya hecha. */
async function auditarSinRomper(
  actor: Actor,
  entrada: Parameters<typeof auditar>[2],
): Promise<void> {
  try {
    await auditar(prisma, actor, entrada);
  } catch (e) {
    console.error("[auditoría] no se pudo registrar:", entrada.action, e);
  }
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
    await auditarSinRomper(admin, {
      entityType: "Farmacia",
      entityId: codigo,
      action: "CREAR_FARMACIA",
      diff: { nombre: p.data.nombre },
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
    await auditarSinRomper(admin, {
      entityType: "Farmacia",
      entityId: codigo,
      action: "EDITAR_FARMACIA",
      diff: { codigoAnterior: p.data.id, codigo, nombre: p.data.nombre, email: p.data.email?.trim() || null },
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
  await auditarSinRomper(admin, {
    entityType: "Farmacia",
    entityId: String(id),
    action: activa === true ? "ACTIVAR_FARMACIA" : "DESACTIVAR_FARMACIA",
  });
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

    await auditarSinRomper(admin, {
      entityType: "Farmacia",
      entityId: "*",
      action: "IMPORTAR_FARMACIAS",
      diff: {
        creadas: aCrear.length,
        actualizadas: aActualizar.length,
        conflictos: conflictos.length,
      },
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
  laboratorios: z.array(z.string().min(1)).max(500, "Demasiados laboratorios.").optional().default([]),
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
      await auditar(tx, admin, {
        entityType: "User",
        entityId: user.id,
        action: "CREAR_USUARIO",
        diff: { email: user.email, role: user.role, farmaciaId: user.farmaciaId, proveedores: labs },
      });
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

/**
 * Activa o desactiva un usuario. Al DESACTIVAR un comprador, sus ítems
 * pendientes pasan a "Sin asignar": antes quedaban a su nombre, en una bandeja
 * a la que ya nadie entraba, y sus solicitudes no cerraban nunca. Sus
 * proveedores quedan vinculados (por si vuelve), pero mientras esté inactivo el
 * ruteo los trata como sin comprador.
 */
export async function toggleUsuario(id: string, activo: boolean): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  id = String(id);
  activo = activo === true;
  if (admin.id === id && !activo)
    return { ok: false, error: "No podés desactivar tu propio usuario." };

  let liberados = 0;
  try {
    await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: { activo },
        select: { role: true, email: true },
      });
      if (!activo && u.role === "COMPRADOR") {
        const r = await tx.itemSolicitud.updateMany({
          where: { compradorId: id, estadoDecision: "PENDIENTE" },
          data: { compradorId: null },
        });
        liberados = r.count;
      }
      await auditar(tx, admin, {
        entityType: "User",
        entityId: id,
        action: activo ? "ACTIVAR_USUARIO" : "DESACTIVAR_USUARIO",
        diff: { email: u.email, role: u.role, itemsPasadosASinAsignar: liberados },
      });
    });
  } catch {
    return { ok: false, error: "El usuario ya no existe. Refrescá." };
  }

  // El comprador resuelto por la búsqueda depende de si está activo.
  invalidarTodosLosArticulos();
  revalidatePath("/admin/usuarios");
  revalidatePath("/admin/sin-asignar");
  return {
    ok: true,
    mensaje: liberados
      ? `Usuario desactivado. ${liberados} ítem(s) pendiente(s) pasaron a "Sin asignar".`
      : undefined,
  };
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
    await auditarSinRomper(admin, {
      entityType: "User",
      entityId: p.data.id,
      action: "RESETEAR_CLAVE",
    });
    revalidatePath("/admin/usuarios");
    return { ok: true, mensaje: "Contraseña actualizada. Se le pedirá cambiarla al entrar." };
  } catch (e) {
    console.error("[resetearPassword] error:", e);
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
    await auditarSinRomper(admin, {
      entityType: "User",
      entityId: String(id),
      action: "GENERAR_CLAVE_TEMPORAL",
      diff: { vence: vence.toISOString() },
    });
    revalidatePath("/admin/usuarios");
    return { ok: true, clave, vence: vence.toISOString() };
  } catch (e) {
    console.error("[resetearAClaveTemporal] error:", e);
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

    await auditarSinRomper(admin, {
      entityType: "User",
      entityId: "*",
      action: "IMPORTAR_USUARIOS_FARMACIA",
      diff: { creados: creados.length, omitidos: candidatos.length - creados.length },
    });
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
    const { guardados, proveedoresNuevos } = await guardarArticulos(prisma, validos);
    invalidarTodosLosArticulos();
    await auditarSinRomper(admin, {
      entityType: "Articulo",
      entityId: "*",
      action: "IMPORTAR_ARTICULOS",
      diff: { guardados, proveedoresNuevos },
    });
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

/**
 * Cierra una carga por tandas: deja constancia en la auditoría y refresca el
 * contador de la pantalla. Los totales los informa el navegador (son para el
 * registro; lo guardado ya lo validó cada tanda).
 */
export async function finalizarImportArticulos(
  resumen: { guardados?: number; proveedoresNuevos?: number } = {},
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  await auditarSinRomper(admin, {
    entityType: "Articulo",
    entityId: "*",
    action: "IMPORTAR_ARTICULOS",
    diff: { guardados: n(resumen?.guardados), proveedoresNuevos: n(resumen?.proveedoresNuevos) },
  });
  invalidarTodosLosArticulos();
  revalidatePath("/admin/articulos");
  revalidatePath("/admin/proveedores");
  return { ok: true };
}

// ── Cola de correos ────────────────────────────────────────
export type ProcesarColaResult =
  | { ok: true; procesados: number; enviados: number; fallidos: number; dead: number }
  | { ok: false; error: string };

/** Procesa la cola de correos a pedido del admin (no espera al cron). */
export async function procesarColaAhora(): Promise<ProcesarColaResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  try {
    const r = await processOutbox();
    revalidatePath("/admin/correos");
    return { ok: true, ...r };
  } catch (e) {
    console.error("[procesarColaAhora] error:", e);
    return { ok: false, error: "No se pudo procesar la cola." };
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
  await auditarSinRomper(admin, { entityType: "EmailOutbox", entityId: String(id), action: "REINTENTAR_CORREO" });
  revalidatePath("/admin/correos");
  return { ok: true };
}

export async function cancelarCorreo(id: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  await prisma.emailOutbox.update({ where: { id }, data: { estado: "CANCELADO" } });
  await auditarSinRomper(admin, { entityType: "EmailOutbox", entityId: String(id), action: "CANCELAR_CORREO" });
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
    const creado = await prisma.proveedor.create({
      data: {
        nombre: nombreProveedorLimpio(p.data.nombre),
        compradorId: p.data.compradorId || null,
      },
    });
    await auditarSinRomper(admin, {
      entityType: "Proveedor",
      entityId: String(creado.id),
      action: "CREAR_PROVEEDOR",
      diff: { nombre: creado.nombre, compradorId: creado.compradorId },
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

/**
 * Asigna (o quita, con null) el comprador responsable de un proveedor.
 *
 * Los ítems PENDIENTES de los artículos de ese proveedor se mueven con él: al
 * nuevo comprador, o a "Sin asignar" si se quita. Antes quedaban en la bandeja
 * del comprador anterior. Los ya decididos no se tocan.
 */
export async function asignarCompradorProveedor(
  id: number,
  compradorId: string | null,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  id = Number(id);
  const nuevoId = compradorId ? String(compradorId) : null;
  if (!Number.isInteger(id)) return { ok: false, error: "Proveedor inválido." };

  let nuevo: { id: string; email: string; nombre: string } | null = null;
  if (nuevoId) {
    const c = await prisma.user.findUnique({
      where: { id: nuevoId },
      select: { id: true, email: true, nombre: true, role: true, activo: true },
    });
    if (!c || !c.activo || c.role !== "COMPRADOR")
      return { ok: false, error: "El comprador elegido no es válido." };
    nuevo = c;
  }

  let movidos = 0;
  try {
    await prisma.$transaction(async (tx) => {
      const antes = await tx.proveedor.findUniqueOrThrow({
        where: { id },
        select: { nombre: true, compradorId: true },
      });
      await tx.proveedor.update({ where: { id }, data: { compradorId: nuevo?.id ?? null } });
      const r = await tx.itemSolicitud.updateMany({
        where: {
          estadoDecision: "PENDIENTE",
          articulo: { proveedorId: id },
          NOT: { compradorId: nuevo?.id ?? null },
        },
        data: {
          compradorId: nuevo?.id ?? null,
          compradorMailHistorico: nuevo?.email ?? "SIN_COMPRADOR",
        },
      });
      movidos = r.count;
      await auditar(tx, admin, {
        entityType: "Proveedor",
        entityId: String(id),
        action: "ASIGNAR_COMPRADOR",
        diff: {
          proveedor: antes.nombre,
          antes: antes.compradorId,
          despues: nuevo?.id ?? null,
          itemsPendientesMovidos: movidos,
        },
      });
    });
  } catch (e) {
    console.error("[asignarCompradorProveedor] error:", e);
    return { ok: false, error: "No se pudo asignar el comprador." };
  }

  // El cambio de responsable afecta el ruteo → invalidar la caché de lookups.
  invalidarTodosLosArticulos();
  revalidatePath("/admin/proveedores");
  revalidatePath("/admin/sin-asignar");
  return {
    ok: true,
    mensaje: movidos
      ? `${movidos} ítem(s) pendiente(s) pasaron a ${nuevo ? nuevo.nombre : '"Sin asignar"'}.`
      : undefined,
  };
}

export async function toggleProveedor(id: number, activo: boolean): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "No autorizado." };
  try {
    await prisma.proveedor.update({ where: { id: Number(id) }, data: { activo: activo === true } });
  } catch {
    return { ok: false, error: "El proveedor ya no existe. Refrescá." };
  }
  await auditarSinRomper(admin, {
    entityType: "Proveedor",
    entityId: String(id),
    action: activo === true ? "ACTIVAR_PROVEEDOR" : "DESACTIVAR_PROVEEDOR",
  });
  // El ruteo ignora a los proveedores inactivos (ver lib/data/articulos.ts).
  invalidarTodosLosArticulos();
  revalidatePath("/admin/proveedores");
  return { ok: true };
}
