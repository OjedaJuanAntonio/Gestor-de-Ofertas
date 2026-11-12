import { test, expect, type Page } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

// ─────────────────────────────────────────────────────────────
// E2E de seguridad: lo que la auditoría encontró (o verificó) no debe
// volver a romperse. Cabeceras, redirección tras el login, barreras
// por rol y corte de sesión al desactivar un usuario.
// ─────────────────────────────────────────────────────────────

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const PASS = "demo1234";

async function login(page: Page, email: string, path = "/login") {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASS);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

async function sql(query: string, params: unknown[] = []) {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query(query, params);
  } finally {
    await db.end();
  }
}

test.describe("Seguridad", () => {
  test("las respuestas llevan cabeceras de seguridad", async ({ request }) => {
    const res = await request.get("/login");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBeTruthy();
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("sin sesión: las secciones redirigen al login y la API responde 401", async ({ page, request }) => {
    await page.goto("/admin/usuarios");
    await expect(page).toHaveURL(/\/login/);
    const api = await request.get("/api/articulos/lookup?ean=7791234500011");
    expect(api.status()).toBe(401);
  });

  test("el login no redirige a sitios externos (callbackUrl)", async ({ page, baseURL }) => {
    await login(page, "farmacia@drogueria.com", "/login?callbackUrl=https://example.com/phishing");
    await expect(page).toHaveURL(/\/farmacia\/nueva-solicitud/);
    expect(page.url().startsWith(baseURL!)).toBe(true);
  });

  test("una farmacia no entra a otras secciones ni recibe datos de otras farmacias", async ({ page }) => {
    await login(page, "farmacia@drogueria.com");
    for (const ruta of ["/admin/usuarios", "/admin/farmacias", "/comprador/bandeja", "/precios/dashboard"]) {
      await page.goto(ruta);
      await expect(page, ruta).toHaveURL(/\/farmacia\/nueva-solicitud/);
    }
    // El HTML de su pantalla de carga no trae los mails de las demás farmacias.
    const html = await (await page.request.get("/farmacia/nueva-solicitud")).text();
    expect(html).toContain("central3303@farma.com");
    expect(html).not.toContain("pueblo1102@farma.com");
    expect(html).not.toContain("sanmartin4501@farma.com");
  });

  test("un comprador no usa la API de carga ni entra al panel admin", async ({ page }) => {
    await login(page, "s1@drogueria.com");
    const api = await page.request.get("/api/articulos/lookup?ean=7791234500011");
    expect(api.status()).toBe(401);
    await page.goto("/admin/usuarios");
    await expect(page).toHaveURL(/\/comprador\/bandeja/);
  });

  test("desactivar un usuario le corta la sesión abierta", async ({ page }) => {
    // Requiere el servidor con SESSION_REVALIDAR_SEG=1 (así corre en CI); con
    // el valor por defecto (5 min) el corte tardaría más que el test.
    test.skip(process.env.SESSION_REVALIDAR_SEG !== "1", "necesita SESSION_REVALIDAR_SEG=1");

    await login(page, "s1@drogueria.com");
    await expect(page.getByRole("heading", { name: "Bandeja de aprobaciones" })).toBeVisible();

    await sql(`UPDATE users SET activo = false WHERE email = $1`, ["s1@drogueria.com"]);
    try {
      await page.waitForTimeout(1500);
      await page.goto("/comprador/bandeja");
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await sql(`UPDATE users SET activo = true WHERE email = $1`, ["s1@drogueria.com"]);
    }
  });
});
