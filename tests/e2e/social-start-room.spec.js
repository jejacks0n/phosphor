// Starting a room and hosting it: Start a room (with and without art), going live, the host's page
// (its link, Room settings, End room, a dropped socket), the SOCIAL tab's dot, and the browser asking
// before a hosting tab closes.
import { test, expect, openApp, tab, store } from './support.js';
import { fakeServer, fakeRoom, member, tile, ROOM_ID } from './social-support.js';
import { silencedWords } from '../../src/social/chat.js';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const LINK = `http://localhost:4180/?room=${ROOM_ID}`;
const shown = (page, name) => page.locator(`.people-tab [data-page="${name}"]`);
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
  await expect(shown(page, 'start-room').getByRole('heading', { name: 'Setup room' })).toBeVisible();
  // A warning in place of the lobby picture, and in the same column for a room only the link reaches.
  const warning = 'Open some art in PIXEL or ANSI to share it first.';
  await expect(page.getByRole('region', { name: 'Lobby card' }).getByText(warning)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Lobby picture' })).toHaveCount(0);   // nothing to picture
  await page.getByRole('radio', { name: 'Only with the link' }).check();
  await expect(page.getByText(warning)).toBeVisible();
  await page.getByRole('radio', { name: 'Anyone, in the lobby' }).check();
  await page.getByRole('textbox', { name: 'Room name' }).fill('nothing yet');
  await expect(page.getByRole('button', { name: 'Go live' })).toBeDisabled();

  await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);   // the way back is Back to the lobby
  await page.getByRole('button', { name: '‹ Back to the lobby' }).click();
  await expect(shown(page, 'lobby')).toBeVisible();
  expect(server.sent('POST', '/api/rooms')).toEqual([]);
});

test('Setup room: the radio buttons look like the checkboxes; the room beside its lobby card when there\'s room, stacked when there isn\'t; link-only has no card', async ({ page }) => {
  await startPage(page);
  const setup = shown(page, 'start-room');
  const style = (el) => el.evaluate((input) => {
    const s = getComputedStyle(input);
    return { appearance: s.appearance, width: s.width, radius: s.borderRadius, background: s.backgroundColor };
  });
  const radio = setup.getByRole('radio', { name: 'Anyone, in the lobby' });
  const checkbox = setup.getByRole('checkbox', { name: 'Allow guests' });
  // (both are on, and their colors fade in: compared once they've settled)
  await expect.poll(async () => [await style(radio), { ...await style(checkbox), radius: '50%' }])
    .toEqual([{ appearance: 'none', width: '16px', radius: '50%', background: 'rgb(232, 2, 252)' }, { appearance: 'none', width: '16px', radius: '50%', background: 'rgb(232, 2, 252)' }]);
  const card = setup.getByRole('region', { name: 'Lobby card' });
  const name = setup.getByRole('textbox', { name: 'Room name' });
  await expect(card.getByRole('group', { name: 'Signal' })).toBeVisible();
  await expect(card.getByRole('region', { name: 'Lobby picture' })).toBeVisible();
  let [field, box] = [await name.boundingBox(), await card.boundingBox()];
  expect(box.x).toBeGreaterThan(field.x + field.width);   // beside
  expect(Math.abs(box.y - field.y)).toBeLessThan(40);
  const wide = await setup.getByRole('button', { name: 'Go live' }).boundingBox();   // as wide as the first column
  expect(Math.abs(wide.x - field.x)).toBeLessThan(1);
  expect(Math.abs(wide.width - field.width)).toBeLessThan(1);

  await page.setViewportSize({ width: 1000, height: 1000 });
  await expect.poll(async () => (await card.boundingBox()).y).toBeGreaterThan((await name.boundingBox()).y + 100);   // below
  [field, box] = [await name.boundingBox(), await card.boundingBox()];
  expect(Math.abs(box.x - field.x)).toBeLessThan(1);
  const live = await setup.getByRole('button', { name: 'Go live' }).boundingBox();   // one column: as wide as it
  expect(Math.abs(live.width - field.width)).toBeLessThan(1);

  await page.setViewportSize({ width: 1400, height: 900 });
  await setup.getByRole('radio', { name: 'Only with the link' }).check();
  await expect(card).toHaveCount(0);
  const form = await setup.locator('form').boundingBox();
  expect((await name.boundingBox()).width).toBeLessThan(form.width * 0.6);   // still a column wide, not stretched
});

test('going live with a public room: a name of only spaces isn\'t sent; the POST with its signal, the host\'s page with its link and fitting the tab, the tab\'s dot, Copy link', async ({ page }) => {
  const { room, server } = await startPage(page);
  // The setup takes the Public rooms section; the lobby's column stays beside it.
  const setup = shown(page, 'start-room');
  await expect(setup.getByRole('heading', { name: 'Setup room' })).toBeFocused();
  await expect(setup.getByRole('heading', { name: 'Public rooms' })).toHaveCount(0);
  await expect(setup.getByRole('complementary').getByRole('heading', { name: /In the lobby/ })).toBeVisible();
  const section = await setup.locator('section.main').boundingBox(), column = await setup.getByRole('complementary').boundingBox();
  expect(section.x + section.width).toBeCloseTo(column.x, 0);
  await expect(setup.getByRole('region', { name: 'Lobby picture' }).getByLabel('The room\'s art')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Anyone, in the lobby' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Allow guests' })).toBeChecked();
  await expect(page.getByRole('spinbutton', { name: 'Max watchers' })).toHaveValue('12');
  await expect(page.getByRole('spinbutton', { name: 'Max watchers' })).toHaveAttribute('max', '30');
  await page.getByRole('spinbutton', { name: 'Max watchers' }).fill('45');   // past the most, it comes back to it
  await expect(page.getByRole('spinbutton', { name: 'Max watchers' })).toHaveValue('30');
  await page.getByRole('spinbutton', { name: 'Max watchers' }).fill('12');
  await expect(page.getByRole('textbox', { name: 'Password' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Allow guests' })).toHaveAccessibleDescription(/^Guests can only watch/);
  await expect(page.getByRole('spinbutton', { name: 'Max watchers' })).toHaveAccessibleDescription(/^Each watcher uses some/);
  await expect(page.getByRole('textbox', { name: 'Welcome message' })).toHaveAccessibleDescription('0/200');
  const signal = page.getByRole('group', { name: 'Signal' });
  await expect(signal.locator('label')).toHaveText(['None', 'Wants feedback', 'Open to chat', 'Heads down']);
  await expect(signal.getByRole('radio', { name: 'None' })).toBeChecked();
  await expect(signal).toHaveAccessibleDescription('Shown on your room\'s card in the lobby.');
  await expect(dot(page)).toHaveCount(0);

  await signal.getByRole('radio', { name: 'Open to chat' }).check();

  const name = page.getByRole('textbox', { name: 'Room name' });
  await expect(name).toHaveAttribute('title', 'Use at least one character that isn\'t a space');   // the browser shows it with "match the format"
  await name.fill('   ');
  await page.getByRole('button', { name: 'Go live' }).click();
  await expect(name).toBeFocused();   // the browser's own "match the format"
  expect(await name.evaluate((input) => input.validity.valid)).toBe(false);
  expect(server.sent('POST', '/api/rooms')).toEqual([]);

  await name.fill('  neon harbor  ');
  await page.getByRole('textbox', { name: 'Welcome message' }).fill('hi all');
  await expect(page.getByText('6/200')).toBeVisible();
  await page.getByRole('button', { name: 'Go live' }).click();

  const host = shown(page, 'host-room');
  await expect(host.getByRole('heading', { name: 'neon harbor' })).toBeFocused();   // not lost to the page's body
  await expect(host.getByText(/Live for 0:0\d:\d\d/)).toBeVisible();
  await expect(tile(host, 'Here now')).toHaveText('0');
  await expect(host.getByText(LINK)).toBeVisible();
  await expect(host.getByText('Send the link and the password to anyone you want in.')).toHaveCount(0);
  expect(server.sent('POST', '/api/rooms').map((r) => r.body)).toEqual([{ name: 'neon harbor', public: true, allowGuests: true, max: 12, signal: 'chat' }]);
  await expect.poll(() => room.received[0]).toMatchObject({ from: 'host', msg: { type: 'host' } });
  await expect.poll(() => store(page, 'room', (r) => r.status)).toBe('live');

  await expect(host.getByRole('heading', { name: 'Room settings' })).toBeVisible();
  expect(await page.locator('.people-tab').evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0);   // only the page scrolls, when it needs to

  await expect(dot(page)).toBeVisible();
  await expect(dot(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(tab(page, 'SOCIAL')).toHaveAccessibleName('SOCIAL');

  const copy = host.getByRole('button', { name: 'Copy link' });
  await copy.click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(LINK);
  await expect(host.getByRole('button', { name: 'Copied' })).toBeVisible();
  await expect(host.getByRole('status')).toHaveText('Copied');   // said, too
  await expect(copy).toBeVisible({ timeout: 4000 });   // back after 2 s
});

test('a private room\'s password is optional: without one its link alone reaches it, and its page says to send the link', async ({ page }) => {
  const { room, server } = await startPage(page);
  await page.getByRole('textbox', { name: 'Room name' }).fill('just us');
  await page.getByRole('radio', { name: 'Open to chat' }).check();   // chosen while public, then not sent
  await page.getByRole('radio', { name: 'Only with the link' }).check();
  await expect(page.getByRole('group', { name: 'Signal' })).toHaveCount(0);   // only lobby cards show a signal
  await expect(page.getByRole('textbox', { name: 'Password (optional)' })).not.toHaveAttribute('required');
  await page.getByRole('button', { name: 'Go live' }).click();
  await expect(page.getByText('Send the link to anyone you want in.')).toBeVisible();
  expect(server.sent('POST', '/api/rooms').map((r) => r.body)).toEqual([{ name: 'just us', public: false, allowGuests: true, max: 12, signal: null }]);
  expect([room.setup.public, room.setup.password]).toEqual([false, null]);
});

test('a private room with a password sends it, and its page says to send both', async ({ page }) => {
  const { room, server } = await startPage(page);
  await page.getByRole('textbox', { name: 'Room name' }).fill('just us');
  await page.getByRole('radio', { name: 'Only with the link' }).check();
  await page.getByRole('textbox', { name: 'Password (optional)' }).fill('hunter22');
  await page.getByRole('button', { name: 'Go live' }).click();
  await expect(page.getByText('Send the link and the password to anyone you want in.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Lobby picture' })).toHaveCount(0);   // only a listed room has one
  await expect(page.getByRole('checkbox', { name: 'Use this exact position' })).toHaveCount(0);
  expect(server.sent('POST', '/api/rooms').map((r) => r.body)).toEqual([{ name: 'just us', public: false, allowGuests: true, max: 12, signal: null, password: 'hunter22' }]);
  expect(room.setup.password).toBe('hunter22');
});

test('the welcome box is as tall as its message, on Start a room and in Room settings', async ({ page }) => {
  const WELCOME = 'be kind, draw big. this is a longer welcome that wraps over several lines, so the box has to grow to show all of it at once!';
  const whole = (box) => box.evaluate((el) => el.scrollHeight <= el.clientHeight);
  await startPage(page);
  const start = shown(page, 'start-room').getByRole('textbox', { name: 'Welcome message' });
  await start.fill(WELCOME);
  expect(await whole(start)).toBe(true);
  await page.getByRole('textbox', { name: 'Room name' }).fill('neon harbor');
  await page.getByRole('button', { name: 'Go live' }).click();
  const host = shown(page, 'host-room');
  const settings = host.getByRole('textbox', { name: 'Welcome message' });
  await expect(settings).toHaveValue(WELCOME);
  expect(await whole(settings)).toBe(true);
});

test('what\'s typed in Start a room stays while you\'re on another tab, and is gone once the room is made', async ({ page }) => {
  await startPage(page);
  const start = shown(page, 'start-room');
  await start.getByRole('textbox', { name: 'Room name' }).fill('neon harbor');
  await start.getByRole('textbox', { name: 'Welcome message' }).fill('hi all');
  await start.getByRole('checkbox', { name: 'Allow guests' }).uncheck();
  await tab(page, 'PIXEL').click();
  await tab(page, 'SOCIAL').click();
  await expect(start.getByRole('textbox', { name: 'Room name' })).toHaveValue('neon harbor');
  await expect(start.getByRole('textbox', { name: 'Welcome message' })).toHaveValue('hi all');
  await expect(start.getByRole('checkbox', { name: 'Allow guests' })).not.toBeChecked();

  await page.getByRole('button', { name: 'Go live' }).click();
  await expect.poll(() => store(page, 'room', (r) => r.status)).toBe('live');
  await page.getByRole('button', { name: 'End room' }).click();
  await page.getByRole('dialog', { name: 'End the room?' }).getByRole('button', { name: 'End room' }).click();
  await page.getByRole('button', { name: 'Start a room' }).click();
  await expect(start.getByRole('textbox', { name: 'Room name' })).toHaveValue('');
  await expect(start.getByRole('checkbox', { name: 'Allow guests' })).toBeChecked();
});

test('Room settings follow the room when the server says how it is, also from another tab; what you typed stays while you\'re away', async ({ page }) => {
  const { room } = await goLive(page);
  const host = shown(page, 'host-room');
  const most = host.getByRole('spinbutton', { name: 'Max watchers' });
  const welcome = host.getByRole('textbox', { name: 'Welcome message' });
  await expect(most).toHaveValue('12');
  room.send('host', { type: 'settings-now', room: { ...room.info(), max: 20, allowGuests: false } });
  await expect(most).toHaveValue('20');
  await expect(host.getByRole('checkbox', { name: 'Allow guests' })).not.toBeChecked();

  await welcome.fill('back in 5');
  await tab(page, 'PIXEL').click();
  room.send('host', { type: 'settings-now', room: { ...room.info(), max: 25 } });
  await expect.poll(() => store(page, 'room', (r) => r.room.max)).toBe(25);
  await tab(page, 'SOCIAL').click();
  await expect(most).toHaveValue('25');
  await expect(welcome).toHaveValue('back in 5');

  await most.fill('3');
  await tab(page, 'PIXEL').click();
  await tab(page, 'SOCIAL').click();
  await expect(welcome).toHaveValue('back in 5');
  await expect(most).toHaveValue('3');
  await most.fill('99');
  await expect(most).toHaveValue('30');
});

// The server takes settings at most once a second (a sooner one is answered with the room as it is);
// the app waits 1.25 s after the last it sent, so a quick second Save still lands.
test('Room settings send the guests, max watchers and signal, and two quick saves leave the latest; End room asks first, Cancel keeps the room; End room sends end, and the lobby and the dot come back', async ({ page }) => {
  const { room } = await goLive(page);
  const host = shown(page, 'host-room');
  const most = host.getByRole('spinbutton', { name: 'Max watchers' });
  await most.fill('6');
  await host.getByRole('button', { name: 'Save' }).click();
  await most.fill('8');
  await host.getByRole('checkbox', { name: 'Allow guests' }).uncheck();
  await host.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => room.from('host').filter((m) => m.type === 'settings')).toEqual([
    { type: 'settings', allowGuests: true, max: 6, signal: null },
    { type: 'settings', allowGuests: false, max: 8, signal: null },
  ]);
  expect([room.setup.allowGuests, room.setup.max]).toEqual([false, 8]);
  await page.waitForTimeout(300);   // a settings-now would be back by now
  expect(await store(page, 'room', (r) => [r.room.allowGuests, r.room.max])).toEqual([false, 8]);

  await host.getByRole('button', { name: 'End room' }).click();
  const ask = page.getByRole('dialog', { name: 'End the room?' });
  await expect(ask.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toHaveCount(0);
  await expect(host.getByRole('button', { name: 'End room' })).toBeFocused();
  expect(await store(page, 'room', (r) => r.role)).toBe('host');

  await host.getByRole('button', { name: 'End room' }).click();
  await ask.getByRole('button', { name: 'End room' }).click();
  await expect.poll(() => room.from('host').map((m) => m.type)).toContain('end');
  await expect(shown(page, 'lobby').getByRole('heading', { name: 'Public rooms', exact: true })).toBeFocused();
  await expect(dot(page)).toHaveCount(0);
  expect(await store(page, 'room', (r) => r.role)).toBe(null);
});

test('the host\'s socket drops: Reconnecting… until it says host again, and what\'s typed in Room settings survives', async ({ page }) => {
  const { room } = await goLive(page);
  const host = shown(page, 'host-room');
  await host.getByRole('textbox', { name: 'Welcome message' }).fill('back in 5');
  await host.getByRole('spinbutton', { name: 'Max watchers' }).fill('3');
  room.drop('host');
  await expect(host.getByText('Reconnecting…')).toBeVisible();
  await expect.poll(() => room.from('host').filter((m) => m.type === 'host').length).toBe(2);
  await expect.poll(() => store(page, 'room', (r) => r.status)).toBe('live');
  await expect(host.getByText('Reconnecting…')).toHaveCount(0);
  await expect(tile(host, 'Here now')).toHaveText('0');
  await expect(host.getByRole('textbox', { name: 'Welcome message' })).toHaveValue('back in 5');
  await expect(host.getByRole('spinbutton', { name: 'Max watchers' })).toHaveValue('3');
});

// Settings sooner than a second after the last are answered with the room as it is (the app's own
// pacing never does that, so the first goes straight through the store's socket here).
test('a paced-out save shows the server\'s values, and saving them again sends them', async ({ page }) => {
  const { room } = await goLive(page);
  const host = shown(page, 'host-room');
  await store(page, 'room', (r) => r._connection.send({ type: 'settings', allowGuests: true, max: 6 }));
  const most = host.getByRole('spinbutton', { name: 'Max watchers' });
  await most.fill('8');
  await host.getByRole('button', { name: 'Save' }).click();
  await expect(most).toHaveValue('6');   // the server's word
  expect(room.setup.max).toBe(6);
  expect(await store(page, 'room', (r) => r.room.max)).toBe(6);

  await most.fill('8');
  await host.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => room.setup.max).toBe(8);
  expect(await store(page, 'room', (r) => r.room.max)).toBe(8);
});

// Review focus 4: the art isn't changed, so it's the room that asks; once closed, the server hears no end (a reload
// closes the page the same way, and the room's own wait ends a room whose host doesn't come back).
test('closing the tab while hosting asks first; closed, the server hears no end', async ({ page }) => {
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
  expect(room.from('host').map((m) => m.type)).not.toContain('end');
});

test('while your pass says you\'re silenced, Start a room is disabled and says until when; it comes back when that\'s past', async ({ page }) => {
  const start = Date.now();
  await page.clock.install({ time: start });
  await fakeServer(page, { me: member(), silencedUntil: start + 120_000 });
  await openApp(page);
  await tab(page, 'SOCIAL').click();
  await expect(page.getByRole('button', { name: 'Start a room' })).toBeDisabled();
  await expect(shown(page, 'lobby').getByRole('status').filter({ hasText: 'You\'re silenced until' })).toBeVisible();
  await page.clock.fastForward('03:00');
  await expect(page.getByRole('button', { name: 'Start a room' })).toBeEnabled();
  await expect(shown(page, 'lobby').getByText('You\'re silenced until')).toHaveCount(0);
});

test('a SILENCED refusal shows the server\'s words and no room starts', async ({ page }) => {
  const until = Date.now() + 3_600_000;
  let server;
  ({ server } = await startPage(page, {
    'POST /api/rooms': () => {
      server.silencedUntil = until;   // the server's word on it, which a new pass carries
      return [403, { code: 'SILENCED', until }];
    },
  }));
  await page.getByRole('textbox', { name: 'Room name' }).fill('neon harbor');
  await page.getByRole('button', { name: 'Go live' }).click();
  await expect(page.locator('.people-tab .notice')).toContainText(silencedWords(until));
  await expect(shown(page, 'start-room').getByRole('heading', { name: 'Setup room' })).toBeVisible();
  expect(await store(page, 'room', (r) => r.role)).toBe(null);
  expect(server.sent('POST', '/api/rooms')).toHaveLength(1);
  // A new pass at once, so Start a room is off without waiting for the next renewal.
  await expect.poll(() => store(page, 'social', (s) => s.claims?.silencedUntil)).toBe(until);
});
