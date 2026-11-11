import { decodificarCsv, avisoCodificacion } from "@/lib/import/decodificar";

/**
 * Lee un archivo CSV elegido por el usuario detectando su codificación
 * (UTF-8 o la de Excel en Windows). Solo para el navegador.
 */
export async function leerArchivoCsv(file: File): Promise<{ texto: string; aviso: string | null }> {
  const { texto, codificacion } = decodificarCsv(await file.arrayBuffer());
  return { texto, aviso: avisoCodificacion(codificacion) };
}
