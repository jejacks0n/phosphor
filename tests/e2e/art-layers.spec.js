// Art layers: making one from a selection, dragging it on VECTOR, and stepping into it to draw.
import { test, expect, openApp, store, tab, settled, cellPoint, drag, chars } from './support.js';

// HI typed at (5, 5) in Edit Mode and made an art layer, VECTOR showing it selected.
async function makeHi(page) {
  await openApp(page);
  await page.getByRole('button', { name: 'Edit Mode' }).click();
  const at = await cellPoint(page, 5, 5);
  await page.mouse.click(at.x, at.y);
  await page.getByRole('textbox', { name: 'Type into the canvas' }).waitFor();
  await page.keyboard.type('HI');
  await expect.poll(() => chars(page, 5, 5, 6)).toBe('HI');
  await page.getByRole('button', { name: 'Edit Mode' }).click();
  await page.keyboard.press('m');
  await drag(page, await cellPoint(page, 4, 4), await cellPoint(page, 8, 6));
  await page.locator('.primary-row').getByRole('button', { name: 'Make art layer' }).click();
  await expect(tab(page, 'VECTOR')).toHaveAttribute('aria-selected', 'true');
  await settled(page);
  expect(await store(page, 'workspace', (w) => w.vectorSelected.length)).toBe(1);
  expect(await chars(page, 5, 5, 6)).toBe('HI');
}

const inside = (page) => store(page, 'project', (p) => p.artInside !== null);
const editing = (page) => page.getByText('Editing art layer', { exact: true });

test('Make art layer turns a selection into a layer that VECTOR drags by whole cells', async ({ page }) => {
  await makeHi(page);
  await page.keyboard.press('v');
  await drag(page, await cellPoint(page, 5, 5), await cellPoint(page, 8, 5));
  await settled(page);
  await expect.poll(() => chars(page, 5, 8, 9)).toBe('HI');
  await expect.poll(() => chars(page, 5, 5, 7)).not.toContain('H');
});

test('a double-click on an art layer steps in: the drawing tools draw into it, the rest dims, and Done steps out', async ({ page }) => {
  await makeHi(page);
  await page.keyboard.press('v');
  const at = await cellPoint(page, 5, 5);
  await page.mouse.dblclick(at.x, at.y);
  await expect(tab(page, 'ANSI')).toHaveAttribute('aria-selected', 'true');
  await expect(editing(page)).toBeVisible();
  expect(await inside(page)).toBe(true);

  await page.getByRole('button', { name: 'Edit Mode' }).click();
  const next = await cellPoint(page, 7, 5);
  await page.mouse.click(next.x, next.y);
  await page.getByRole('textbox', { name: 'Type into the canvas' }).waitFor();
  await page.keyboard.type('!');
  await expect.poll(() => chars(page, 5, 5, 7)).toBe('HI!');

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(tab(page, 'VECTOR')).toHaveAttribute('aria-selected', 'true');
  await expect(editing(page)).toHaveCount(0);
  expect(await inside(page)).toBe(false);
  expect(await store(page, 'workspace', (w) => w.vectorSelected.length)).toBe(1);

  await page.keyboard.press('v');
  await drag(page, await cellPoint(page, 5, 5), await cellPoint(page, 7, 5));
  await settled(page);
  await expect.poll(() => chars(page, 5, 7, 9)).toBe('HI!');
  await expect.poll(() => chars(page, 5, 5, 6)).not.toContain('H');
});

test('Escape steps out, and Edit art steps in', async ({ page }) => {
  await makeHi(page);
  await page.keyboard.press('v');
  await page.getByRole('button', { name: 'Edit art' }).click();
  await expect(tab(page, 'ANSI')).toHaveAttribute('aria-selected', 'true');
  await expect(editing(page)).toBeVisible();
  expect(await inside(page)).toBe(true);

  await page.keyboard.press('Escape');
  await expect(tab(page, 'VECTOR')).toHaveAttribute('aria-selected', 'true');
  await expect(editing(page)).toHaveCount(0);
  expect(await inside(page)).toBe(false);
  expect(await store(page, 'workspace', (w) => w.vectorSelected.length)).toBe(1);
});

test('the frame controls and the sliders are off while inside', async ({ page }) => {
  await makeHi(page);
  await page.getByRole('switch', { name: 'Animate' }).check();
  await page.keyboard.press('v');
  await page.getByRole('button', { name: 'Edit art' }).click();
  await expect(editing(page)).toBeVisible();
  const bar = page.getByRole('toolbar', { name: 'Animation' });
  await expect(bar.getByRole('button', { name: 'Add frame' })).toBeDisabled();
  await expect(bar.getByRole('slider', { name: 'Frame' })).toBeDisabled();
  await expect(page.getByRole('slider', { name: 'Brightness' })).toBeDisabled();
  await page.keyboard.press('n');
  await expect.poll(() => store(page, 'project', (p) => p.frames.length)).toBe(1);
  expect(await inside(page)).toBe(true);

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(bar.getByRole('button', { name: 'Add frame' })).toBeEnabled();
});
