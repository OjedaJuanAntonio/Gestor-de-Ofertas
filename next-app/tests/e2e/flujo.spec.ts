import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// ─────────────────────────────────────────────────────────────
// E2E del ciclo completo: la farmacia carga → el comprador aprueba
// → Precios cierra. Incluye un chequeo de accesibilidad (axe) en la
// pantalla de carga (la más usada por adultos mayores).
// ─────────────────────────────────────────────────────────────

const PASS = "demo1234";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASS);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 30_000,
  });
}

test.describe.serial("Flujo completo de oferta", () => {
  test("la farmacia carga una solicitud (con chequeo de accesibilidad)", async ({
    page,
  }) => {
    await login(page, "farmacia@drogueria.com");
    await expect(
      page.getByRole("heading", { name: "Nueva solicitud de oferta" }),
    ).toBeVisible();

    // Accesibilidad: sin violaciones críticas en la grilla de carga.
    const axe = await new AxeBuilder({ page }).analyze();
    const criticas = axe.violations.filter((v) => v.impact === "critical");
    expect(criticas, JSON.stringify(criticas, null, 2)).toHaveLength(0);

    // Cargar un ítem: EAN → lookup autocompleta descripción.
    const ean = page.locator('input[inputmode="numeric"]').first();
    await ean.fill("7791234500011");
    await ean.blur();
    await expect(page.getByText("Aspirina 500mg x20")).toBeVisible();

    // Cantidad + motivo.
    await page.locator('input[type="number"]').first().fill("12");
    await page.locator("select").nth(1).selectOption("SOBRESTOCK");

    // Enviar + confirmar.
    await page.getByRole("button", { name: /Enviar solicitud/ }).click();
    await page.getByRole("button", { name: "Confirmar y enviar" }).click();

    await expect(page.getByText("¡Solicitud enviada!")).toBeVisible();
    await expect(page.getByText(/SOL-/)).toBeVisible();
  });

  test("el comprador aprueba el ítem con una condición", async ({ page }) => {
    await login(page, "c1@drogueria.com");
    await expect(
      page.getByRole("heading", { name: "Bandeja de aprobaciones" }),
    ).toBeVisible();

    // Aprobar el primer pendiente → la condición se vuelve obligatoria.
    await page.getByRole("button", { name: "Aprobar" }).first().click();
    await page
      .getByPlaceholder("Condición (ej: 50%, 2x1)")
      .first()
      .fill("50% OFF");
    await page.getByRole("button", { name: /Confirmar decisiones/ }).click();
    // Diálogo de confirmación "¿estás seguro?".
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();

    await expect(page.getByText("Decisiones guardadas")).toBeVisible();
  });

  test("Precios carga el ítem en el ERP y cierra el ciclo", async ({ page }) => {
    await login(page, "precios@drogueria.com");
    await expect(
      page.getByRole("heading", { name: "Carga en el sistema (ERP)" }),
    ).toBeVisible();

    // Marcar el primer aprobado y confirmar la carga.
    await page.locator('tbody input[type="checkbox"]').first().check();
    await page
      .getByRole("button", { name: /Confirmar cargas en sistema/ })
      .click();
    // Diálogo de confirmación "¿estás seguro?".
    await page.getByRole("button", { name: "Confirmar cargas", exact: true }).click();

    await expect(page.getByText("Cargas confirmadas")).toBeVisible();
  });
});
