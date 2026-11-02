// Constantes de contraseñas compartidas (server y client).
// No es un secreto: la clave temporal es pública a propósito (se la dicta el
// admin a la farmacia y se obliga a cambiarla en el primer inicio de sesión).

// Clave temporal para altas masivas y reseteos. Debe tener al menos 6 caracteres
// porque el login (lib/auth.ts) rechaza contraseñas más cortas; por eso no es "1234".
export const CLAVE_TEMPORAL = "123456";

// Mínimo que exigimos cuando el usuario elige su propia contraseña definitiva.
export const MIN_PASSWORD_CAMBIO = 8;
