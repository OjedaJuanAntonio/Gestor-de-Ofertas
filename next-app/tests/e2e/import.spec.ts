import { test, expect, type Page } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

// ─────────────────────────────────────────────────────────────
// E2E del import del maestro de artículos desde la pantalla:
// archivo guardado por Excel en Windows (Windows-1252, con ';'),
// aviso de conversión, carga por tandas y resultado visible.
// ─────────────────────────────────────────────────────────────

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const PASS = "demo1234";
const PREFIJO = "99777";

async function sql<T extends Record<string, unknown> = Record<string, unknown>>(
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    return (await db.query(query, params)).rows as T[];
  } finally {
    await db.end();
  }
}

async function limpiar() {
  await sql(`DELETE FROM articulos WHERE "codigoBarra" LIKE $1`, [`${PREFIJO}%`]);
  await sql(`DELETE FROM proveedores WHERE nombre ILIKE 'Laboratorios Ñandú E2E%'`);
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASS);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

/** Codifica como lo hace Excel en Windows: un byte por carácter (Latin-1 / Windows-1252). */
const comoExcel = (texto: string) => Buffer.from(texto, "latin1");

test.describe("Import de artículos", () => {
  test.beforeAll(limpiar);
  test.afterAll(limpiar);

  test("sube un CSV de Excel (Windows-1252): avisa, importa y conserva acentos y Ñ", async ({ page }) => {
    const csv = [
      "codigoBarra;descripcion;laboratorio",
      `${PREFIJO}00000011;Ibuprofeno 600 mg cápsulas;Laboratorios Ñandú E2E`,
      `${PREFIJO}00000028;Jarabe pediátrico 120 ml;LABORATORIOS ÑANDÚ E2E`,
      `123;Código demasiado corto;Laboratorios Ñandú E2E`,
    ].join("\r\n");

    await login(page, "admin@drogueria.com");
    await page.goto("/admin/articulos");
    await page.locator('input[type="file"]').setInputFiles({
      name: "maestro.csv",
      mimeType: "text/csv",
      buffer: comoExcel(csv),
    });

    await expect(page.getByText("El archivo no estaba en UTF-8")).toBeVisible();
    await expect(page.getByText("2 válidas")).toBeVisible();
    await expect(page.getByText("1 con error")).toBeVisible();

    await page.getByRole("button", { name: /Importar 2 artículo/ }).click();
    await expect(page.getByText(/Importados 2 artículo\(s\) · 1 proveedor\(es\) nuevo\(s\)/)).toBeVisible();

    const filas = await sql<{ descripcion: string; proveedor: string }>(
      `SELECT a.descripcion, p.nombre AS proveedor
         FROM articulos a JOIN proveedores p ON p.id = a."proveedorId"
        WHERE a."codigoBarra" LIKE $1 ORDER BY a."codigoBarra"`,
      [`${PREFIJO}%`],
    );
    expect(filas).toEqual([
      { descripcion: "Ibuprofeno 600 mg cápsulas", proveedor: "Laboratorios Ñandú E2E" },
      // Mismo proveedor aunque en el archivo venga en mayúsculas.
      { descripcion: "Jarabe pediátrico 120 ml", proveedor: "Laboratorios Ñandú E2E" },
    ]);
  });
});
