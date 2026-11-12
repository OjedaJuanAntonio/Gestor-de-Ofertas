// Límites de los imports, compartidos entre el navegador y el servidor.

/**
 * Filas de artículos por llamada al servidor. El maestro real (~155.000
 * artículos, ~10 MB) no entra en un solo request (las Server Actions aceptan
 * 1 MB y las funciones serverless tienen tiempo acotado), así que el navegador
 * lo manda en tandas. 4.000 filas son ~300 KB.
 */
export const FILAS_POR_LOTE = 4000;

/** Largo máximo aceptado por campo (lo que excede se rechaza, no se trunca). */
export const MAX_DESCRIPCION = 300;
export const MAX_NOMBRE_PROVEEDOR = 120;
