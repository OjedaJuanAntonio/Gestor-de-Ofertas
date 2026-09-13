// ─────────────────────────────────────────────────────────────
// Caché en memoria con TTL (por instancia de servidor).
// Usado por el lookup de artículos para responder en <50ms ante
// búsquedas repetidas sobre un maestro pesado (~155k artículos),
// sin pegarle a la DB cada vez. El maestro cambia ~1 vez/día, así
// que un TTL de 24h es seguro; las mutaciones invalidan por clave.
// ─────────────────────────────────────────────────────────────

type Entry<V> = { value: V; expiresAt: number };

export class TtlCache<K, V> {
  private store = new Map<K, Entry<V>>();
  constructor(private ttlMs: number) {}

  get(key: K): V | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: K, value: V): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

const HORA = 60 * 60 * 1000;

/** Caché global de lookups de artículos (24h). */
export const articuloCache = new TtlCache<string, unknown>(24 * HORA);
