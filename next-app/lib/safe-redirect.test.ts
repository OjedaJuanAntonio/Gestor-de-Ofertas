import { describe, it, expect } from "vitest";
import { rutaInternaSegura } from "./safe-redirect";

describe("rutaInternaSegura", () => {
  it("acepta rutas internas con query y hash", () => {
    expect(rutaInternaSegura("/farmacia/mis-solicitudes?page=2#x")).toBe(
      "/farmacia/mis-solicitudes?page=2#x",
    );
  });

  it("vacío o ausente → fallback", () => {
    expect(rutaInternaSegura(null)).toBe("/");
    expect(rutaInternaSegura("")).toBe("/");
    expect(rutaInternaSegura(undefined, { fallback: "/inicio" })).toBe("/inicio");
  });

  it("rechaza sitios externos en todas sus formas", () => {
    for (const malo of [
      "https://example.com/phishing",
      "http://example.com",
      "//example.com",
      "/\\example.com",
      "javascript:alert(1)",
      "example.com",
      "/\t/example.com",
      "/\n/example.com",
    ]) {
      expect(rutaInternaSegura(malo), malo).toBe("/");
    }
  });

  it("una URL absoluta del mismo origen se reduce a su ruta", () => {
    const origin = "https://ofertas.farmar.com";
    expect(rutaInternaSegura(`${origin}/admin/usuarios?x=1`, { origin })).toBe("/admin/usuarios?x=1");
    expect(rutaInternaSegura("https://otro.com/admin", { origin })).toBe("/");
  });
});
