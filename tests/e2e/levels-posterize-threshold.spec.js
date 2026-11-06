import { test, expect, openApp, store, settled } from './support.js';

const adjustments = (page) => page.getByRole('group', { name: /Adjustments/ });
const readout = (page, name) => adjustments(page).locator('.field').filter({ has: page.getByRole('slider', { name, exact: true }) }).locator('.value');
const colors = (page) => store(page, 'project', (p) => [...new Set(p.cells.flatMap((c) => [c.fg.hex, c.bg.hex]))].sort());

// White point starts at the slider's far end. On a computer the label row shows the value and the tooltip takes no
// room, so it doesn't hang past the row; on a phone, where the finger covers the label row, it shows while dragging.
const tooltip = (page, name) => adjustments(page).locator('.field').filter({ has: page.getByRole('slider', { name, exact: true }) }).locator('.value-tooltip');
const wrapper = (page, name) => adjustments(page).locator('.range-wrapper').filter({ has: page.getByRole('slider', { name, exact: true }) });

// Posterize and Threshold say Off at their neutral end; Threshold's two colors are what the picture splits into.
test('Threshold splits the picture into its dark and light colors; Posterize and Threshold say Off when off; White point\'s hidden tooltip takes no room at the slider\'s far end', async ({ page }) => {
  await openApp(page);
  await expect(tooltip(page, 'White point')).toBeHidden();
  expect(await wrapper(page, 'White point').evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
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

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('a slider\'s tooltip shows while it\'s held, and hides after', async ({ page }) => {
    await openApp(page);
    await page.getByTitle('Toggle settings').click();
    const slider = adjustments(page).getByRole('slider', { name: 'White point' });
    await slider.scrollIntoViewIfNeeded();
    await expect(slider).toBeInViewport();
    await expect(tooltip(page, 'White point')).toBeHidden();
    const box = await slider.boundingBox();
    await page.waitForFunction(({ x, y }) => document.elementFromPoint(x, y)?.matches('input[type=range]'), // the drawer has finished sliding in
      { x: box.x + box.width - 4, y: box.y + box.height / 2 });
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
    await page.mouse.down();
    await expect(tooltip(page, 'White point')).toBeVisible();
    await page.mouse.up();
    await expect(tooltip(page, 'White point')).toBeHidden();
  });
});
