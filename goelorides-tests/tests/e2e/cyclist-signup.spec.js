const { test, expect } = require('@playwright/test');

test('cyclist signs up to ride', async ({ page }) => {

  await page.goto('/index.html');

  await page.goto('/sorties');

  await page.click('text=Voir');

  await page.click('text=Je participe !');

  await page.selectOption('select[name="group"]', 'Vert');

  await page.click('text=Confirmer');

  await expect(page.locator('text=Inscription confirmée')).toBeVisible();
});
