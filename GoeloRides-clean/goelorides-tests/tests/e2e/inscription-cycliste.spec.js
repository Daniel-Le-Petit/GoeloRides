test('cycliste s inscrit à une sortie', async ({ page }) => {
  await page.goto('/index.html');

  await page.click('text=Sorties');
  await page.click('text=Vers Bréhec');

  await page.click('text=Je participe');

  await expect(page.locator('text=Merci pour votre participation')).toBeVisible();
});
