// Constantes de contraseñas compartidas (server y client). Sin secretos.

// Mínimo que exigimos cuando el usuario elige su propia contraseña definitiva.
export const MIN_PASSWORD_CAMBIO = 8;

// Días de validez de una clave temporal (alta, alta masiva o reseteo). Pasado
// ese plazo sin cambiarla, hay que pedirle otra al administrador.
export const DIAS_VIGENCIA_CLAVE_TEMPORAL = 14;

// Contraseñas tan comunes que no se aceptan como definitivas aunque cumplan el
// largo mínimo (son las primeras que prueba cualquier ataque).
const DEMASIADO_COMUNES = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "87654321",
  "11111111",
  "00000000",
  "password",
  "contraseña",
  "contrasena",
  "qwertyui",
  "qwerty123",
  "farmacia",
  "farmacia1",
  "farmacia123",
  "farmar123",
  "demo1234",
]);

export function esPasswordDemasiadoComun(password: string): boolean {
  return DEMASIADO_COMUNES.has(password.trim().toLowerCase());
}
