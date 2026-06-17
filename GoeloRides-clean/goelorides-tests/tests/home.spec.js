const { test, expect } = require('@playwright/test');

test('GoëloRides home loads', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Goëlo/i);
});
