// The toolbar's tools, in order, with a divider ('|') between groups: drawing, selecting, moving
// around (Zoom: PIXEL view only), then the cell tools (ANSI view only).
import { test, expect, openApp, tab, settled } from './support.js';

const row = (page) => page.locator('.tool-group > *').evaluateAll((els) => els.map((el) => el.dataset.tool ?? '|'));

test('the Magic Wand and Select sit together, between the picker and the Hand, in both views', async ({ page }) => {
  await openApp(page);
  expect(await row(page)).toEqual(['pencil', 'brush', 'eraser', 'bucket', 'shapes', 'picker', '|', 'wand', 'select', '|', 'hand', '|', 'text', 'flip']);
  await tab(page, 'PIXEL').click();
  await settled(page);
  expect(await row(page)).toEqual(['pencil', 'brush', 'eraser', 'bucket', 'shapes', 'picker', '|', 'wand', 'select', '|', 'hand', 'zoom']);
});
