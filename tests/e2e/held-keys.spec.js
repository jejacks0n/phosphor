import { test, expect } from '@playwright/test';
import { openApp, store, cellPoint, editAt, chars } from './support.js';

// Held keys: Alt (Option) swaps a drawing tool for the color picker, Alt+Shift picks the background,
// Space pans with any tool; the ANSI status bar says so.
const ws = (page, read) => store(page, 'workspace', read);
const hint = (page) => page.locator('.ansi-status .hint');
const scroller = (page) => page.locator('.ansi-editor > article');
const colorAt = (page, col, row) => store(page, 'project', `(p) => p.rawColorAt(${col}, ${2 * row})`);

test('Alt picks the foreground and Alt+Shift the background, from Pencil and Shapes; letting go brings the tool back', async ({ page }) => {
  await openApp(page);
  for (const tool of ['Pencil (1px)', 'Shapes']) {
    await page.getByRole('button', { name: tool }).click();
    await expect(hint(page)).toContainText('pick color');
    const id = await ws(page, (w) => w.activeTool);

    const at = await cellPoint(page, 10, 3, 0);
    await page.keyboard.down('Alt');
    await expect(hint(page)).toHaveText(/Picking the foreground color/);
    await page.mouse.click(at.x, at.y);
    expect(await ws(page, (w) => w.editFgColor)).toBe(await colorAt(page, 10, 3));

    const bgAt = await cellPoint(page, 60, 20, 0);
    await page.keyboard.down('Shift');
    await expect(hint(page)).toHaveText('Picking the background color');
    await page.mouse.click(bgAt.x, bgAt.y);
    await page.keyboard.up('Shift');
    await page.keyboard.up('Alt');
    expect(await ws(page, (w) => [w.editBgNone, w.editBgColor])).toEqual([false, await colorAt(page, 60, 20)]);
    expect(await ws(page, (w) => w.editFgColor)).toBe(await colorAt(page, 10, 3));

    expect(await ws(page, (w) => w.activeTool)).toBe(id);
    expect(await store(page, 'project', (p) => p.hasEdits)).toBe(false); // nothing was drawn
  }
});

test('letting go of Alt mid-drag doesn\'t turn the pick into a stroke', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Pencil (1px)' }).click();
  const from = await cellPoint(page, 5, 5), to = await cellPoint(page, 25, 5);
  await page.keyboard.down('Alt');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.keyboard.up('Alt');
  await page.mouse.move(to.x, to.y, { steps: 6 });
  expect(await ws(page, (w) => w.activeTool)).toBe('picker'); // until the drag ends
  await page.mouse.up();
  expect(await ws(page, (w) => w.activeTool)).toBe('pencil');
  expect(await store(page, 'project', (p) => p.hasEdits)).toBe(false);
});

test('Space pans with any tool, keeps a selection, and never paints', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Brush (soft)' }).click();
  await expect(hint(page)).toContainText('Space pan');
  const from = await cellPoint(page, 30, 20);
  await page.mouse.move(from.x, from.y);
  const top = await scroller(page).evaluate((el) => el.scrollTop);
  await page.keyboard.down('Space');
  await expect(hint(page)).toHaveText('Panning');
  // The hand is drawn at the pointer, not the system cursor (Safari hides that on each key repeat).
  await page.mouse.move(from.x + 1, from.y);
  await expect(page.locator('div.held-hand')).toBeVisible();
  expect(await page.evaluate(([x, y]) => getComputedStyle(document.elementFromPoint(x, y)).cursor, [from.x + 1, from.y])).toBe('none');
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 120, { steps: 6 });
  await expect(page.locator('div.held-hand.grabbing')).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up('Space');
  await expect(page.locator('div.held-hand')).toHaveCount(0);
  expect(await scroller(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(top);
  expect(await ws(page, (w) => w.activeTool)).toBe('brush');
  expect(await store(page, 'project', (p) => p.hasEdits)).toBe(false);

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.keyboard.press('ControlOrMeta+a');
  const selection = await ws(page, (w) => w.selection);
  await page.mouse.move(from.x, from.y); // over the canvas (the Select button still has focus)
  await page.keyboard.down('Space');
  expect(await ws(page, (w) => w.activeTool)).toBe('hand');
  await page.keyboard.up('Space');
  expect(await ws(page, (w) => [w.activeTool, w.selection])).toEqual(['select', selection]);
});

test('Space still types: in Edit Mode, and in a text field', async ({ page }) => {
  await openApp(page);
  await editAt(page, 3, 3);
  await page.keyboard.type('a b');
  expect(await chars(page, 3, 3, 5)).toBe('a b');
  expect(await ws(page, (w) => w.activeTool)).toBe('text');
  await page.getByRole('textbox', { name: 'Character Seed' }).fill('');
  await page.getByRole('textbox', { name: 'Character Seed' }).type('two words');
  await expect(page.getByRole('textbox', { name: 'Character Seed' })).toHaveValue('two words');
});

test('with a button focused and the pointer over the canvas, Space pans and doesn\'t press the button', async ({ page }) => {
  await openApp(page);
  const lock = page.getByRole('button', { name: 'Lock Aspect Ratio' });
  const pressed = await lock.getAttribute('aria-pressed');
  await lock.focus();
  const at = await cellPoint(page, 30, 20);
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down('Space');
  expect(await ws(page, (w) => w.activeTool)).toBe('hand');
  await page.keyboard.up('Space');
  await expect(lock).toHaveAttribute('aria-pressed', pressed);

  // Away from the canvas, Space presses the focused button as usual.
  await page.mouse.move(5, 5);
  await lock.focus();
  await page.keyboard.press('Space');
  await expect(lock).not.toHaveAttribute('aria-pressed', pressed);
});
