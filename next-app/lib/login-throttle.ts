// ─────────────────────────────────────────────────────────────
// Freno a la fuerza bruta en el login: cuenta intentos FALLIDOS por
// clave (email normalizado) dentro de una ventana. En memoria, por
// instancia — suficiente como primera defensa; para multi-instancia
// (serverless) migrar a Redis (ver "Recomendaciones para la app web").
// ─────────────────────────────────────────────────────────────

type Intentos = { count: number; resetAt: number };

const intentos = new Map<string, Intentos>();

export const MAX_INTENTOS = 10;
export const VENTANA_MS = 15 * 60 * 1000; // 15 minutos

/** True si la clave superó el máximo de intentos fallidos en la ventana. */
export function loginBloqueado(clave: string, now: number = Date.now()): boolean {
  const i = intentos.get(clave);
  if (!i) return false;
  if (now > i.resetAt) {
    intentos.delete(clave);
    return false;
  }
  return i.count >= MAX_INTENTOS;
}

/** Registra un intento fallido (inicia o extiende la ventana). */
export function registrarFallo(clave: string, now: number = Date.now()): void {
  const i = intentos.get(clave);
  if (!i || now > i.resetAt) {
    intentos.set(clave, { count: 1, resetAt: now + VENTANA_MS });
    return;
  }
  i.count++;
}

/** Limpia los intentos de una clave (tras un login exitoso). */
export function limpiarIntentos(clave: string): void {
  intentos.delete(clave);
}

/** Solo para tests. */
export function _resetLoginThrottle(): void {
  intentos.clear();
}
