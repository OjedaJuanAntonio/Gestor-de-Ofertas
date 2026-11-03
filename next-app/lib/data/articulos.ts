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
 *
 * Delega en `lookupArticulosBatch` para no duplicar la lógica de caché /
 * resolución de comprador.
 */
export async function lookupArticulo(
  rawEan: string,
): Promise<ArticuloLookup | null> {
  const ean = normalizeEan(rawEan);
  if (!ean) return null;
  const map = await lookupArticulosBatch([ean]);
  return map.get(ean) ?? null;
}

/**
 * Versión por lotes de `lookupArticulo`: resuelve muchos EAN con, a lo sumo,
 * dos queries (una al maestro y una a los compradores de los laboratorios
 * involucrados) en vez de 2×N. Respeta la caché por EAN (hits y nulls) y la
 * puebla con los resultados nuevos.
 *
 * Devuelve un Map keyeado por EAN NORMALIZADO → artículo o null. El llamador
 * debe normalizar el EAN con `normalizeEan` antes de buscar en el Map (como
 * se guardan en el maestro). Los EAN que no normalizan se ignoran.
 */
export async function lookupArticulosBatch(
  rawEans: string[],
): Promise<Map<string, ArticuloLookup | null>> {
  const out = new Map<string, ArticuloLookup | null>();

  const eans = [
    ...new Set(rawEans.map(normalizeEan).filter((e): e is string => !!e)),
  ];
  if (eans.length === 0) return out;

  // 1) Caché: separar los que ya conocemos (artículo o null) de los faltantes.
  const faltantes: string[] = [];
  for (const ean of eans) {
    const cached = articuloCache.get(ean) as ArticuloLookup | typeof CACHE_NULL | undefined;
    if (cached === CACHE_NULL) out.set(ean, null);
    else if (cached) out.set(ean, cached as ArticuloLookup);
    else faltantes.push(ean);
  }
  if (faltantes.length === 0) return out;

  // 2) Un solo findMany al maestro por todos los faltantes, trayendo el
  //    proveedor y su comprador responsable por clave foránea (sin segunda
  //    query ni coincidencia de texto).
  const articulos = await prisma.articulo.findMany({
    where: { codigoBarra: { in: faltantes }, activo: true },
    select: {
      codigoBarra: true,
      descripcion: true,
      categoria: true,
      stockReferencia: true,
      proveedor: {
        select: {
          nombre: true,
          comprador: {
            select: { id: true, nombre: true, email: true, activo: true, role: true },
          },
        },
      },
    },
  });

  // 3) Armar resultados + poblar la caché.
  const encontrados = new Set<string>();
  for (const a of articulos) {
    const c = a.proveedor.comprador;
    // El responsable vale solo si sigue activo y con rol comprador.
    const comprador = c && c.activo && c.role === "COMPRADOR" ? c : null;
    const result: ArticuloLookup = {
      codigoBarra: a.codigoBarra,
      descripcion: a.descripcion,
      // El DTO mantiene "laboratorio" = nombre del proveedor (no cambia la UI).
      laboratorio: a.proveedor.nombre,
      categoria: a.categoria,
      stockReferencia: a.stockReferencia,
      compradorId: comprador?.id ?? null,
      compradorNombre: comprador?.nombre ?? null,
      compradorMail: comprador?.email ?? null,
    };
    articuloCache.set(a.codigoBarra, result);
    out.set(a.codigoBarra, result);
    encontrados.add(a.codigoBarra);
  }

  // 5) Faltantes que no aparecieron en el maestro → null (cacheado).
  for (const ean of faltantes) {
    if (!encontrados.has(ean)) {
      articuloCache.set(ean, CACHE_NULL);
      out.set(ean, null);
    }
  }

  return out;
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
