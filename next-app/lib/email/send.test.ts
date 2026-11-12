import { describe, it, expect } from "vitest";
import { modoEnvio } from "./send";

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

describe("modoEnvio", () => {
  it("EMAIL_DRY_RUN=true simula siempre (aunque haya clave)", () => {
    expect(modoEnvio(env({ EMAIL_DRY_RUN: "true", RESEND_API_KEY: "re_x", NODE_ENV: "production" }))).toBe("simulacion");
  });

  it("con clave y sin dry-run, envía de verdad", () => {
    expect(modoEnvio(env({ RESEND_API_KEY: "re_x", NODE_ENV: "production" }))).toBe("real");
    expect(modoEnvio(env({ RESEND_API_KEY: "re_x", EMAIL_DRY_RUN: "false", NODE_ENV: "production" }))).toBe("real");
  });

  it("en producción sin clave NO simula: queda sin configurar (el envío falla)", () => {
    expect(modoEnvio(env({ NODE_ENV: "production" }))).toBe("sin-configurar");
    expect(modoEnvio(env({ NODE_ENV: "production", EMAIL_DRY_RUN: "false" }))).toBe("sin-configurar");
  });

  it("fuera de producción, sin clave, simula (dev y tests)", () => {
    expect(modoEnvio(env({ NODE_ENV: "development" }))).toBe("simulacion");
    expect(modoEnvio(env({ NODE_ENV: "test" }))).toBe("simulacion");
  });
});
