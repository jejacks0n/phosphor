// The SOCIAL tab: a fourth editor tab, desktop only, where the editor's shortcuts are off.
import { test, expect } from '@playwright/test';
import { openApp, tab, store, cellPoint, drag, imageInput } from './support.js';
import { fakeServer } from './social-support.js';

test('the SOCIAL tab is there before any image, and opens the lobby', async ({ page }) => {
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(tab(page, 'SOCIAL')).toBeEnabled();
  await tab(page, 'SOCIAL').click();
  await expect(tab(page, 'SOCIAL')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.social-tab [data-page="lobby"]')).toBeVisible();
  await expect(imageInput(page)).toHaveCount(0); // no start screen
  await expect.poll(() => server.lobby.received.map((m) => m.type)).toEqual(['hello']);
  expect(await store(page, 'social', (s) => s.lobbyStatus)).toBe('live');
});

test('the tablist\'s arrow keys reach SOCIAL', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/');
  await tab(page, 'PIXEL').focus();
  await page.keyboard.press('ArrowRight'); // ANSI and SAUCE wait for an image
  await expect(tab(page, 'SOCIAL')).toBeFocused();
  await expect(tab(page, 'SOCIAL')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight'); // wraps
  await expect(tab(page, 'PIXEL')).toHaveAttribute('aria-selected', 'true');
});

test('narrow screens have no SOCIAL tab; narrowing while on it lands on PIXEL', async ({ page }) => {
  await fakeServer(page);
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/');
  await expect(tab(page, 'PIXEL')).toBeVisible();
  await expect(tab(page, 'SOCIAL')).toHaveCount(0);

  await page.setViewportSize({ width: 1400, height: 900 });
  await tab(page, 'SOCIAL').click();
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(tab(page, 'SOCIAL')).toHaveCount(0);
  await expect(tab(page, 'PIXEL')).toHaveAttribute('aria-selected', 'true');
  expect(await store(page, 'workspace', (w) => w.editorTab)).toBe('input');
});

// Review focus 5: typing in a SOCIAL field (a username, a password) never reaches the art behind the tab.
test('on the SOCIAL tab, letters, Space and Ctrl+Z leave the art and its tools alone', async ({ page }) => {
  await fakeServer(page);
  await openApp(page);
  await page.getByRole('button', { name: 'Pencil (1px)' }).click();
  await drag(page, await cellPoint(page, 4, 5, 0), await cellPoint(page, 14, 5, 0));
  await drag(page, await cellPoint(page, 4, 8, 0), await cellPoint(page, 14, 8, 0));
  await page.keyboard.press('ControlOrMeta+z'); // the second stroke, undone here: something to redo
  const snapshot = () => store(page, 'project', (p) => JSON.stringify(p.cells));
  let cells; // the undo's cells catch up a moment later: wait until they hold still
  await expect.poll(async () => cells === (cells = await snapshot())).toBe(true);

  await tab(page, 'SOCIAL').click();
  await page.locator('.social-tab').evaluate((el) => el.prepend(Object.assign(document.createElement('input'), { ariaLabel: 'Username' })));
  const field = page.getByRole('textbox', { name: 'Username' });
  await field.click();
  await page.keyboard.type('b g');
  await expect(field).toHaveValue('b g');
  await page.keyboard.press('ControlOrMeta+z');

  await field.blur(); // out of the field too
  await page.keyboard.press('b');
  await page.keyboard.down('Space');
  expect(await store(page, 'workspace', (w) => w.heldTool)).toBe(null); // no pan
  await page.keyboard.up('Space');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await store(page, 'workspace', (w) => w.outputActiveTool)).toBe('pencil');
  expect(await store(page, 'project', (p) => [p.canUndo, p.canRedo])).toEqual([true, true]); // nothing undone
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await store(page, 'project', (p) => [p.canUndo, p.canRedo])).toEqual([true, true]); // nor redone
  expect(await snapshot()).toBe(cells); // the stroke made before stays

  await page.keyboard.press('ControlOrMeta+s'); // save still opens
  await expect(page.getByRole('dialog')).toBeVisible();
});
