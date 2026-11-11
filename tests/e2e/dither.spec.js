// Dithering, under Color palette: its fields show only with a palette, and turning it up changes the art.
import { test, expect, openApp, pickLayer, settled, store } from './support.js';

const panel = (page) => page.locator('aside.control-panel');
const cells = (page) => store(page, 'project', (p) => p.cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}`).join());

test('the dither fields show with a palette, and the slider breaks up its bands', async ({ page }) => {
  await openApp(page);
  await pickLayer(page, 'Base'); // the picture's Dither is its layer's
  const style = panel(page).getByLabel('Dither style', { exact: true });
  const dither = panel(page).getByRole('slider', { name: 'Dither' });
  await expect(style).toHaveCount(0);
  await expect(dither).toHaveCount(0);

  await panel(page).locator('#quantize').selectOption('cga');
  await settled(page);
  await expect(style).toHaveValue('floyd');
  await expect(dither).toHaveValue('0');
  const banded = await cells(page);

  await dither.fill('100');
  await expect.poll(() => cells(page)).not.toBe(banded);
  await settled(page);
  const floyd = await cells(page);
  await style.selectOption('bayer');
  await expect.poll(() => cells(page)).not.toBe(floyd);

  await panel(page).locator('#quantize').selectOption('none');
  await expect(style).toHaveCount(0);
});
