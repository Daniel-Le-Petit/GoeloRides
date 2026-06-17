const { test, expect } = require('@playwright/test');

test('rider creates a ride', async ({ page }) => {
  await page.goto('/index.html');

  // ouvrir formulaire création
  await page.click('text=Créer une sortie');

  // remplir formulaire
  await page.fill('input[name="title"]', 'Sortie test Goëlo');
  await page.fill('input[name="location"]', 'Côte du Goëlo');

  // options
  await page.selectOption('select[name="type"]', 'Route');
  await page.selectOption('select[name="group"]', 'Vert');

  // submit
  await page.click('text=Créer');

  await expect(page.locator('text=Sortie créée')).toBeVisible();
});
