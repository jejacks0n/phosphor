// Watching a room: two pages in one fake Room, the host (signed in, art open, live through the UI) and
// a watcher (a guest unless said otherwise). Joining from a lobby card or a ?room= link, the host's art
// live with the host's view, Following, Leave, the host ending the room, refusals, and the watcher's
// own art left as it was.
import { test, expect, openApp, tab, store, editAt, cellPoint, screenPixel, settled } from './support.js';
import { fakeServer, fakeRoom, member, ROOM_ID } from './social-support.js';

const shown = (page, name) => page.locator(`.social-tab [data-page="${name}"]`);
const watching = (page) => shown(page, 'watch-room');
const card = (page) => shown(page, 'lobby').getByRole('article').filter({ hasText: 'neon harbor' });
const hostCells = (host) => store(host, 'project', (p) => p.cells.map((c) => [c.char, c.fg.hex, c.bg.hex]));
const watcherCells = (watcher) => store(watcher, 'room', (r) => r.art?.cells.map((c) => [c.char, c.fg.hex, c.bg.hex]) ?? null);

// The host live with a room made through Start a room, with `image` open and the form filled as asked.
async function goLive(host, room, { image = 'images/gradient.png', welcome = '', password = null, allowGuests = true } = {}) {
  await fakeServer(host, { me: member(), room });
  await openApp(host, image);
  await tab(host, 'SOCIAL').click();
  await host.getByRole('button', { name: 'Start a room' }).click();
  await host.getByRole('textbox', { name: 'Room name' }).fill('neon harbor');
  await host.getByRole('textbox', { name: 'Welcome message' }).fill(welcome);
  if (password !== null) {
    await host.getByRole('radio', { name: 'Only with the link' }).check();
    await host.getByRole('textbox', { name: 'Password' }).fill(password);
  }
  if (!allowGuests) await host.getByRole('checkbox', { name: 'Allow guests' }).uncheck();
  await host.getByRole('button', { name: 'Go live' }).click();
  await expect.poll(() => store(host, 'room', (r) => r.status)).toBe('live');
}

// The watcher's page, its lobby listing the room (as the server would once it's live).
async function watcherPage(context, room, { me = null } = {}) {
  const watcher = await context.newPage();
  const rooms = [{
    id: ROOM_ID, name: 'neon harbor', host: 'ansi-fan', count: 0, max: 12, allowGuests: true, signal: null,
    liveSince: Date.now(), thumbnail: null, blockedInside: false,
  }];
  await fakeServer(watcher, { me, room, rooms });
  return watcher;
}

// Joined from the lobby card, with the host's art.
async function joinFromCard(watcher) {
  await tab(watcher, 'SOCIAL').click();
  await card(watcher).getByRole('button', { name: /^Join/ }).click();
  await expect.poll(() => store(watcher, 'room', (r) => r.status), { timeout: 20_000 }).toBe('live');
  await expect.poll(() => store(watcher, 'room', (r) => !!r.art)).toBe(true);
}

test('Join from a lobby card: the room\'s name, its welcome, and the host\'s art, changes and all', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room, { welcome: 'hi all' });
  const watcher = await watcherPage(context, room);
  await watcher.goto('/');
  await joinFromCard(watcher);

  const page = watching(watcher);
  await expect(page.getByRole('heading', { name: 'neon harbor' })).toBeVisible();
  await expect(page.getByText('hosted by ansi-fan')).toBeVisible();
  await expect(page.getByText('hi all')).toBeVisible();
  await expect(page.getByLabel('The room\'s art')).toBeVisible();
  await expect.poll(() => watcherCells(watcher)).toEqual(await hostCells(host));

  await tab(host, 'ANSI').click();
  await editAt(host, 3, 2);
  await host.keyboard.type('Z');
  const at = await store(host, 'project', (p) => 2 * p.cols + 3);
  expect((await hostCells(host))[at][0]).toBe('Z');
  await expect.poll(async () => (await watcherCells(watcher))[at], { timeout: 2000 }).toEqual((await hostCells(host))[at]);
});

// Where the watcher's art is scrolled, against where centering the host's view (the box) puts it.
// (Down only: the art's 80 columns fit across.)
const scrolls = (watcher) => watcher.locator('.room-art').evaluate((el) => {
  const box = el.querySelector('.host-view');
  const centered = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, box.offsetTop + box.offsetHeight / 2 - el.clientHeight / 2));
  return { at: el.scrollTop, off: Math.abs(el.scrollTop - centered) };
});
const centered = async (watcher) => (await scrolls(watcher)).off <= 1;

test('the host sees the watcher following; a wheel is looking around, and Follow brings the host\'s view back to the center', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room, { image: 'images/tall.png' });   // 1,200 lines: the watcher's art scrolls
  await tab(host, 'ANSI').click();
  await settled(host);
  await host.locator('.ansi-editor > article').evaluate((el) => { el.scrollTop = el.scrollHeight / 2; });
  await expect.poll(() => store(host, 'workspace', (w) => w.ansiViewOrigin.row)).toBeGreaterThan(400);
  await tab(host, 'SOCIAL').click();

  const watcher = await watcherPage(context, room);
  await watcher.goto('/');
  await joinFromCard(watcher);
  const list = shown(host, 'host-room').getByRole('list', { name: 'Watching' });
  await expect(list.getByRole('listitem')).toHaveText([/quiet-amber-fox\s*guest\s*following/]);
  await expect(watching(watcher).getByRole('button', { name: 'Following' })).toBeVisible();
  await expect.poll(async () => (await scrolls(watcher)).at > 0 && await centered(watcher)).toBe(true);

  const art = watching(watcher).getByLabel('The room\'s art');
  const box = await art.boundingBox();
  await watcher.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await watcher.mouse.wheel(0, 2000);
  const follow = watching(watcher).getByRole('button', { name: 'Follow ansi-fan' });
  await expect(follow).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveText([/quiet-amber-fox\s*guest\s*looking around/]);
  await expect.poll(() => centered(watcher)).toBe(false);

  await follow.click();
  await expect(watching(watcher).getByRole('button', { name: 'Following' })).toBeVisible();
  await expect.poll(() => centered(watcher)).toBe(true);
  await expect(list.getByRole('listitem')).toHaveText([/quiet-amber-fox\s*guest\s*following/]);
});

test('Leave returns the watcher to the lobby, and the host\'s count goes to 0', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const watcher = await watcherPage(context, room);
  await watcher.goto('/');
  await joinFromCard(watcher);
  await expect(shown(host, 'host-room').getByText('1 watching')).toBeVisible();

  await watching(watcher).getByRole('button', { name: 'Leave' }).click();
  await expect(shown(watcher, 'lobby').getByRole('heading', { name: 'Public rooms', exact: true })).toBeFocused();
  expect(await store(watcher, 'room', (r) => r.role)).toBe(null);
  await expect(shown(host, 'host-room').getByText('0 watching')).toBeVisible();
});

test('End room on the host puts the watcher back in the lobby with "The host ended the room"', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const watcher = await watcherPage(context, room);
  await watcher.goto('/');
  await joinFromCard(watcher);

  await shown(host, 'host-room').getByRole('button', { name: 'End room' }).click();
  await expect(watcher.getByText('The host ended the room')).toBeVisible();
  await expect(shown(watcher, 'lobby')).toBeVisible();
  expect(await store(watcher, 'room', (r) => r.role)).toBe(null);
});

test('a ?room= link to a private room asks for the password: a wrong one says so, the right one joins', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room, { password: 'hunter22' });
  const watcher = await watcherPage(context, room);
  await watcher.goto(`/?room=${ROOM_ID}`);

  const page = watching(watcher);
  await expect(page.getByRole('heading', { name: 'This room needs a password' })).toBeFocused();
  await expect(page.getByText('Wrong password')).toHaveCount(0);   // the link's first try goes without one
  await page.getByLabel('Password').fill('swordfish');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('Wrong password')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'This room needs a password' })).toBeVisible();
  const field = page.getByLabel('Password');
  await expect(field).toBeFocused();   // not lost with the Join button the try took away
  expect(await field.evaluate((input) => [input.selectionStart, input.selectionEnd])).toEqual([0, 'swordfish'.length]);

  await field.fill('hunter22');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'neon harbor' })).toBeFocused({ timeout: 20_000 });
  await expect.poll(() => watcherCells(watcher)).toEqual(await hostCells(host));
});

test('the same member watching in a second tab: the first goes back to the lobby, saying why, and the second watches', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const me = member({ id: 'u_2', username: 'tin-lantern-owl', name: 'tin-lantern-owl' });
  const first = await watcherPage(context, room, { me });
  await first.goto(`/?room=${ROOM_ID}`);
  await expect.poll(() => store(first, 'room', (r) => r.status), { timeout: 20_000 }).toBe('live');

  const second = await watcherPage(context, room, { me });
  await second.goto(`/?room=${ROOM_ID}`);
  await expect(first.getByText('You\'re watching this room in another tab')).toBeVisible();
  await expect(shown(first, 'lobby')).toBeVisible();
  await expect.poll(() => store(second, 'room', (r) => r.status), { timeout: 20_000 }).toBe('live');
  await expect(shown(host, 'host-room').getByText('1 watching')).toBeVisible();
  await first.waitForTimeout(1500);   // past a retry, if there were one
  expect(await store(first, 'room', (r) => r.role)).toBe(null);
  expect(room.from('p_1').filter((m) => m.type === 'join')).toHaveLength(1);
});

test('a members-only room refuses a guest with "Signed-in users only"', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room, { allowGuests: false });
  const watcher = await watcherPage(context, room);
  await watcher.goto(`/?room=${ROOM_ID}`);
  await expect(watcher.getByText('Signed-in users only')).toBeVisible();
  await expect(shown(watcher, 'lobby')).toBeVisible();
  expect(await store(watcher, 'room', (r) => r.role)).toBe(null);
});

test('a full room says "Room is full"', async ({ page: host, context }) => {
  const room = fakeRoom({ full: true });
  await goLive(host, room);
  const watcher = await watcherPage(context, room, { me: member({ id: 'u_2', username: 'tin-lantern-owl', name: 'tin-lantern-owl' }) });
  await watcher.goto(`/?room=${ROOM_ID}`);
  await expect(watcher.getByText('Room is full')).toBeVisible();
  await expect(shown(watcher, 'lobby')).toBeVisible();
});

// Review focus 5: watching never touches the watcher's own document, and the ANSI tab still shows it.
test('a watcher\'s own unsaved art is as it was after joining, watching and leaving', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const watcher = await watcherPage(context, room);
  await openApp(watcher, 'images/photo.jpg');
  await watcher.keyboard.press('p');
  const painted = await cellPoint(watcher, 5, 3, 0);
  await watcher.mouse.click(painted.x, painted.y);
  await settled(watcher);
  const own = () => store(watcher, 'project', (p) => ({
    cells: p.cells.map((c) => [c.char, c.fg.hex, c.bg.hex]), version: p.history.version, dirty: p.isDirty,
  }));
  const before = await own();
  expect(before.dirty).toBe(true);
  const plain = await cellPoint(watcher, 20, 6);
  const pixels = async () => [await screenPixel(watcher, painted.x, painted.y), await screenPixel(watcher, plain.x, plain.y)];
  const shownBefore = await pixels();
  await tab(watcher, 'PIXEL').click();
  await settled(watcher);
  const pixelView = await watcher.locator('article[tabindex="0"] .display canvas').boundingBox();
  const pixelViewPixel = () => screenPixel(watcher, pixelView.x + pixelView.width / 2, pixelView.y + pixelView.height / 2);
  const pixelBefore = await pixelViewPixel();

  await joinFromCard(watcher);
  await tab(host, 'ANSI').click();
  await editAt(host, 5, 3);
  await host.keyboard.type('Q');
  await expect.poll(() => watcherCells(watcher)).toEqual(await hostCells(host));
  expect(await watcherCells(watcher)).not.toEqual(before.cells);
  const art = await watching(watcher).getByLabel('The room\'s art').boundingBox();
  await watcher.mouse.move(art.x + art.width / 2, art.y + art.height / 2);
  await watcher.mouse.wheel(0, 200);   // looking around, then following again
  await watching(watcher).getByRole('button', { name: 'Follow ansi-fan' }).click();
  await expect(watching(watcher).getByRole('button', { name: 'Following' })).toBeVisible();

  await tab(watcher, 'ANSI').click();
  await settled(watcher);
  expect(await pixels()).toEqual(shownBefore);
  await tab(watcher, 'PIXEL').click();
  await settled(watcher);
  expect(await pixelViewPixel()).toEqual(pixelBefore);
  expect(await own()).toEqual(before);
  expect(await store(watcher, 'room', (r) => r.status)).toBe('live');   // still watching

  await tab(watcher, 'SOCIAL').click();
  await watching(watcher).getByRole('button', { name: 'Leave' }).click();
  await expect(shown(watcher, 'lobby')).toBeVisible();
  expect(await own()).toEqual(before);
});
