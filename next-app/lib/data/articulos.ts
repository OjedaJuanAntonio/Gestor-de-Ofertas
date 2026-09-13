import "server-only";
import { prisma } from "@/lib/prisma";
import { articuloCache } from "@/lib/cache";
import { normalizeEan } from "@/lib/business/ean";
import type { ArticuloLookup } from "@/types";

// ─────────────────────────────────────────────────────────────
// Acceso al maestro de artículos + resolución del comprador
// responsable por laboratorio. Cacheado en memoria (TTL 24h).
// ─────────────────────────────────────────────────────────────

const CACHE_NULL = "__NULL__";

/**
 * Busca un artículo por EAN y resuelve el comprador asignado a su
 * laboratorio. Devuelve null si el artículo no existe en el maestro.
 * El comprador puede ser null si el laboratorio no tiene responsable
 * (se maneja como "sinComprador" aguas abajo).
 */
export async function lookupArticulo(
  rawEan: string,
): Promise<ArticuloLookup | null> {
  const ean = normalizeEan(rawEan);
  if (!ean) return null;

  const cached = articuloCache.get(ean) as ArticuloLookup | typeof CACHE_NULL | undefined;
  if (cached === CACHE_NULL) return null;
  if (cached) return cached as ArticuloLookup;

  const articulo = await prisma.articulo.findFirst({
    where: { codigoBarra: ean, activo: true },
    select: {
      codigoBarra: true,
      descripcion: true,
      laboratorio: true,
      categoria: true,
      stockReferencia: true,
    },
  });

  if (!articulo) {
    articuloCache.set(ean, CACHE_NULL);
    return null;
  }

  const comprador = await prisma.laboratorioComprador.findFirst({
    where: { laboratorio: articulo.laboratorio, user: { activo: true, role: "COMPRADOR" } },
    select: { user: { select: { id: true, nombre: true, email: true } } },
  });

  const result: ArticuloLookup = {
    codigoBarra: articulo.codigoBarra,
    descripcion: articulo.descripcion,
    laboratorio: articulo.laboratorio,
    categoria: articulo.categoria,
    stockReferencia: articulo.stockReferencia,
    compradorId: comprador?.user.id ?? null,
    compradorNombre: comprador?.user.nombre ?? null,
    compradorMail: comprador?.user.email ?? null,
  };

  articuloCache.set(ean, result);
  return result;
}

/** Invalida la caché de un EAN (al editar/importar el maestro). */
export function invalidarArticulo(rawEan: string): void {
  const ean = normalizeEan(rawEan);
  if (ean) articuloCache.delete(ean);
}

/** Invalida toda la caché de artículos (import masivo / reasignación de compradores). */
export function invalidarTodosLosArticulos(): void {
  articuloCache.clear();
}
