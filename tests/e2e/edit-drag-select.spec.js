import { test, expect } from './support.js';
import { openApp, store, cellPoint, drag } from './support.js';

test('a drag in Edit Mode becomes a Select selection', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Edit Mode' }).click();
  await drag(page, await cellPoint(page, 3, 3), await cellPoint(page, 8, 6));
  expect(await store(page, 'workspace', (w) => w.activeTool)).toBe('select');
  expect(await store(page, 'workspace', (w) => w.selection)).toEqual({ c0: 3, r0: 3, c1: 8, r1: 6 });
});

test('Shift and the arrow keys in Edit Mode select from the cursor, and the arrows alone then nudge', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Edit Mode' }).click();
  const at = await cellPoint(page, 3, 3);
  await page.mouse.click(at.x, at.y); // the cursor
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown']) await page.keyboard.press(`Shift+${k}`);
  expect(await store(page, 'workspace', (w) => w.activeTool)).toBe('select');
  expect(await store(page, 'workspace', (w) => w.selection)).toEqual({ c0: 3, r0: 3, c1: 5, r1: 4 });
  await page.keyboard.press('ArrowRight');
  expect(await store(page, 'workspace', (w) => w.selection)).toEqual({ c0: 4, r0: 3, c1: 6, r1: 4 });
});

test('T after nudging a Shift selection goes back to Edit Mode without typing a T', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Edit Mode' }).click();
  const at = await cellPoint(page, 3, 3);
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('t');
  expect(await store(page, 'workspace', (w) => w.activeTool)).toBe('text');
  expect(await store(page, 'project', (p) => [...p.editCells.values()].map((e) => e.char).filter(Boolean))).not.toContain('t');
});

test('Edit Mode chosen before any click types at the top-left', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Edit Mode' }).click();
  await page.keyboard.type('a');
  expect(await store(page, 'project', (p) => p.editCells.get('0,0')?.char)).toBe('a');
});

test('Escape after a drag from Edit Mode sets the selection down and goes back to typing', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Edit Mode' }).click();
  await drag(page, await cellPoint(page, 3, 3), await cellPoint(page, 8, 6));
  await page.keyboard.press('Escape');
  expect(await store(page, 'workspace', (w) => [w.activeTool, w.selection, w.textCursor])).toEqual(['text', null, { col: 3, row: 3 }]);
  await page.keyboard.type('a');
  expect(await store(page, 'project', (p) => p.editCells.get('3,3')?.char)).toBe('a');
});
