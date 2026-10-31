// A host's reload keeps the room: it comes back at the same address with its art, chat and numbers, the
// watchers wait and see it, and a room that ended meanwhile says so. Every reload accepts the page-closing prompt.
import { test, expect, tab, store, chars, editAt } from './support.js';
import { fakeRoom, ROOM_ID, shown, tile, goLive, watching, selected, hash, asked, chat, outOfRoom } from './social-support.js';

const AWAY = 'Your room ended while the page was away';
const NUMBERS = ['Here now', 'Max', 'Total', 'Messages'];
const joins = (room) => room.received.filter((r) => r.msg.type === 'join').length;
const hosts = (room) => room.from('host').filter((m) => m.type === 'host').length;
const live = (page) => expect.poll(() => store(page, 'room', (r) => r.status), { timeout: 20_000, intervals: [100] }).toBe('live');
const messages = (page) => chat(page).getByRole('log').locator('.message');
const joined = (page) => chat(page).getByRole('log').locator('.presence').filter({ hasText: 'joined' });

async function say(page, text) {
  const box = chat(page).getByRole('textbox', { name: 'Message' });
  await box.fill(text);
  await box.press('Enter');
}

// The Host page's numbers, read on the SOCIAL tab.
async function numbers(host) {
  await tab(host, 'SOCIAL').click();
  const read = {};
  for (const label of NUMBERS) read[label] = await tile(shown(host, 'host-room'), label).textContent();
  return read;
}

// Hosting on PIXEL with a message said; the page-closing prompt is accepted.
async function hostingOnPixel(host, room, options) {
  const server = await goLive(host, room, options);
  await say(host, 'hello room');
  await expect(messages(host)).toHaveCount(1);
  await tab(host, 'PIXEL').click();
  await hash(host, `/pixel?room=${ROOM_ID}`);
  host.on('dialog', (dialog) => dialog.accept());
  return server;
}

test('a host\'s reload keeps the room: its art, chat, numbers and Live for, at the same address and tab', async ({ page: host }) => {
  const room = fakeRoom();
  await hostingOnPixel(host, room);
  const art = await chars(host, 0, 0, 20);
  const liveSince = await store(host, 'room', (r) => r.session.liveSince);
  const before = await numbers(host);
  await tab(host, 'PIXEL').click();

  await host.reload();
  await live(host);
  await hash(host, `/pixel?room=${ROOM_ID}`);
  await selected(host, 'PIXEL');
  await expect(asked(host)).toHaveCount(0);
  expect(joins(room)).toBe(0);
  await expect.poll(() => hosts(room)).toBe(2);
  expect(await chars(host, 0, 0, 20)).toBe(art);
  await expect(messages(host)).toHaveCount(1);
  await expect(messages(host).first()).toContainText('hello room');
  expect(await store(host, 'room', (r) => r.session.liveSince)).toBe(liveSince);
  await expect.poll(() => numbers(host)).toEqual(before);
  await expect(shown(host, 'host-room').locator('.live')).toContainText('Live for');
  expect(await store(host, 'room', (r) => r.role)).toBe('host');
});

test('the watcher stays through it: no second join, the art, the edits after, one joined line', async ({ page: host, context }) => {
  const room = fakeRoom();
  const watcher = await watching(host, context, room);
  host.on('dialog', (dialog) => dialog.accept());
  await expect(joined(host)).toHaveCount(1);
  const cells = (page) => store(page, 'room', (r) => r.art?.cells.map((c) => c.char).join('') ?? null);

  await host.reload();
  await live(host);
  await expect.poll(() => hosts(room)).toBe(2);
  expect(joins(room)).toBe(1);
  expect(await store(watcher, 'room', (r) => r.role)).toBe('watch');
  await expect(watcher.getByLabel('The room\'s art')).toBeVisible();

  await tab(host, 'ANSI').click();
  await editAt(host, 3, 2);
  await host.keyboard.type('Z');
  const at = await store(host, 'project', (p) => 2 * p.cols + 3);
  await expect.poll(async () => (await cells(watcher))?.[at]).toBe('Z');
  await expect(joined(host)).toHaveCount(1);
  await expect(chat(watcher).getByRole('log').getByText('You joined')).toHaveCount(1);
  await expect(joined(watcher)).toHaveCount(0);
});

test('reloading again while reconnecting comes back the same', async ({ page: host }) => {
  const room = fakeRoom();
  await hostingOnPixel(host, room);
  const liveSince = await store(host, 'room', (r) => r.session.liveSince);
  const art = await chars(host, 0, 0, 20);
  let slow = true;   // who you are is slow to answer, so the room is still reconnecting
  await host.route(/\/api\/(me|pass)$/, async (route) => {
    if (slow) await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fallback();
  });

  await host.reload();
  await expect.poll(() => store(host, 'room', (r) => r.status)).toBe('reconnecting');
  await host.reload();
  await expect.poll(() => store(host, 'room', (r) => r.status)).toBe('reconnecting');
  slow = false;
  await live(host);
  await hash(host, `/pixel?room=${ROOM_ID}`);
  await selected(host, 'PIXEL');
  expect(joins(room)).toBe(0);
  expect(await store(host, 'room', (r) => r.session.liveSince)).toBe(liveSince);
  expect(await chars(host, 0, 0, 20)).toBe(art);
  await expect(messages(host)).toHaveCount(1);
});

test('a room gone while away: the words, the art stays, the address loses ?room=', async ({ page: host }) => {
  const room = fakeRoom({ hostWaitMs: 0 });
  await hostingOnPixel(host, room);
  const art = await chars(host, 0, 0, 20);

  await host.reload();
  await expect(host.getByRole('status').filter({ hasText: AWAY })).toBeVisible();
  await hash(host, '/pixel');
  await selected(host, 'PIXEL');
  await outOfRoom(host);
  expect(await chars(host, 0, 0, 20)).toBe(art);
  expect(await store(host, 'social', (s) => s.notice)).toBe(AWAY);
  await tab(host, 'SOCIAL').click();
  await expect(host.locator('.people-tab').getByText(AWAY)).toBeVisible();
});

test('signed out while away: no room, no words', async ({ page: host }) => {
  const room = fakeRoom();
  const server = await hostingOnPixel(host, room);
  const art = await chars(host, 0, 0, 20);
  server.me = null;   // /api/me answers 401 and /api/pass a guest pass

  await host.reload();
  await outOfRoom(host);
  await hash(host, '/pixel');
  await selected(host, 'PIXEL');
  expect(await store(host, 'social', (s) => s.notice)).toBe(null);
  await expect(host.getByRole('status').filter({ hasText: AWAY })).toHaveCount(0);
  expect(await chars(host, 0, 0, 20)).toBe(art);
  expect(joins(room)).toBe(0);
});

test('the site\'s plain address in the hosting tab mounts, asks nothing and is still hosting', async ({ page: host }) => {
  const room = fakeRoom();
  await hostingOnPixel(host, room);

  await host.goto('/');
  await live(host);
  await expect(asked(host)).toHaveCount(0);
  await expect(host.getByRole('dialog', { name: 'End the room?' })).toHaveCount(0);
  await expect.poll(() => new URL(host.url()).hash).toContain(`room=${ROOM_ID}`);
  expect(await store(host, 'room', (r) => [r.role, r.id])).toEqual(['host', ROOM_ID]);
  expect(joins(room)).toBe(0);
});
