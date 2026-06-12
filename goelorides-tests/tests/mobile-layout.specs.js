const { test, expect } = require('@playwright/test');

test('mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/');

  await expect(page.locator('.gr-stats')).toBeVisible();
});
