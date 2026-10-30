// A selection made with Select stays as you change tools; Deselect (on every tool's options row) or
// Escape drops it.
import { test, expect, openApp, store, cellPoint, pixelPoint, tab, settled, drag, chars, editAt } from './support.js';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const selection = (page) => store(page, 'workspace', (w) => w.selection);

test('a selection made with Select stays with the Brush, and Deselect or Escape drops it', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('m');
  await drag(page, await cellPoint(page, 5, 5), await cellPoint(page, 9, 7));
  await page.keyboard.press('b');
  expect(await selection(page)).toEqual({ c0: 5, r0: 5, c1: 9, r1: 7 });
  await page.getByRole('button', { name: 'Deselect' }).click();
  expect(await selection(page)).toBe(null);

  await page.keyboard.press('m');
  await drag(page, await cellPoint(page, 5, 5), await cellPoint(page, 9, 7));
  await page.keyboard.press('b');
  await page.keyboard.press('Escape');
  expect(await selection(page)).toBe(null);
});

test('in Edit Mode, a drag that starts inside a kept selection selects, rather than moving it', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('m');
  await drag(page, await cellPoint(page, 5, 5), await cellPoint(page, 9, 7));
  await page.keyboard.press('t');
  await drag(page, await cellPoint(page, 6, 6), await cellPoint(page, 12, 6));
  expect(await selection(page)).toEqual({ c0: 6, r0: 6, c1: 12, r1: 6 });
});

test('in Edit Mode, a pasted block lands at the cursor, not at a kept selection', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  await page.keyboard.type('Copy me');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await drag(page, await cellPoint(page, 2, 2), await cellPoint(page, 8, 3));
  await page.keyboard.press('ControlOrMeta+c');
  await editAt(page, 20, 10);
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => chars(page, 10, 20, 26)).toBe('Copy me');
});

// The rectangle's line is the Magic Wand's: one still pixel, white dashes over black, inside the box.
const line = (page, marquee) => page.locator(marquee).evaluate((el) => {
  const s = getComputedStyle(el);
  return { border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`, dashes: `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor} ${s.outlineOffset}`, shadow: s.boxShadow, animation: s.animationName };
});
const WAND_LINE = { border: '1px solid rgb(0, 0, 0)', dashes: '1px dashed rgb(255, 255, 255) -1px', shadow: 'none', animation: 'none' };

test('the Select rectangle is drawn with the Magic Wand\'s line, in both views', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('m');
  await drag(page, await cellPoint(page, 3, 3), await cellPoint(page, 8, 6));
  expect(await line(page, '.marquee')).toEqual(WAND_LINE);

  await tab(page, 'PIXEL').click();
  await settled(page);
  await page.keyboard.press('m');
  await drag(page, await pixelPoint(page, 5, 10), await pixelPoint(page, 9, 15));
  expect(await line(page, '.pixel-marquee')).toEqual(WAND_LINE);
});
