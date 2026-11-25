import { test, expect } from './support.js';
import { openApp, editAt, chars } from './support.js';

// The command list's key on the runner: Cmd+K on a Mac, Ctrl+K on Windows and Linux (Chrome's and Firefox's search box
// there), taken from the browser.
const MOD_K = process.platform === 'darwin' ? 'Meta+K' : 'Control+K';
const list = (page) => page.getByRole('dialog', { name: 'Commands' });
const typingFocused = (page) => page.evaluate(() => document.activeElement?.dataset?.textInput !== undefined);

test('Cmd+K (Ctrl+K) opens the list over the browser\'s own; exp ans and Enter opens Export on .ans, exp png on .png', async ({ page }) => {
  await openApp(page);
  // The page's own listener, after the app's, in place before the key is pressed: left to run beside the press, it could
  // be added after the key had gone by and never hear it.
  await page.evaluate(() => {
    window.pressedK = new Promise((resolve) => {
      addEventListener('keydown', (e) => { if (e.code === 'KeyK') resolve(e.defaultPrevented); });
    });
  });
  await page.keyboard.press(MOD_K);
  expect(await page.evaluate(() => window.pressedK)).toBe(true);
  await expect(list(page)).toBeVisible();
  await expect(list(page).getByRole('combobox')).toBeFocused();
  await page.keyboard.type('exp ans');
  await page.keyboard.press('Enter');
  await expect(list(page)).toBeHidden();
  const exporting = page.getByRole('dialog', { name: 'Export' });
  await expect(exporting.locator('.format-btn.selected .format-ext')).toHaveText('.ans');
  await page.keyboard.press('Escape');
  await expect(exporting).toBeHidden();

  await page.keyboard.press(MOD_K);
  await page.keyboard.type('exp png');
  await page.keyboard.press('Enter');
  await expect(exporting.locator('.format-btn.selected .format-ext')).toHaveText('.png');
});

test('in Edit Mode, Escape closes the list and hands focus back to the art, where typing goes on', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  await page.keyboard.type('a');
  await page.keyboard.press(MOD_K);
  await expect(list(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list(page)).toBeHidden();
  await expect.poll(() => typingFocused(page)).toBe(true);
  await page.keyboard.type('b');
  await expect.poll(() => chars(page, 2, 2, 3)).toBe('ab');
});

test('with a dialog open, Cmd+K (Ctrl+K) opens nothing', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('?');
  const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(shortcuts).toBeVisible();
  await page.keyboard.press(MOD_K);
  await expect(list(page)).toBeHidden();
  await expect(shortcuts).toBeVisible();
});

// Rename and Dimensions hand focus on: the list gives it back to the art as it goes, and the row's box or the field must
// still have it after, taking what's typed.
test('from Edit Mode, Layer: Rename puts the picked row\'s name box in focus, and Dimensions the size field', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  await page.keyboard.press(MOD_K);
  await page.keyboard.type('layer rename');
  await page.keyboard.press('Enter');
  await expect(list(page)).toBeHidden();
  const box = page.getByRole('textbox', { name: /^Rename / });
  await expect(box).toBeFocused();
  await page.keyboard.type('Ink');
  await page.keyboard.press('Enter');
  await expect(page.locator('.layers-list li.picked .name')).toHaveText('Ink');

  await page.keyboard.press(MOD_K);
  await page.keyboard.type('dimensions');
  await page.keyboard.press('Enter');
  await expect(page.locator('#cols')).toBeFocused();
});

test.describe('New from clipboard', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('a copied selection becomes a new drawing its size, from the command list, with the real clipboard read, once unsaved work is answered for', async ({ page }) => {
    await openApp(page);
    await editAt(page, 1, 1);
    await page.keyboard.insertText('Hi');
    await page.keyboard.press('Escape');
    const store = (name, read) => page.evaluate(([name, source]) => new Function('s', `return (${source})(s)`)(document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia._s.get(name)), [name, read.toString()]);
    await store('workspace', (w) => w.selectAll({ c0: 0, r0: 0, c1: 9, r1: 4 })); // 10 × 5 cells, with the Select tool
    await page.keyboard.press('ControlOrMeta+c');
    await page.keyboard.press(MOD_K);
    await page.keyboard.type('new from clip');
    await expect(list(page).getByRole('option').first()).toContainText('New from clipboard');
    await page.keyboard.press('Enter');
    // The drawing has the typing unsaved: asked first, as New project asks, and nothing opens until the answer.
    const asked = page.getByRole('dialog', { name: 'Start a new project?' });
    await expect(asked).toBeVisible();
    expect(await store('project', (p) => [p.cols, p.rows])).toEqual([80, 80]);
    await asked.getByRole('button', { name: /^Start without saving/ }).click();
    await expect.poll(() => store('project', (p) => [p.cols, p.rows])).toEqual([10, 10]);
    await expect.poll(() => chars(page, 1, 1, 2)).toBe('Hi');
    expect(await store('project', (p) => p.layers.map((layer) => layer.id))).toEqual(['base', 'edit']);
  });

  test('from the start screen, another tab\'s copy opens: a selection on ANSI at its size, shapes on VECTOR at their bounds', async ({ page }) => {
    const read = (at, name, fn) => at.evaluate(([name, source]) => new Function('s', `return (${source})(s)`)(document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia._s.get(name)), [name, fn.toString()]);
    const fromStart = async () => {
      const other = await page.context().newPage();
      await other.goto('/');
      await expect(other.getByRole('button', { name: 'Start with a blank canvas' })).toBeVisible(); // nothing open
      await other.bringToFront();
      await other.keyboard.press(MOD_K);
      await other.keyboard.type('new from clip');
      await other.keyboard.press('Enter');
      return other;
    };
    await openApp(page);
    await read(page, 'workspace', (w) => w.selectAll({ c0: 0, r0: 0, c1: 11, r1: 3 })); // 12 × 4 cells
    await page.keyboard.press('ControlOrMeta+c');
    const block = await fromStart();
    await expect.poll(() => read(block, 'project', (p) => p.image && [p.cols, p.rows])).toEqual([12, 8]);
    await expect(block.getByRole('tab', { name: 'ANSI', exact: true })).toHaveAttribute('aria-selected', 'true');

    await page.bringToFront();
    await read(page, 'workspace', (w) => { w.editorTab = 'vector'; });
    await read(page, 'project', (p) => p.addShape({ z: 0, closed: true, fill: '#ff0000', stroke: null, width: 1, m: [1, 0, 0, 1, 0, 0], points: [[10, 10, 0, 0, 0, 0, 0], [30, 10, 0, 0, 0, 0, 0], [30, 24, 0, 0, 0, 0, 0], [10, 24, 0, 0, 0, 0, 0]] }));
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+c');
    const shapes = await fromStart();
    await expect.poll(() => read(shapes, 'project', (p) => p.image && [p.cols, p.rows, p.shapes.size])).toEqual([20, 14, 1]);
    await expect(shapes.getByRole('tab', { name: 'VECTOR', exact: true })).toHaveAttribute('aria-selected', 'true');
  });
});
