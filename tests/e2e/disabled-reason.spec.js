import { test, expect } from './support.js';

// Phones show no tooltips, so a tap on a button that's off says why in a toast.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

test('a tap on a disabled button shows why it is off', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start with a blank canvas' }).click(); // Bake is off with "nothing to bake" (toolbar.bakeNothing)
  await page.getByRole('button', { name: 'Actions' }).click(); // on a phone, Bake is in the Actions menu
  const bake = page.getByRole('button', { name: 'Bake', exact: true });
  await expect(bake).toBeDisabled();
  await bake.tap({ force: true }); // a disabled button fails Playwright's actionability wait
  await expect(page.locator('.app-toast')).toHaveText('Nothing to bake: all sliders are at default values and there are no shapes on the image.');
});
