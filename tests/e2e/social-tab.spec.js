// The SOCIAL tab: a fourth editor tab, desktop only, where the editor's shortcuts are off.
import { test, expect, openApp, tab, store, cellPoint, drag, imageInput } from './support.js';
import { fakeServer } from './social-support.js';

test('the SOCIAL tab is there before any image; the lobby connects when it\'s first shown', async ({ page }) => {
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(tab(page, 'SOCIAL')).toBeEnabled();
  await expect.poll(() => store(page, 'social', (s) => s.supported)).toBe(true); // start() is done
  expect(server.sent('GET', '/api/me')).toHaveLength(1);
  expect(server.sent('POST', '/api/pass')).toHaveLength(0); // no lobby yet
  expect(await store(page, 'social', (s) => s.lobbyStatus)).toBe(null);

  await tab(page, 'SOCIAL').click();
  await expect(tab(page, 'SOCIAL')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.social-tab [data-page="lobby"]')).toBeVisible();
  await expect(imageInput(page)).toHaveCount(0); // no start screen
  await expect.poll(() => server.lobby.received.map((m) => m.type)).toEqual(['hello']);
  expect(await store(page, 'social', (s) => s.lobbyStatus)).toBe('live');

  await tab(page, 'PIXEL').click(); // and it stays connected
  await tab(page, 'SOCIAL').click();
  expect(server.lobby.received.map((m) => m.type)).toEqual(['hello']);
});

test('a link back from the server (?reset=, ?verified=1, ?social=) opens the SOCIAL tab, on desktops', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/?reset=tok');
  await expect(tab(page, 'SOCIAL')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.social-tab [data-page="reset"]')).toBeVisible();
  expect(new URL(page.url()).search).toBe('');

  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/?verified=1');
  await expect(tab(page, 'PIXEL')).toHaveAttribute('aria-selected', 'true');
  expect(await store(page, 'workspace', (w) => w.editorTab)).toBe('input');
});

test('a file dropped on the SOCIAL tab is ignored, not opened by the browser', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/');
  await tab(page, 'SOCIAL').click();
  const prevented = await page.locator('.social-tab').evaluate((el) => ['dragover', 'drop'].map((type) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(['x'], 'art.png', { type: 'image/png' }));
    const event = new DragEvent(type, { dataTransfer, bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  }));
  expect(prevented).toEqual([true, true]);
  expect(await store(page, 'project', (p) => p.image)).toBe(null);
});

// The e2e default (support.js): with no fakeServer, the SOCIAL server's requests are aborted rather
// than sent to whatever answers on localhost:8787.
test('without a fake server, nothing reaches localhost:8787', async ({ page }) => {
  const failed = page.waitForEvent('requestfailed', (r) => r.url() === 'http://localhost:8787/api/me');
  await page.goto('/');
  expect((await failed).failure().errorText).toBe('net::ERR_FAILED'); // aborted, not ERR_CONNECTION_REFUSED
  await tab(page, 'SOCIAL').click();
  await expect.poll(() => store(page, 'social', (s) => s.lobbyStatus)).toBe('reconnecting');
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
test('on the SOCIAL tab, letters, X, Space and Ctrl+Z leave the art and its tools alone', async ({ page }) => {
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
  const colors = (w) => [w.editFgColor, w.editBgColor];
  const before = await store(page, 'workspace', colors);
  await page.keyboard.press('x');
  expect(await store(page, 'workspace', colors)).toEqual(before); // no swap
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
