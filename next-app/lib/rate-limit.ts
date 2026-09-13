// ─────────────────────────────────────────────────────────────
// Rate limiter simple por ventana fija, en memoria (por instancia).
// Protege /api/articulos/lookup, que se llama miles de veces/día.
// Para multi-instancia en producción, migrar a Redis.
// ─────────────────────────────────────────────────────────────

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }
  b.count++;
  if (b.count > limit) {
    return { ok: false, remaining: 0, resetAt: b.resetAt };
  }
  return { ok: true, remaining: limit - b.count, resetAt: b.resetAt };
}
