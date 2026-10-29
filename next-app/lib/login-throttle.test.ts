import { describe, it, expect, beforeEach } from "vitest";
import {
  loginBloqueado,
  registrarFallo,
  limpiarIntentos,
  _resetLoginThrottle,
  MAX_INTENTOS,
  VENTANA_MS,
} from "./login-throttle";

beforeEach(() => _resetLoginThrottle());

describe("login-throttle", () => {
  it("no bloquea por debajo del máximo", () => {
    for (let i = 0; i < MAX_INTENTOS - 1; i++) registrarFallo("a@x.com");
    expect(loginBloqueado("a@x.com")).toBe(false);
  });

  it("bloquea al alcanzar el máximo de intentos fallidos", () => {
    for (let i = 0; i < MAX_INTENTOS; i++) registrarFallo("a@x.com");
    expect(loginBloqueado("a@x.com")).toBe(true);
  });

  it("limpiarIntentos resetea (login exitoso)", () => {
    for (let i = 0; i < MAX_INTENTOS; i++) registrarFallo("a@x.com");
    limpiarIntentos("a@x.com");
    expect(loginBloqueado("a@x.com")).toBe(false);
  });

  it("la ventana expira", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < MAX_INTENTOS; i++) registrarFallo("a@x.com", t0);
    expect(loginBloqueado("a@x.com", t0)).toBe(true);
    expect(loginBloqueado("a@x.com", t0 + VENTANA_MS + 1)).toBe(false);
  });

  it("cuenta por clave de forma independiente", () => {
    for (let i = 0; i < MAX_INTENTOS; i++) registrarFallo("a@x.com");
    expect(loginBloqueado("b@x.com")).toBe(false);
  });
});
