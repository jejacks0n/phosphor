// Recoloring a selection through the toolbar: Set FG and Set BG in the ANSI view (no Set BG in the
// ASCII styles), Fill in the pixel view, for the Magic Wand's selection and the Select tool's.
import { test, expect, openApp, store, cellPoint, pixelPoint, drag, tab, settled } from './support.js';

const base = (page, x, y) => store(page, 'project', `(p) => p.baseColorAt(${x}, ${y})`);

test("the wand's Set BG and Set FG recolor the cells it selected; Select's do the rectangle", async ({ page }) => {
  await openApp(page);
  await store(page, 'workspace', (w) => { w.editFgColor = '#ff00ff'; w.editBgColor = '#008080'; });
  await page.keyboard.press('w');
  await expect(page.getByRole('button', { name: 'Set BG', exact: true })).toHaveCount(0); // nothing selected yet
  const at = await cellPoint(page, 4, 4);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByRole('button', { name: 'Set BG', exact: true })).toBeDisabled(); // BG is None to begin with
  await store(page, 'workspace', (w) => { w.editBgNone = false; });
  await page.getByRole('button', { name: 'Set BG', exact: true }).click();
  await page.getByRole('button', { name: 'Set FG', exact: true }).click();
  expect([await base(page, 4, 8), await base(page, 4, 9)]).toEqual(['#008080', '#ff00ff']);

  await page.keyboard.press('m');
  await drag(page, await cellPoint(page, 10, 2), await cellPoint(page, 11, 2));
  await page.getByRole('button', { name: 'Set FG', exact: true }).click();
  expect([await base(page, 10, 5), await base(page, 11, 5)]).toEqual(['#ff00ff', '#ff00ff']);

  await store(page, 'project', (p) => { p.renderStyle = 'colorAscii'; });
  await expect(page.getByRole('button', { name: 'Set BG', exact: true })).toHaveCount(0);
});

test('in the PIXEL view, Fill paints the pixels selected your foreground color', async ({ page }) => {
  await openApp(page);
  await store(page, 'workspace', (w) => { w.editFgColor = '#ff00ff'; });
  await tab(page, 'PIXEL').click();
  await settled(page);
  await page.keyboard.press('w');
  const at = await pixelPoint(page, 6, 6);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByRole('button', { name: 'Set FG', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Fill', exact: true }).click();
  expect(await base(page, 6, 6)).toBe('#ff00ff');
});

test('Enter on a focused Set FG presses it and keeps the selection', async ({ page }) => {
  await openApp(page);
  await store(page, 'workspace', (w) => { w.editFgColor = '#ff00ff'; });
  const at = await cellPoint(page, 4, 4);
  await page.mouse.move(at.x, at.y);
  await page.keyboard.press('t');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  const setFg = page.getByRole('button', { name: 'Set FG', exact: true });
  await setFg.focus(); // where Shift+Tab lands depends on the page's tab order, which other tests own
  await expect(setFg).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await store(page, 'workspace', (w) => w.selection !== null)).toBe(true);
  expect(await base(page, 4, 8)).toBe('#ff00ff');
});
