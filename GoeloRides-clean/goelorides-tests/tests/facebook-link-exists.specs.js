const { test, expect } = require('@playwright/test');

test('facebook link exists', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('a[href*="facebook"]')).toBeVisible();
});
