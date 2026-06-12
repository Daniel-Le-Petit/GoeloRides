const { test, expect } = require('@playwright/test');

test('full GoëloRides flow', async ({ page }) => {

  // 1. création sortie
  await page.goto('/index.html');
  await page.click('text=Créer une sortie');
  await page.fill('input[name="title"]', 'Flow test ride');
  await page.click('text=Créer');

  await expect(page.locator('text=Sortie créée')).toBeVisible();

  // 2. publication
  await page.click('text=Partager sur Facebook');

  await expect(page.locator('text=Post généré')).toBeVisible();

  // 3. inscription cycliste (simulation)
  await page.goto('/sorties');
  await page.click('text=Flow test ride');
  await page.click('text=S’inscrire');

  await expect(page.locator('text=Inscription confirmée')).toBeVisible();
});
