// The drawing's cell shape follows its bitmap font: in an 8×8 font a half cell is 8 wide and 4 tall, in every view.
import { test, expect, store, tab, settled, pixelBox } from './support.js';

// An 8×8 font with a lower half block (220, rows 4–7) and a full block (219); the rest blank.
const lowerF08 = () => {
  const bytes = new Uint8Array(256 * 8);
  bytes.fill(0xff, 220 * 8 + 4, 221 * 8);
  bytes.fill(0xff, 219 * 8, 220 * 8);
  return { name: 'Lower.F08', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) };
};

test('in an 8×8 font a click in the PIXEL view lands on the grid pixel under it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Manage fonts' }).click();
  const layer = page.locator('.palette-layer');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), layer.getByRole('button', { name: '+ Load' }).click()]);
  await chooser.setFiles(lowerF08());
  await expect(page.getByLabel('Font', { exact: true }).locator('option:checked')).toHaveText('Lower');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start with a blank canvas' }).click();
  await settled(page);
  expect(await store(page, 'project', (p) => p.pixelAspect)).toBe(0.5);
  await tab(page, 'PIXEL').click();
  await page.keyboard.press('p');
  // Grid pixel (5, 11)'s center, a column wide and half a column tall.
  const box = await pixelBox(page);
  const cols = await store(page, 'project', (p) => p.cols), w = box.width / cols;
  await page.mouse.click(box.x + 5.5 * w, box.y + 11.5 * w * 0.5);
  // Lit (brighter than half), its neighbors above and below black. Before, the click landed on the grid pixel at y 5.
  await expect.poll(() => store(page, 'project', (p) => [10, 11, 12].map((y) => (p.baseLayer.pixelAt(5, y)?.r ?? 0) > 128))).toEqual([false, true, false]);
  // The Brush's outline is as tall as it is wide on screen (it is a circle), though a grid pixel is half as tall as wide.
  await page.keyboard.press('b');
  await page.mouse.move(box.x + 20 * w, box.y + 20 * w * 0.5);
  await expect.poll(async () => {
    const o = await page.locator('.canvas-viewport:has(.pixel-display) .tool-preview').boundingBox();
    return o && Math.abs(o.width - o.height) < 1.5 && o.width > 4;
  }).toBe(true);
});
