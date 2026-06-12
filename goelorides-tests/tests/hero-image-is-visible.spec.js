const { test, expect } = require('@playwright/test');

test('hero image is visible', async ({ page }) => {
  await page.goto('/');

  const hero = page.locator('.gr-hero-bg');
  await expect(hero).toBeVisible();
});
