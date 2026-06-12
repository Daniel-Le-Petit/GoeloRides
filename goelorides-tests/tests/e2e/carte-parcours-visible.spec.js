test('carte parcours visible', async ({ page }) => {
  await page.goto('/index.html');

  await page.click('text=Sorties');
  await page.click('text=Vers Bréhec');

  await expect(page.locator('text=Carte du parcours')).toBeVisible();
});
