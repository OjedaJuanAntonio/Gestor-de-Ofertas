import "server-only";
import { randomInt } from "node:crypto";
import { DIAS_VIGENCIA_CLAVE_TEMPORAL } from "@/lib/password";

// ─────────────────────────────────────────────────────────────
// Claves temporales: una distinta y aleatoria por usuario.
//
// Antes todas las altas masivas y reseteos usaban la misma clave
// ("123456"), que además estaba escrita en el código. Cualquiera que
// conociera el mail de una farmacia podía entrar antes que ella y
// quedarse con la cuenta. Ahora cada clave se genera al azar, se
// muestra UNA sola vez al administrador y vence a los pocos días.
// ─────────────────────────────────────────────────────────────

// Sin caracteres que se confunden al dictarlos o copiarlos a mano
// (0/o, 1/l/i). 31 símbolos ^ 10 posiciones ≈ 49 bits.
const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";

export function generarClaveTemporal(largo = 10): string {
  let out = "";
  for (let i = 0; i < largo; i++) out += ALFABETO[randomInt(ALFABETO.length)];
  return out;
}

export function vencimientoClaveTemporal(desde: Date = new Date()): Date {
  return new Date(desde.getTime() + DIAS_VIGENCIA_CLAVE_TEMPORAL * 24 * 60 * 60 * 1000);
}
