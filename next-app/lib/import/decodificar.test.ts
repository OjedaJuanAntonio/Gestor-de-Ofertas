import { describe, it, expect } from "vitest";
import { decodificarCsv, avisoCodificacion } from "./decodificar";

const TEXTO = "codigo;nombre\n1;Laboratorios Ñandú Genéricos\n";

describe("decodificarCsv", () => {
  it("UTF-8 (con o sin BOM) se lee tal cual", () => {
    const sinBom = decodificarCsv(Buffer.from(TEXTO, "utf8"));
    expect(sinBom).toEqual({ texto: TEXTO, codificacion: "utf-8" });
    const conBom = decodificarCsv(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(TEXTO, "utf8")]));
    expect(conBom).toEqual({ texto: TEXTO, codificacion: "utf-8" });
  });

  it("Windows-1252 (CSV de Excel en Windows) conserva acentos y Ñ", () => {
    const r = decodificarCsv(Buffer.from(TEXTO, "latin1"));
    expect(r.codificacion).toBe("windows-1252");
    expect(r.texto).toBe(TEXTO);
    expect(r.texto).not.toContain("�");
  });

  it("caracteres propios de Windows-1252 (€, comillas tipográficas)", () => {
    const r = decodificarCsv(new Uint8Array([0x80, 0x20, 0x93, 0x78, 0x94]));
    expect(r.texto).toBe("€ “x”");
  });

  it("UTF-16 con BOM (\"Texto Unicode\" de Excel)", () => {
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(TEXTO, "utf16le")]);
    expect(decodificarCsv(le)).toEqual({ texto: TEXTO, codificacion: "utf-16le" });
  });

  it("acepta ArrayBuffer y archivo vacío", () => {
    const buf = Buffer.from("a;b", "utf8");
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    expect(decodificarCsv(ab).texto).toBe("a;b");
    expect(decodificarCsv(new Uint8Array(0))).toEqual({ texto: "", codificacion: "utf-8" });
  });

  it("solo avisa cuando hubo conversión", () => {
    expect(avisoCodificacion("utf-8")).toBeNull();
    expect(avisoCodificacion("windows-1252")).toMatch(/Excel/);
  });
});
