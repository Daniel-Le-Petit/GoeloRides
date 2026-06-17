const { test, expect } = require('@playwright/test');
test('ouvrir détail sortie', async ({ page }) => {
  await page.goto('/index.html');

  await page.click('text=Sorties');

  await page.click('text=Voir');

  await expect(page.locator('text=Point de départ')).toBeVisible();
});
