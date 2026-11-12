import { test, expect, type Page } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

// ─────────────────────────────────────────────────────────────
// E2E de operación: la cola de correos se ve y se puede procesar a
// mano, la auditoría es consultable, y el admin ve los pendientes de
// todos los compradores.
// ─────────────────────────────────────────────────────────────

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const PASS = "demo1234";

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

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASS);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

test.describe("Operación (admin)", () => {
  test("la cola de correos muestra lo pendiente y se puede procesar a mano", async ({ page }) => {
    const asunto = `E2E cola ${Date.now()}`;
    // Deja limpia la cola para que los números del test sean exactos.
    await sql(`UPDATE email_outbox SET estado = 'CANCELADO' WHERE estado IN ('PENDIENTE', 'FALLIDO')`);
    await sql(
      `INSERT INTO email_outbox (id, tipo, destinatario, asunto, payload, estado, "updatedAt")
       VALUES ($1, 'RECHAZO_TOTAL_FARMACIA', 'e2e-cola@farma.test', $2, '{"codigo":"SOL-E2E"}', 'PENDIENTE', now())`,
      [`e2e-${Date.now()}`, asunto],
    );
    try {
      await login(page, "admin@drogueria.com");
      await page.goto("/admin/correos");

      // El CI corre con EMAIL_DRY_RUN=true: la pantalla lo avisa.
      await expect(page.getByText("Modo simulación:")).toBeVisible();
      const enCola = page.locator("dl > div", { hasText: "En cola" }).locator("dd");
      await expect(enCola).toHaveText("1");

      await page.getByRole("button", { name: "Procesar cola ahora" }).click();
      await expect(page.getByText(/Procesados 1: 1 enviados/)).toBeVisible();
      await expect(enCola).toHaveText("0");

      const [fila] = await sql<{ estado: string }>(`SELECT estado FROM email_outbox WHERE asunto = $1`, [asunto]);
      expect(fila.estado).toBe("ENVIADO");
    } finally {
      await sql(`DELETE FROM email_outbox WHERE asunto = $1`, [asunto]);
    }
  });

  test("el endpoint del cron no acepta la sesión del admin, solo el secreto", async ({ page }) => {
    await login(page, "admin@drogueria.com");
    expect((await page.request.get("/api/cron/outbox")).status()).toBe(401);
    expect((await page.request.post("/api/cron/outbox")).status()).toBe(401);
  });

  test("las acciones del admin quedan en la auditoría y se pueden buscar", async ({ page }) => {
    const codigo = `E2E${String(Date.now()).slice(-8)}`;
    try {
      await login(page, "admin@drogueria.com");
      await page.goto("/admin/farmacias");
      await page.getByPlaceholder("F001").fill(codigo.toLowerCase());
      await page.getByPlaceholder("Farmacia Nueva 1234").fill(`Farmacia Auditoría ${codigo}`);
      await page.getByRole("button", { name: "Agregar" }).click();
      await expect(page.getByRole("cell", { name: codigo, exact: true })).toBeVisible();

      await page.goto(`/admin/auditoria?q=${codigo}`);
      const fila = page.getByRole("row", { name: new RegExp(codigo) });
      await expect(fila).toContainText("Farmacia creada");
      await expect(fila).toContainText("admin@drogueria.com");
    } finally {
      await sql(`DELETE FROM farmacias WHERE id = $1`, [codigo]);
      await sql(`DELETE FROM audit_log WHERE "entityId" = $1`, [codigo]);
    }
  });

  test("el admin ve en la bandeja los pendientes de todos los compradores", async ({ page }) => {
    const [{ n }] = await sql<{ n: string }>(
      `SELECT count(*)::text AS n FROM items_solicitud WHERE "estadoDecision" = 'PENDIENTE' AND "compradorId" IS NOT NULL`,
    );
    test.skip(n === "0", "no hay ítems pendientes asignados en esta base");

    await login(page, "admin@drogueria.com");
    await page.goto("/comprador/bandeja");
    await expect(page.getByText("Ítems pendientes de todos los compradores")).toBeVisible();
    await expect(page.getByText(`${n} pendiente(s)`)).toBeVisible();
  });
});
