// Tool keys: a letter chooses a tool (Photoshop's letters, Moebius's where it has the same tool), not
// while typing; with a selection, Moebius's block keys act on it: E erases, S or C stamps, Enter
// sets it down. Each tool's button shows its key.
import { test, expect } from './support.js';
import { openApp, store, cellPoint, drag, editAt, chars, tab, settled } from './support.js';

const tool = (page) => store(page, 'workspace', (w) => w.activeTool);

test('letters choose the tools the view offers, and the buttons say which', async ({ page }) => {
  await openApp(page);
  for (const [key, id] of [['p', 'pencil'], ['b', 'brush'], ['e', 'eraser'], ['g', 'bucket'], ['u', 'shapes'], ['i', 'picker'], ['h', 'hand'], ['f', 'flip'], ['m', 'select'], ['t', 'text'], ['h', 'hand'], ['k', 'text']]) {
    await page.keyboard.press(key);
    expect(await tool(page), key).toBe(id);
  }
  await expect(page.getByRole('button', { name: 'Pencil (1px)' })).toHaveAttribute('title', 'Pencil (1px) · P');
  await expect(page.getByRole('button', { name: 'Edit Mode' })).toHaveAttribute('aria-keyshortcuts', 'T K');

  await tab(page, 'PIXEL').click();
  await settled(page);
  await page.keyboard.press('z');
  expect(await tool(page)).toBe('zoom'); // on PIXEL as on ANSI
  await page.keyboard.press('p');
  expect(await tool(page)).toBe('pencil');
  await page.keyboard.press('t'); // Edit Mode is the ANSI view's
  expect(await tool(page)).toBe('pencil');
});

test('in Edit Mode letters type; Escape puts the cursor away and they choose tools again; a text field keeps them', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  await page.keyboard.type('pb');
  await expect.poll(() => chars(page, 2, 2, 3)).toBe('pb');
  expect(await tool(page)).toBe('text');
  await page.keyboard.press('Escape');
  expect(await store(page, 'workspace', (w) => w.textCursor)).toBe(null);
  await page.keyboard.press('p');
  expect(await tool(page)).toBe('pencil');

  const seed = page.getByRole('textbox', { name: 'Character Seed' });
  await seed.fill('');
  await seed.press('b');
  await expect(seed).toHaveValue('b');
  expect(await tool(page)).toBe('pencil');
});

test('with a selection: S stamps and the block moves on, E erases, Enter sets it down', async ({ page }) => {
  await openApp(page);
  await editAt(page, 5, 5);
  await page.keyboard.type('A');
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  await drag(page, await cellPoint(page, 5, 5), await cellPoint(page, 6, 5));
  expect(await store(page, 'workspace', (w) => w.selection)).toEqual({ c0: 5, r0: 5, c1: 6, r1: 5 });
  await page.keyboard.press('s');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(() => chars(page, 5, 5, 8)).toMatch(/^A..A$/);
  expect(await store(page, 'workspace', (w) => w.selection)).toEqual({ c0: 8, r0: 5, c1: 9, r1: 5 });

  await page.keyboard.press('e');
  await expect.poll(() => chars(page, 5, 8, 8)).not.toBe('A');
  expect(await chars(page, 5, 5, 5)).toBe('A');
  expect(await tool(page)).toBe('select'); // E acted on the selection, not the Eraser

  await page.keyboard.press('Enter');
  expect(await store(page, 'workspace', (w) => w.selection)).toBe(null);
});

test('C stamps too, as in Moebius: the copy stays and the block floats on', async ({ page }) => {
  await openApp(page);
  await editAt(page, 5, 5);
  await page.keyboard.type('A');
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  await drag(page, await cellPoint(page, 5, 5), await cellPoint(page, 6, 5));
  await page.keyboard.press('c');
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => chars(page, 6, 5, 5)).toBe('A');
  expect(await chars(page, 5, 5, 5)).toBe('A');
});

test("the Pencil's Single draws lines of box characters: drag across, then down, and it turns the corner", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'Normal mode' }).click();
  await page.getByRole('button', { name: 'Single' }).click();
  await expect(page.getByRole('checkbox', { name: 'Connect' })).toBeChecked();
  const a = await cellPoint(page, 4, 3), b = await cellPoint(page, 12, 3), c = await cellPoint(page, 12, 7);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.mouse.up();
  expect(await chars(page, 3, 4, 12)).toBe('────────┐');
  expect(await chars(page, 7, 12, 12)).toBe('│');
});
