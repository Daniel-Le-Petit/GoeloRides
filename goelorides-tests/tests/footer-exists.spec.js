const { test, expect } = require('@playwright/test');

test('footer exists', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('footer')).toBeVisible();
});
