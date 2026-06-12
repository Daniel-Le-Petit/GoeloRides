const { test, expect } = require('@playwright/test');

test('liste des sorties s affiche', async ({ page }) => {
  await page.goto('/index.html');

  await page.click('text=Sorties');

  await expect(page.locator('text=Toutes les sorties de la Côte du Goëlo')).toBeVisible();
});
