// ─────────────────────────────────────────────────────────────
// Decodificación de archivos CSV subidos por el usuario.
//
// Excel en Windows guarda "CSV (delimitado por comas)" en Windows-1252
// (ANSI), no en UTF-8. Leído como UTF-8, cada vocal con tilde y cada Ñ
// se convierte en "�" y se guardaba así en la base, en silencio
// ("Laboratorios �and� Gen�ricos").
//
// Regla: si los bytes son UTF-8 válido, es UTF-8; si no, se interpretan
// como Windows-1252. "CSV UTF-8" y "Texto Unicode" (UTF-16) de Excel
// traen marca de orden de bytes (BOM) y se detectan por ella.
// Funciona igual en el navegador y en Node.
// ─────────────────────────────────────────────────────────────

export type Codificacion = "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";

export type TextoDecodificado = { texto: string; codificacion: Codificacion };

// Windows-1252 coincide con Latin-1 salvo en 0x80–0x9F, donde tiene €, comillas
// tipográficas, rayas, etc. Se decodifica con tabla propia porque el
// TextDecoder("windows-1252") de algunas versiones de Node trata ese rango como
// Latin-1 (devuelve caracteres de control en vez de "€").
const CP1252_80_9F = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

function decodificarWindows1252(bytes: Uint8Array): string {
  const partes: string[] = [];
  const TROZO = 8192; // String.fromCharCode no admite listas enormes de una vez
  for (let i = 0; i < bytes.length; i += TROZO) {
    const fin = Math.min(i + TROZO, bytes.length);
    const codigos = new Array<number>(fin - i);
    for (let j = i; j < fin; j++) {
      const b = bytes[j];
      codigos[j - i] = b >= 0x80 && b <= 0x9f ? CP1252_80_9F[b - 0x80] : b;
    }
    partes.push(String.fromCharCode(...codigos));
  }
  return partes.join("");
}

export function decodificarCsv(datos: ArrayBuffer | Uint8Array): TextoDecodificado {
  const bytes = datos instanceof Uint8Array ? datos : new Uint8Array(datos);

  let codificacion: Codificacion;
  let texto: string;

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    codificacion = "utf-16le";
    texto = new TextDecoder("utf-16le").decode(bytes);
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    codificacion = "utf-16be";
    texto = new TextDecoder("utf-16be").decode(bytes);
  } else {
    try {
      texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      codificacion = "utf-8";
    } catch {
      texto = decodificarWindows1252(bytes);
      codificacion = "windows-1252";
    }
  }

  // Quita la marca de orden de bytes si quedó como primer carácter.
  return { texto: texto.replace(/^﻿/, ""), codificacion };
}

/** Texto para avisarle al usuario qué se detectó (null si era UTF-8, lo esperado). */
export function avisoCodificacion(c: Codificacion): string | null {
  if (c === "utf-8") return null;
  if (c === "windows-1252")
    return "El archivo no estaba en UTF-8 (es el formato que guarda Excel en Windows). Se convirtió automáticamente: revisá que los acentos y las Ñ se vean bien.";
  return "El archivo estaba en Unicode (UTF-16) y se convirtió automáticamente.";
}
