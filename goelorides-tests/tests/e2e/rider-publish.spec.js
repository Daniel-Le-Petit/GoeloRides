const { test, expect } = require('@playwright/test');

test('publish ride to social networks', async ({ page }) => {

  await page.goto('/index.html');
  await page.click('text=Partager sur Facebook');

  await expect(page.locator('text=Post généré')).toBeVisible();

  await page.click('text=Copier Instagram');

  await expect(page.locator('text=Copié')).toBeVisible();
});
