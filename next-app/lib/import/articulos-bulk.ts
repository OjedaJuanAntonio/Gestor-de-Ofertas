import { Prisma, type PrismaClient } from "@prisma/client";
import type { ArticuloImport } from "@/lib/import/articulos-csv";

// ─────────────────────────────────────────────────────────────
// Guardado masivo del maestro de artículos.
//
// Antes cada artículo era un `upsert` propio: 155.000 idas y vueltas a
// la base. Ahora cada tanda es UNA sentencia `INSERT ... ON CONFLICT`
// con miles de filas, y los proveedores se resuelven de una vez.
//
// Lo usan la Server Action (por tandas, desde el navegador) y el
// script de consola (scripts/importar-articulos.ts), por eso recibe el
// cliente de Prisma por parámetro.
// ─────────────────────────────────────────────────────────────

/** Filas por sentencia SQL. 3 parámetros por fila; Postgres admite 65.535. */
const FILAS_POR_SENTENCIA = 5000;

/**
 * Clave para reconocer que dos nombres son el MISMO proveedor aunque difieran
 * en mayúsculas o espacios ("BAYER", "Bayer ", "bayer  s.a." vs "Bayer S.A.").
 * No toca acentos ni puntuación: ahí prefiere no fusionar de más.
 */
export function claveProveedor(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Nombre prolijo para guardar (espacios colapsados, sin tocar mayúsculas). */
export function nombreProveedorLimpio(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ");
}

/**
 * Devuelve clave → id para todos los nombres pedidos, creando los proveedores
 * que no existan. Reconoce los existentes sin distinguir mayúsculas/espacios.
 */
export async function resolverProveedores(
  db: PrismaClient,
  nombres: string[],
): Promise<{ idPorClave: Map<string, number>; creados: number }> {
  const existentes = await db.proveedor.findMany({ select: { id: true, nombre: true } });
  const idPorClave = new Map<string, number>();
  for (const p of existentes) {
    const k = claveProveedor(p.nombre);
    if (!idPorClave.has(k)) idPorClave.set(k, p.id);
  }

  // Nombres nuevos, una vez cada uno (gana la primera forma de escribirlo).
  const nuevos = new Map<string, string>();
  for (const n of nombres) {
    const k = claveProveedor(n);
    if (k && !idPorClave.has(k) && !nuevos.has(k)) nuevos.set(k, nombreProveedorLimpio(n));
  }

  if (nuevos.size > 0) {
    await db.proveedor.createMany({
      data: [...nuevos.values()].map((nombre) => ({ nombre })),
      skipDuplicates: true,
    });
    const creados = await db.proveedor.findMany({
      where: { nombre: { in: [...nuevos.values()] } },
      select: { id: true, nombre: true },
    });
    for (const p of creados) idPorClave.set(claveProveedor(p.nombre), p.id);
  }

  return { idPorClave, creados: nuevos.size };
}

export type ResultadoGuardado = { guardados: number; proveedoresNuevos: number };

/**
 * Crea o actualiza los artículos (por código de barras) y los deja activos.
 * `filas` ya debe venir validado (ver parseArticulosCsv / la Server Action).
 */
export async function guardarArticulos(
  db: PrismaClient,
  filas: ArticuloImport[],
  opts: { onProgreso?: (hechos: number, total: number) => void } = {},
): Promise<ResultadoGuardado> {
  if (filas.length === 0) return { guardados: 0, proveedoresNuevos: 0 };

  // Un código repetido dentro de la misma sentencia hace fallar el
  // ON CONFLICT: se deduplica (gana la última aparición).
  const porCodigo = new Map<string, ArticuloImport>();
  for (const f of filas) porCodigo.set(f.codigoBarra, f);
  const unicas = [...porCodigo.values()];

  const { idPorClave, creados } = await resolverProveedores(
    db,
    unicas.map((f) => f.laboratorio),
  );

  for (let i = 0; i < unicas.length; i += FILAS_POR_SENTENCIA) {
    const lote = unicas.slice(i, i + FILAS_POR_SENTENCIA);
    const valores = lote.map((a) => {
      const proveedorId = idPorClave.get(claveProveedor(a.laboratorio));
      if (proveedorId === undefined) {
        throw new Error(`No se pudo resolver el proveedor "${a.laboratorio}".`);
      }
      // updatedAt es TIMESTAMP sin zona y Prisma lo guarda en UTC.
      return Prisma.sql`(${a.codigoBarra}, ${a.descripcion}, ${proveedorId}, true, (now() AT TIME ZONE 'UTC'))`;
    });
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "articulos" ("codigoBarra", "descripcion", "proveedorId", "activo", "updatedAt")
      VALUES ${Prisma.join(valores)}
      ON CONFLICT ("codigoBarra") DO UPDATE SET
        "descripcion" = EXCLUDED."descripcion",
        "proveedorId" = EXCLUDED."proveedorId",
        "activo"      = true,
        "updatedAt"   = EXCLUDED."updatedAt"`);
    opts.onProgreso?.(Math.min(i + lote.length, unicas.length), unicas.length);
  }

  return { guardados: unicas.length, proveedoresNuevos: creados };
}
