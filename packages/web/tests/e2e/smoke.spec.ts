import { test, expect } from "@playwright/test";

test("la app carga el shell", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/facturAI|Factur|Venta|Caja/i);
});
