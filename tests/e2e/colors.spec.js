import { readFile } from 'node:fs/promises';
import { test, expect, openApp, store, settled } from './support.js';

// The color layer's Palettes page where only the whole page can go wrong: Get from Lospec under the built page's
// Content-Security-Policy, which the harness fails a test on refusing. Lospec is answered here; no test reaches it.

const shipped = JSON.parse(await readFile(new URL('../../src/lib/colorPalettes.json', import.meta.url), 'utf8'));
const SWEETIE = shipped.find((p) => p.slug === 'sweetie-16').colors;

test('Search Lospec works under the built page\'s policy: the palette is kept, used, and the picture recolors', async ({ page }) => {
  const asked = [];
  await page.route('https://lospec.com/palette-list/sweetie-16.json', (route) => {
    asked.push(route.request().url());
    return route.fulfill({
      json: { name: 'Sweetie 16', author: '', colors: SWEETIE.map((c) => c.slice(1)) },
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  await openApp(page);
  await page.getByRole('button', { name: 'Manage color palettes' }).click();
  const layer = page.locator('.color-layer');
  await layer.getByRole('textbox', { name: "A palette's name or id" }).fill('https://lospec.com/palette-list/sweetie-16');
  await layer.getByRole('button', { name: 'Search Lospec' }).click();

  await expect(layer.locator('div.edit-side span.title')).toHaveText('Sweetie 16'); // kept and chosen
  await expect(layer.locator('div.row.current div.name > span').first()).toHaveText('Sweetie 16');
  await layer.getByRole('button', { name: 'Use this palette' }).click();
  await expect.poll(() => store(page, 'project', (p) => p.palette)).toBe(SWEETIE.join(' '));
  expect(asked).toEqual(['https://lospec.com/palette-list/sweetie-16.json']);

  await settled(page);
  const shown = await store(page, 'project', (p) => [...new Set(p.cells.flatMap((c) => [c.fg.hex, c.bg.hex]))]);
  for (const hex of shown) expect(SWEETIE).toContain(hex);
});
