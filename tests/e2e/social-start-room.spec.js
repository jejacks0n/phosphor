// Starting a room and hosting it: Start a room (with and without art), going live, the host's page
// (its link, Room settings, End room, a dropped socket), the SOCIAL tab's dot, and the browser asking
// before a hosting tab closes.
import { test, expect, openApp, tab, store } from './support.js';
import { fakeServer, fakeRoom, member, ROOM_ID } from './social-support.js';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const LINK = `http://localhost:4180/?room=${ROOM_ID}`;
const shown = (page, name) => page.locator(`.social-tab [data-page="${name}"]`);
const dot = (page) => tab(page, 'SOCIAL').locator('.dot');

// Signed in, with art open, on Start a room.
async function startPage(page, options = {}) {
  const room = fakeRoom();
  const server = await fakeServer(page, { me: member(), room, ...options });
  await openApp(page);
  await tab(page, 'SOCIAL').click();
  await page.getByRole('button', { name: 'Start a room' }).click();
  return { room, server };
}

// Live with a public room named `name`.
async function goLive(page, name = 'neon harbor') {
  const { room, server } = await startPage(page);
  await page.getByRole('textbox', { name: 'Room name' }).fill(name);
  await page.getByRole('button', { name: 'Go live' }).click();
  await expect.poll(() => store(page, 'room', (r) => r.status)).toBe('live');
  return { room, server };
}

test('Start a room with no art open says to open some, and Go live is disabled', async ({ page }) => {
  const server = await fakeServer(page, { me: member() });
  await page.goto('/');
  await tab(page, 'SOCIAL').click();
  await page.getByRole('button', { name: 'Start a room' }).click();
  await expect(shown(page, 'start-room').getByRole('heading', { name: 'Start a room' })).toBeVisible();
  await expect(page.getByText('Open some art in PIXEL or ANSI to share it')).toBeVisible();
  await page.getByRole('textbox', { name: 'Room name' }).fill('nothing yet');
  await expect(page.getByRole('button', { name: 'Go live' })).toBeDisabled();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(shown(page, 'lobby')).toBeVisible();
  expect(server.sent('POST', '/api/rooms')).toEqual([]);
});

test('going live with a public room: the POST, the host\'s page with its link, the tab\'s dot, Copy link', async ({ page }) => {
  const { room, server } = await startPage(page);
  await expect(page.getByText('What watchers will see')).toBeVisible();
  await expect(page.getByLabel('The room\'s art')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Anyone, in the lobby' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Allow guests' })).toBeChecked();
  await expect(page.getByRole('spinbutton', { name: 'Most watchers' })).toHaveValue('12');
  await expect(page.getByRole('textbox', { name: 'Password' })).toHaveCount(0);
  await expect(dot(page)).toHaveCount(0);

  await page.getByRole('textbox', { name: 'Room name' }).fill('  neon harbor  ');
  await page.getByRole('textbox', { name: 'Welcome message' }).fill('hi all');
  await expect(page.getByText('6/200')).toBeVisible();
  await page.getByRole('button', { name: 'Go live' }).click();

  const host = shown(page, 'host-room');
  await expect(host.getByRole('heading', { name: 'neon harbor' })).toBeVisible();
  await expect(host.getByText('0 watching')).toBeVisible();
  await expect(host.getByText(LINK)).toBeVisible();
  await expect(host.getByText('Send the link and the password to anyone you want in.')).toHaveCount(0);
  expect(server.sent('POST', '/api/rooms').map((r) => r.body)).toEqual([{ name: 'neon harbor', public: true, allowGuests: true, max: 12, signal: null }]);
  await expect.poll(() => room.from('host')[0]?.type).toBe('host');
  await expect.poll(() => store(page, 'room', (r) => r.status)).toBe('live');

  await expect(dot(page)).toBeVisible();
  await expect(dot(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(tab(page, 'SOCIAL')).toHaveAccessibleName('SOCIAL');

  const copy = host.getByRole('button', { name: 'Copy link' });
  await copy.click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(LINK);
  await expect(host.getByRole('button', { name: 'Copied' })).toBeVisible();
  await expect(copy).toBeVisible({ timeout: 4000 });   // back after 2 s
});

test('a private room needs a password before Go live, and its page says to send both', async ({ page }) => {
  const { room, server } = await startPage(page);
  await page.getByRole('textbox', { name: 'Room name' }).fill('just us');
  await page.getByRole('radio', { name: 'Only with the link' }).check();
  const password = page.getByRole('textbox', { name: 'Password' });
  await expect(password).toHaveAttribute('required', '');
  await page.getByRole('button', { name: 'Go live' }).click();
  await expect(password).toBeFocused();   // the browser's own "fill this in"
  expect(server.sent('POST', '/api/rooms')).toEqual([]);

  await password.fill('hunter22');
  await page.getByRole('button', { name: 'Go live' }).click();
  await expect(page.getByText('Send the link and the password to anyone you want in.')).toBeVisible();
  expect(server.sent('POST', '/api/rooms').map((r) => r.body)).toEqual([{ name: 'just us', public: false, allowGuests: true, max: 12, signal: null, password: 'hunter22' }]);
  expect(room.setup.password).toBe('hunter22');
});

test('Room settings send the guests and most watchers; End room sends end, and the lobby and the dot come back', async ({ page }) => {
  const { room } = await goLive(page);
  const host = shown(page, 'host-room');
  await host.getByText('Room settings').click();
  await host.getByRole('spinbutton', { name: 'Most watchers' }).fill('6');
  await host.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => room.from('host').filter((m) => m.type === 'settings')).toEqual([{ type: 'settings', allowGuests: true, max: 6 }]);
  expect(await store(page, 'room', (r) => r.room.max)).toBe(6);

  await host.getByRole('button', { name: 'End room' }).click();
  await expect.poll(() => room.from('host').map((m) => m.type)).toContain('end');
  await expect(shown(page, 'lobby')).toBeVisible();
  await expect(dot(page)).toHaveCount(0);
  expect(await store(page, 'room', (r) => r.role)).toBe(null);
});

test('the host\'s socket drops: Reconnecting… until it says host again', async ({ page }) => {
  const { room } = await goLive(page);
  room.drop('host');
  await expect(shown(page, 'host-room').getByText('Reconnecting…')).toBeVisible();
  await expect.poll(() => room.from('host').filter((m) => m.type === 'host').length).toBe(2);
  await expect(shown(page, 'host-room').getByText('Reconnecting…')).toHaveCount(0);
  await expect(shown(page, 'host-room').getByText('0 watching')).toBeVisible();
});

// Review focus 4: the art isn't changed, so it's the room that asks; once closed, the Room hears end.
test('closing the tab while hosting asks first; closed, the Room hears end', async ({ page }) => {
  const { room } = await goLive(page);
  expect(await store(page, 'project', (p) => p.isDirty)).toBe(false);
  const dialogs = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.type());
    return dialogs.length === 1 ? dialog.dismiss() : dialog.accept();
  });

  await page.close({ runBeforeUnload: true });
  await expect.poll(() => dialogs).toEqual(['beforeunload']);
  expect(page.isClosed()).toBe(false);
  expect(room.from('host').map((m) => m.type)).not.toContain('end');

  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  expect(dialogs).toEqual(['beforeunload', 'beforeunload']);
  await expect.poll(() => room.from('host').map((m) => m.type)).toContain('end');
});

test('a server that won\'t make the room until the email is verified says so', async ({ page }) => {
  await startPage(page, { 'POST /api/rooms': () => [403, { code: 'VERIFY_EMAIL' }] });
  await page.getByRole('textbox', { name: 'Room name' }).fill('neon harbor');
  await page.getByRole('button', { name: 'Go live' }).click();
  await expect(page.getByText('Check your inbox to verify your email')).toBeVisible();
  await expect(shown(page, 'start-room')).toBeVisible();
  expect(await store(page, 'room', (r) => r.role)).toBe(null);
});
