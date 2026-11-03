import { test, expect, openApp, store, settled } from './support.js';

const adjustments = (page) => page.getByRole('group', { name: /Adjustments/ });
const readout = (page, name) => adjustments(page).locator('.field').filter({ has: page.getByRole('slider', { name, exact: true }) }).locator('.value');
const colors = (page) => store(page, 'project', (p) => [...new Set(p.cells.flatMap((c) => [c.fg.hex, c.bg.hex]))].sort());

// Posterize and Threshold say Off at their neutral end; Threshold's two colors are what the picture splits into.
test('Threshold splits the picture into its dark and light colors; Posterize and Threshold say Off when off', async ({ page }) => {
  await openApp(page);
  await expect(readout(page, 'Posterize')).toHaveText('Off');
  await expect(readout(page, 'Threshold')).toHaveText('Off');
  await expect(adjustments(page).getByRole('slider', { name: 'Black point' })).toBeVisible();
  await expect(adjustments(page).getByRole('slider', { name: 'White point' })).toBeVisible();
  await expect(adjustments(page).getByRole('slider', { name: 'Midtones' })).toBeVisible();

  await adjustments(page).getByLabel('Dark color').fill('#331100');
  await adjustments(page).getByLabel('Light color').fill('#ffaa00');
  await adjustments(page).getByRole('slider', { name: 'Threshold', exact: true }).fill('128');
  await expect(readout(page, 'Threshold')).toHaveText('128');
  await settled(page);
  await expect.poll(() => colors(page)).toEqual(['#331100', '#ffaa00']);

  await adjustments(page).getByRole('slider', { name: 'Posterize' }).fill('4');
  await expect(readout(page, 'Posterize')).toHaveText('4');
});
