// Where SOCIAL lives, desktop only: the side panel's Social tab (Beta), and the ROOM tab while you watch a room,
// where your art isn't showing and the editor's shortcuts are off.
import { test, expect, openApp, tab, store, cellPoint, drag, settled, startScreen } from './support.js';
import { fakeServer, fakeRoom, goLive, watcherPage, joinFromCard, openLobby, shown, selected } from './social-support.js';

const databases = (page) => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
const lobbyTab = (page) => page.locator('.side-panel').getByRole('tab', { name: 'Social' });
const openPanel = (page) => page.getByRole('button', { name: 'Open the panel' }).click();

test('the Social tab is there before any image; nothing SOCIAL runs until the lobby is first shown, then it connects', async ({ page }) => {
  const server = await fakeServer(page);
  await page.goto('/');
  await openPanel(page);   // folded to its rail to begin with
  await expect(lobbyTab(page)).toBeEnabled();
  await selected(page, 'Layers');   // the panel opens on Layers, which isn't SOCIAL
  await page.waitForLoadState('networkidle');
  expect(await store(page, 'social', (s) => [s.started, s.supported, s.lobbyStatus])).toEqual([true, null, null]);
  expect(server.requests).toEqual([]); // not even /api/me
  expect(await databases(page)).not.toContain('phosphor-social'); // no key made

  await lobbyTab(page).click();
  await selected(page, 'Social');
  await expect(shown(page, 'lobby')).toBeVisible();
  await startScreen(page);   // beside the start screen, not in place of it
  await expect.poll(() => server.lobby.received.map((m) => m.type)).toEqual(['hello']);
  expect(await store(page, 'social', (s) => s.lobbyStatus)).toBe('live');
  expect(server.sent('GET', '/api/me')).toHaveLength(1);
  expect(await databases(page)).toContain('phosphor-social');

  await tab(page, 'Layers').click(); // and it stays connected
  await lobbyTab(page).click();
  await expect(shown(page, 'lobby')).toBeVisible();
  expect(server.lobby.received.map((m) => m.type)).toEqual(['hello']);
});

test('the Social tab is tagged beta, for screen readers as well; its name stays Social', async ({ page }) => {
  await page.goto('/');
  await openPanel(page);
  await expect(lobbyTab(page).locator('.beta')).toBeVisible();
  await expect(lobbyTab(page)).toHaveAccessibleDescription('Beta');
  await expect(lobbyTab(page)).toHaveAccessibleName('Social');
  await expect(tab(page, 'Layers').locator('.beta')).toHaveCount(0);
});

// The side panel isn't there, so the link is left as it came: it still works opened on a computer.
test('a link back opened on a narrow screen is left alone, and nothing SOCIAL runs', async ({ page }) => {
  const server = await fakeServer(page);
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/?verified=1&error=TOKEN_EXPIRED');
  await startScreen(page);
  await page.waitForLoadState('networkidle');
  expect(await store(page, 'workspace', (w) => w.editorTab)).toBe('input');
  expect(new URL(page.url()).search).toBe('?verified=1&error=TOKEN_EXPIRED');
  expect(await store(page, 'social', (s) => [s.notice, s.supported])).toEqual([null, null]);
  expect(server.requests).toEqual([]);
  await expect(page.locator('.side-panel')).toHaveCount(0);

  // Widened, the link is read when the lobby is first shown, and says so at its top.
  await page.setViewportSize({ width: 1400, height: 900 });
  await openLobby(page);
  await expect(shown(page, 'lobby').locator('p.notice')).toContainText('That link has expired or was already used');
  expect(new URL(page.url()).search).toBe('');
});

// Content blockers hide anything whose class or id says "social", as they do share buttons; the page loads, and is blank.
test('a content blocker that hides social widgets leaves the lobby and its pages showing', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/');
  await page.addStyleTag({ content: '[class*="social" i], [id*="social" i] { display: none !important; }' });
  await openLobby(page);
  await expect(page.getByRole('heading', { name: 'Public rooms' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('a file dropped on the lobby is ignored, not opened by the browser', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/');
  await openLobby(page);
  const prevented = await shown(page, 'lobby').evaluate((el) => ['dragover', 'drop'].map((type) => {
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
  await openLobby(page);
  expect((await failed).failure().errorText).toBe('net::ERR_FAILED'); // aborted, not ERR_CONNECTION_REFUSED
  await expect.poll(() => store(page, 'social', (s) => s.lobbyStatus)).toBe('reconnecting');
});

test('a second page in the context is cut off from localhost:8787 too', async ({ context }) => {
  const other = await context.newPage();
  const failed = other.waitForEvent('requestfailed', (r) => r.url() === 'http://localhost:8787/api/me');
  await other.goto('/');
  await openLobby(other);
  expect((await failed).failure().errorText).toBe('net::ERR_FAILED');
});

test('while you watch a room, ROOM is the last tab and the tablist\'s arrow keys reach it; the host has none; narrowed, it goes and PIXEL shows', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const watcher = await watcherPage(context, room);
  await openApp(watcher);
  await joinFromCard(watcher);
  await selected(watcher, 'ROOM');   // the card's Join shows it
  await expect(tab(host, 'ROOM')).toHaveCount(0);   // the host stays on their art
  await tab(watcher, 'SAUCE').click();
  await watcher.keyboard.press('ArrowRight');
  await expect(tab(watcher, 'ROOM')).toBeFocused();
  await selected(watcher, 'ROOM');
  await expect(shown(watcher, 'watch-room')).toBeVisible();
  await watcher.keyboard.press('ArrowRight'); // wraps
  await selected(watcher, 'PIXEL');

  await tab(watcher, 'ROOM').click();
  await watcher.setViewportSize({ width: 700, height: 900 });
  await expect(tab(watcher, 'ROOM')).toHaveCount(0);
  await selected(watcher, 'PIXEL');
});

test('narrow screens have no side panel, so no lobby; narrowing while it shows takes it away and leaves the art (the start screen, with nothing open)', async ({ page }) => {
  await fakeServer(page);
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/');
  await expect(tab(page, 'PIXEL')).toBeVisible();
  await expect(page.locator('.side-panel')).toHaveCount(0);

  await page.setViewportSize({ width: 1400, height: 900 });
  await openLobby(page);
  await expect(shown(page, 'lobby')).toBeVisible();
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(page.locator('.side-panel')).toHaveCount(0);
  await expect(shown(page, 'lobby')).toHaveCount(0);
  await startScreen(page);
  expect(await store(page, 'workspace', (w) => w.editorTab)).toBe('input');
});

// Review focus 5: typing in a SOCIAL field (a password, a message) never reaches the art; on ROOM, where your own
// art isn't showing, nor do its keys.
test('on the ROOM tab, letters, X, Space and Ctrl+Z leave your art and its tools alone', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const watcher = await watcherPage(context, room);
  await openApp(watcher);
  await watcher.getByRole('button', { name: 'Pencil' }).click();
  await drag(watcher, await cellPoint(watcher, 4, 5, 0), await cellPoint(watcher, 14, 5, 0));
  await drag(watcher, await cellPoint(watcher, 4, 8, 0), await cellPoint(watcher, 14, 8, 0));
  await watcher.keyboard.press('ControlOrMeta+z'); // the second stroke, undone here: something to redo
  const snapshot = () => store(watcher, 'project', (p) => JSON.stringify(p.cells));
  await settled(watcher); // the undo's render lands a moment later
  const cells = await snapshot();

  await joinFromCard(watcher);
  await tab(watcher, 'ROOM').click();
  await shown(watcher, 'watch-room').evaluate((el) => el.prepend(Object.assign(document.createElement('input'), { ariaLabel: 'Password' })));
  const field = watcher.getByRole('textbox', { name: 'Password' });
  await field.click();
  await watcher.keyboard.type('b g');
  await expect(field).toHaveValue('b g');
  await watcher.keyboard.press('ControlOrMeta+z');

  await field.blur(); // out of the field too
  await watcher.keyboard.press('b');
  const colors = (w) => [w.editFgColor, w.editBgColor];
  const before = await store(watcher, 'workspace', colors);
  await watcher.keyboard.press('x');
  expect(await store(watcher, 'workspace', colors)).toEqual(before); // no swap
  await watcher.keyboard.down('Space');
  expect(await store(watcher, 'workspace', (w) => w.heldTool)).toBe(null); // no pan
  await watcher.keyboard.up('Space');
  await watcher.keyboard.press('ControlOrMeta+z');
  expect(await store(watcher, 'workspace', (w) => w.outputActiveTool)).toBe('pencil');
  expect(await store(watcher, 'project', (p) => [p.canUndo, p.canRedo])).toEqual([true, true]); // nothing undone
  await watcher.keyboard.press('ControlOrMeta+Shift+z');
  expect(await store(watcher, 'project', (p) => [p.canUndo, p.canRedo])).toEqual([true, true]); // nor redone
  expect(await snapshot()).toBe(cells); // the stroke made before stays

  await watcher.keyboard.press('ControlOrMeta+s'); // save still opens
  await expect(watcher.getByRole('dialog')).toBeVisible();
});

// The SOCIAL pages are drawn as the SAUCE tab is: its title and its labels, in a dialog in the middle of the window.
test('the SOCIAL pages look like the SAUCE tab: the same title and labels, in a dialog in the middle of the window', async ({ page }) => {
  await fakeServer(page);
  await openApp(page);
  const look = (locator, props) => locator.evaluate((el, props) => {
    const style = getComputedStyle(el);
    return Object.fromEntries(props.map((p) => [p, style[p]]));
  }, props);
  const TITLE = ['fontSize', 'fontWeight', 'textTransform', 'letterSpacing', 'color'];
  const LABEL = ['fontSize', 'fontWeight', 'textTransform', 'color'];
  await tab(page, 'SAUCE').click();
  const sauce = page.locator('.sauce-editor');
  const title = await look(sauce.locator('h3'), TITLE);
  const label = await look(sauce.locator('label').first(), LABEL);

  await openLobby(page);
  await shown(page, 'lobby').getByRole('button', { name: 'Sign in to socialize' }).click();
  const form = page.locator('.people-forms[data-page="sign-in"] .form-page');
  expect(await look(form.getByRole('heading', { name: 'Sign in' }), TITLE)).toEqual(title);
  expect(await look(form.locator('label').filter({ hasText: 'Password' }), LABEL)).toEqual(label);
  const box = await page.getByRole('dialog', { name: 'Sign in' }).boundingBox(), view = page.viewportSize();
  expect(Math.abs((box.x + box.width / 2) - view.width / 2)).toBeLessThan(2);   // across
  expect(Math.abs((box.y + box.height / 2) - view.height / 2)).toBeLessThan(2);   // and down
});
