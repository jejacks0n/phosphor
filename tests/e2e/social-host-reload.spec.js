// A host's reload keeps the room: it comes back at the same address with its art, chat and numbers, the
// watchers wait and see it, and a room that ended meanwhile says so. Every reload accepts the page-closing prompt.
import { test, expect, tab, store, chars, editAt, settled } from './support.js';
import { fakeRoom, fakeServer, member, ROOM_ID, shown, tile, goLive, watching, selected, hash, asked, chat, outOfRoom, live, joins } from './social-support.js';

const AWAY = 'Your room ended while the page was away';
const ELSEWHERE = 'This room is open in another tab';
const NUMBERS = ['Here now', 'Max', 'Total', 'Messages'];
const hosts = (room) => room.from('host').filter((m) => m.type === 'host').length;
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

test('the watcher sees The host is reconnecting… during the reload, then the art', async ({ page: host, context }) => {
  const room = fakeRoom();
  const watcher = await watching(host, context, room);
  host.on('dialog', (dialog) => dialog.accept());
  let release = null;
  const held = new Promise((resolve) => { release = resolve; });
  await host.route(/\/api\/me$/, async (route) => {   // who you are is held, so the host's return is too
    await held;
    await route.fallback().catch(() => {});   // the page may have gone on by now
  });

  await host.reload();
  await expect(watcher.getByRole('status').filter({ hasText: 'The host is reconnecting…' })).toBeVisible();
  await expect(watcher.getByLabel('The room\'s art')).toBeVisible();   // the art as it was
  release();
  await live(host);
  await expect(watcher.getByRole('status').filter({ hasText: 'The host is reconnecting…' })).toHaveCount(0);
  await expect.poll(() => store(watcher, 'room', (r) => r.status)).toBe('live');
});

test('closing the host\'s page ends the room for the watcher after the wait', async ({ page: host, context }) => {
  const room = fakeRoom({ hostWaitMs: 3000 });
  const watcher = await watching(host, context, room);
  host.on('dialog', (dialog) => dialog.accept());

  const closing = Date.now();
  await host.close({ runBeforeUnload: true });
  await expect.poll(() => host.isClosed()).toBe(true);   // the close returns before the page has gone
  await expect(watcher.getByRole('status').filter({ hasText: 'The host is reconnecting…' })).toBeVisible();   // the room outlasts the close
  await expect(watcher.getByText('The host ended the room').first()).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - closing).toBeGreaterThanOrEqual(3000);
  await outOfRoom(watcher);
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

test('a duplicated tab takes the room, and the older tab stops', async ({ page: host, context }) => {
  const room = fakeRoom();
  const watcher = await watching(host, context, room);
  await tab(host, 'PIXEL').click();
  await hash(host, `/pixel?room=${ROOM_ID}`);
  host.on('dialog', (dialog) => dialog.accept());
  const art = await chars(host, 0, 0, 20);
  await fakeServer(context, { me: member(), room });   // for the copy, which is there before a page could be given routes

  // window.open copies sessionStorage, and with it the record of the room.
  const [copy] = await Promise.all([context.waitForEvent('page'), host.evaluate(() => window.open(location.href))]);
  await copy.waitForFunction(() => document.querySelector('#phosphor')?.__vue_app__);
  await live(copy);
  await expect.poll(() => hosts(room)).toBe(2);
  await expect(host.getByRole('status').filter({ hasText: ELSEWHERE })).toBeVisible();
  await outOfRoom(host);
  expect(await chars(host, 0, 0, 20)).toBe(art);
  expect(await store(copy, 'room', (r) => r.role)).toBe('host');

  await copy.waitForTimeout(2500);   // longer than a retry
  expect(hosts(room)).toBe(2);
  expect(await store(copy, 'room', (r) => r.role)).toBe('host');
  expect(await store(host, 'room', (r) => r.role)).toBe(null);

  await tab(copy, 'ANSI').click();
  await editAt(copy, 3, 2);
  await copy.keyboard.type('Z');
  const at = await store(copy, 'project', (p) => 2 * p.cols + 3);
  const cells = (page) => store(page, 'room', (r) => r.art?.cells.map((c) => c.char).join('') ?? null);
  await expect.poll(async () => (await cells(watcher))?.[at]).toBe('Z');
});

// The tall art, in a window small enough to scroll, with a watcher; the page-closing prompt is accepted.
async function hostingTallArt(host, context, room) {
  await host.setViewportSize({ width: 900, height: 500 });
  const watcher = await watching(host, context, room, { image: 'images/tall.png' });
  host.on('dialog', (dialog) => dialog.accept());
  return watcher;
}

// The open art tab zoomed by a Ctrl+wheel, and scrolled so `col`, `line` is its top-left cell, on the cell's edge: a
// view part way into a cell comes back at that edge, which can show a column or line more (`into`, of a line
// past the edge, is that view: its first whole line is the next).
async function zoomAndScroll(host, deltaY, col, line, into = 0) {
  const display = host.locator('.display');
  const box = await host.locator('article:has(.display)').last().boundingBox();
  await host.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await host.keyboard.down('Control');
  await host.mouse.wheel(0, deltaY);
  await host.keyboard.up('Control');
  await expect.poll(() => store(host, 'workspace', (w) => w.viewTab === 'output' ? w.ansiViewZoom !== 1 : w.inputView.zoom !== 5)).toBe(true);
  const size = await store(host, 'project', (p) => [p.cols, Math.ceil(p.rows / 2)]);
  await display.evaluate((el, [cols, lines, col, line]) => {
    const article = el.closest('article'), s = el.getBoundingClientRect(), v = article.getBoundingClientRect();
    article.scrollLeft += col * (s.width - 2 * el.clientLeft) / cols - (v.left + article.clientLeft - s.left - el.clientLeft);
    article.scrollTop += line * (s.height - 2 * el.clientTop) / lines - (v.top + article.clientTop - s.top - el.clientTop);
  }, [...size, col, line + into]);
  await expect.poll(() => store(host, 'workspace', (w) => [w.sharedView.col, w.sharedView.row])).toEqual([col, line + Math.ceil(into)]);
}

const shared = (page) => store(page, 'workspace', (w) => w.sharedView);

// What the watcher's host box is from here on, each change of it.
const boxesFrom = (watcher) => store(watcher, 'room', (r) => {
  window.boxes = [];
  r.$subscribe(() => {
    const box = JSON.stringify(r.hostView);
    if (window.boxes.at(-1) !== box) window.boxes.push(box);
  });
});

test('a host scrolled and zoomed in ANSI comes back to the same view, and the watcher\'s host box doesn\'t move', async ({ page: host, context }) => {
  const room = fakeRoom();
  const watcher = await hostingTallArt(host, context, room);
  await tab(host, 'ANSI').click();
  await zoomAndScroll(host, 30, 0, 200);
  const before = await shared(host);
  expect(before.row).toBeGreaterThan(0);
  await expect.poll(() => store(watcher, 'room', (r) => r.hostView)).toEqual(before);
  await boxesFrom(watcher);

  await host.reload();
  await live(host);
  await expect.poll(() => hosts(room)).toBe(2);
  await hash(host, `/ansi?room=${ROOM_ID}`);
  await expect.poll(() => shared(host)).toEqual(before);
  await settled(host);
  expect(await shared(host)).toEqual(before);
  expect(await store(host, 'workspace', (w) => w.viewToRestore)).toBe(null);
  await expect.poll(() => store(watcher, 'room', (r) => r.hostView)).toEqual(before);
  expect((await watcher.evaluate(() => window.boxes)).filter((box) => box !== JSON.stringify(before))).toEqual([]);
});

test('a host scrolled and zoomed in PIXEL comes back to the same view, and the watcher\'s host box doesn\'t move', async ({ page: host, context }) => {
  const room = fakeRoom();
  const watcher = await hostingTallArt(host, context, room);
  await tab(host, 'PIXEL').click();
  await zoomAndScroll(host, -100, 7, 200);
  const before = await shared(host);
  await expect.poll(() => store(watcher, 'room', (r) => r.hostView)).toEqual(before);
  await boxesFrom(watcher);
  const zoom = await store(host, 'workspace', (w) => w.editZoom);

  await host.reload();
  await live(host);
  await expect.poll(() => hosts(room)).toBe(2);
  await hash(host, `/pixel?room=${ROOM_ID}`);
  await selected(host, 'PIXEL');
  await expect.poll(() => shared(host)).toEqual(before);
  await settled(host);
  expect(await shared(host)).toEqual(before);
  expect(await store(host, 'workspace', (w) => [w.editZoom, w.viewToRestore])).toEqual([zoom, null]);
  await expect.poll(() => store(watcher, 'room', (r) => r.hostView)).toEqual(before);
  expect((await watcher.evaluate(() => window.boxes)).filter((box) => box !== JSON.stringify(before))).toEqual([]);
});

test('reloaded on SOCIAL, watchers keep the view; going to ANSI opens at it', async ({ page: host, context }) => {
  const room = fakeRoom();
  const watcher = await hostingTallArt(host, context, room);
  await tab(host, 'ANSI').click();
  await zoomAndScroll(host, 30, 0, 200);
  const before = await shared(host);
  await expect.poll(() => store(watcher, 'room', (r) => r.hostView)).toEqual(before);
  await tab(host, 'SOCIAL').click();
  await boxesFrom(watcher);

  await host.reload();
  await live(host);
  await expect.poll(() => hosts(room)).toBe(2);
  await selected(host, 'SOCIAL');
  expect(await shared(host)).toEqual(before);
  await expect.poll(() => store(watcher, 'room', (r) => r.hostView)).toEqual(before);
  expect((await watcher.evaluate(() => window.boxes)).filter((box) => box !== JSON.stringify(before))).toEqual([]);

  await tab(host, 'ANSI').click();
  await expect.poll(() => store(host, 'workspace', (w) => w.viewToRestore)).toBe(null);
  await settled(host);
  expect(await shared(host)).toEqual(before);
  expect(await store(watcher, 'room', (r) => r.hostView)).toEqual(before);
});

for (const [label, wheel, address] of [['ANSI', 30, 'ansi'], ['PIXEL', 100, 'pixel']]) {
  test(`a view part way into a cell in ${label} comes back with the same first cell and a box at most a cell different`, async ({ page: host, context }) => {
    const room = fakeRoom();
    await hostingTallArt(host, context, room);
    await tab(host, label).click();
    await zoomAndScroll(host, wheel, 0, 200, 0.4);
    const before = await shared(host);

    await host.reload();
    await live(host);
    await hash(host, `/${address}?room=${ROOM_ID}`);
    await expect.poll(() => store(host, 'workspace', (w) => w.viewToRestore)).toBe(null);
    await settled(host);
    const after = await shared(host);
    expect([after.col, after.row, after.zoom]).toEqual([before.col, before.row, before.zoom]);
    expect(Math.abs(after.cols - before.cols)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.rows - before.rows)).toBeLessThanOrEqual(1);
  });
}
