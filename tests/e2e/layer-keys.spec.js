import { test, expect } from './support.js';
import { openApp, store, chars, editAt } from './support.js';

// The layer keys on the page, with Edit Mode's cursor placed: a LAYERS row reached with Tab walks with ↓ (the view
// doesn't take the key, nor typing), and Option+] (Alt+]), matched by its code, picks the layer above without typing
// Option's ‘.
async function twoLayersTyping(page) {
  await openApp(page);
  const expand = page.getByRole('button', { name: 'Expand panel' });
  if (await expand.isVisible()) await expand.click();
  const panel = page.locator('.side-panel');
  await panel.getByRole('tab', { name: 'Layers' }).click();
  await panel.getByRole('button', { name: 'Add layer', exact: true }).click(); // Layer 2, over Layer 1, picked
  await editAt(page, 2, 2);
  return panel;
}
const picked = (page) => store(page, 'workspace', (w) => w.pickedLayer);
const cursor = (page) => store(page, 'workspace', (w) => w.textCursor);

test('with the cursor placed, Tab to a layer row and ↓: the next row is picked and the text cursor stays', async ({ page }) => {
  const panel = await twoLayersTyping(page);
  const rows = panel.locator('li button.pick');
  await expect(rows).toHaveCount(3);
  const top = await store(page, 'project', (p) => p.layers[2].id);
  expect(await picked(page)).toBe(top);
  let onRow = false;
  for (let i = 0; i < 120 && !onRow; i++) {
    await page.keyboard.press('Tab');
    onRow = await page.evaluate(() => !!document.activeElement?.matches('.side-panel li button.pick'));
  }
  expect(onRow).toBe(true);
  await expect(rows.nth(0)).toBeFocused(); // the top row, first in the list
  await page.keyboard.press('ArrowDown');
  expect(await picked(page)).toBe('edit');
  await expect(rows.nth(1)).toBeFocused();
  expect(await cursor(page)).toEqual({ col: 2, row: 2 });
  await page.keyboard.press('ArrowDown');
  expect(await picked(page)).toBe('base');
  await expect(rows.nth(2)).toBeFocused();
  expect(await cursor(page)).toEqual({ col: 2, row: 2 });
});

test('with the cursor placed, Option+] (Alt+], by its code) picks the layer above and types no ‘', async ({ page }) => {
  await twoLayersTyping(page);
  const top = await store(page, 'project', (p) => p.layers[2].id);
  await store(page, 'workspace', (w) => { w.pickLayer('edit'); });
  const before = await chars(page, 2, 0, 6);
  await page.evaluate(() => addEventListener('keydown', (e) => { // after the app's own
    if (e.code === 'BracketRight') window.bracketTaken = e.defaultPrevented;
  }));
  // A key that carries the Mac's Option character as its text, as a real Option+] does: typed unless it's taken.
  const cdp = await page.context().newCDPSession(page);
  const key = { modifiers: 1, key: '‘', code: 'BracketRight', windowsVirtualKeyCode: 221 };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: '‘', ...key });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
  expect(await page.evaluate(() => window.bracketTaken)).toBe(true);
  expect(await picked(page)).toBe(top);
  expect(await chars(page, 2, 0, 6)).toBe(before);
  expect(await cursor(page)).toEqual({ col: 2, row: 2 });
});
