// Watching a room: two pages in one fake Room, the host (signed in, art open, live through the UI) and
// a watcher (a guest unless said otherwise). Joining from a lobby card or a ?room= link, the host's art
// live with the host's view, Tracking, Leave, the host ending the room, refusals, and the watcher's
// own art left as it was.
import { test, expect, openApp, tab, store, editAt, cellPoint, screenPixel, settled } from './support.js';
import { fakeRoom, member, ROOM_ID, shown, tile, goLive, watcherPage, joinFromCard } from './social-support.js';

const watching = (page) => shown(page, 'watch-room');
const chat = (page) => page.getByRole('complementary', { name: 'Chat' });   // its top has the room's name, the host and Leave
const trackTag = (page) => watching(page).getByRole('button', { name: 'Track ansi-fan' });   // the tag on the host's box
const hostCells = (host) => store(host, 'project', (p) => p.cells.map((c) => [c.char, c.fg.hex, c.bg.hex]));
const watcherCells = (watcher) => store(watcher, 'room', (r) => r.art?.cells.map((c) => [c.char, c.fg.hex, c.bg.hex]) ?? null);

test('Join from a lobby card: the room\'s name, its welcome, and the host\'s art, changes and all', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room, { welcome: 'hi all' });
  const watcher = await watcherPage(context, room);
  await watcher.goto('/');
  await joinFromCard(watcher);

  await expect(chat(watcher).getByRole('heading', { name: 'neon harbor' })).toBeVisible();
  await expect(chat(watcher).getByText('hosted by ansi-fan')).toBeVisible();
  await expect(chat(watcher).getByText('hi all')).toBeVisible();
  // The SOCIAL tab doesn't say them again: the art is all it shows (its heading is for screen readers).
  const page = watching(watcher);
  await expect(page.getByRole('heading', { name: 'neon harbor' })).toHaveCSS('position', 'absolute');
  await expect(page.getByText('hosted by ansi-fan')).toHaveCount(0);
  await expect(page.getByText('hi all')).toHaveCount(0);
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

test('the host sees the watcher tracking; a wheel is looking around, and Track brings the host\'s view back to the center', async ({ page: host, context }) => {
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
  await chat(host).getByRole('button', { name: /^\d+ here$/ }).click();
  const list = chat(host).getByRole('list', { name: 'Who is here' });
  await expect(list.getByRole('listitem')).toHaveText([/quiet-amber-fox\s*guest\s*tracking/]);
  await expect(trackTag(watcher)).toHaveAttribute('aria-pressed', 'true');
  await expect(chat(watcher).getByRole('button', { name: /^Track/ })).toHaveCount(0);   // the tag is the only Track
  await expect.poll(async () => (await scrolls(watcher)).at > 0 && await centered(watcher)).toBe(true);

  const art = watching(watcher).getByLabel('The room\'s art');
  const box = await art.boundingBox();
  await watcher.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await watcher.mouse.wheel(0, 2000);
  const track = trackTag(watcher);
  await expect(track).toHaveAttribute('aria-pressed', 'false');
  await expect(track).toBeInViewport();   // the box is scrolled away, the tag isn't
  await expect(list.getByRole('listitem')).toHaveText([/quiet-amber-fox\s*guest\s*looking around/]);
  await expect.poll(() => centered(watcher)).toBe(false);

  await track.click();
  await expect(track).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => centered(watcher)).toBe(true);
  await expect(list.getByRole('listitem')).toHaveText([/quiet-amber-fox\s*guest\s*tracking/]);
});

test('the host zooms ANSI out to 50%: a tracking watcher\'s cells are half as wide', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room, { image: 'images/tall.png' });
  await tab(host, 'ANSI').click();
  await settled(host);
  await store(host, 'workspace', (w) => { w.ansiZoom = 1; });
  await tab(host, 'SOCIAL').click();

  const watcher = await watcherPage(context, room);
  await watcher.goto('/');
  await joinFromCard(watcher);
  await expect(trackTag(watcher)).toHaveAttribute('aria-pressed', 'true');
  // The width of a cell in the watcher's box: its width over the columns the host's view holds.
  const cellWidth = async () => (await watcher.locator('.host-view').boundingBox()).width / await store(watcher, 'room', (r) => r.hostView.cols);
  await expect.poll(cellWidth).toBeGreaterThan(0);
  const whole = await cellWidth();

  await tab(host, 'ANSI').click();
  await store(host, 'workspace', (w) => { w.ansiZoom = 0.5; });
  await expect.poll(() => store(watcher, 'room', (r) => r.hostView.zoom)).toBe(0.5);
  await expect.poll(async () => (await cellWidth()) / whole).toBeCloseTo(0.5, 1);
});

test('Leave returns the watcher to the lobby, and the host\'s count goes to 0', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const watcher = await watcherPage(context, room);
  await watcher.goto('/');
  await joinFromCard(watcher);
  await expect(tile(shown(host, 'host-room'), 'Here now')).toHaveText('1');

  await chat(watcher).getByRole('button', { name: 'Exit' }).click();
  await expect(shown(watcher, 'lobby').getByRole('heading', { name: 'Public rooms', exact: true })).toBeFocused();
  expect(await store(watcher, 'room', (r) => r.role)).toBe(null);
  await expect(tile(shown(host, 'host-room'), 'Here now')).toHaveText('0');
});

test('End room on the host puts the watcher back in the lobby with "The host ended the room"', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const watcher = await watcherPage(context, room);
  await watcher.goto('/');
  await joinFromCard(watcher);

  await shown(host, 'host-room').getByRole('button', { name: 'End room' }).click();
  await host.getByRole('dialog', { name: 'End the room?' }).getByRole('button', { name: 'End room' }).click();
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
  await expect(tile(shown(host, 'host-room'), 'Here now')).toHaveText('1');
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
  // (the chat panel narrows the view while in the room, so the cells are found again each time)
  const pixels = async () => {
    const [on, off] = [await cellPoint(watcher, 5, 3, 0), await cellPoint(watcher, 20, 6)];
    return [await screenPixel(watcher, on.x, on.y), await screenPixel(watcher, off.x, off.y)];
  };
  const shownBefore = await pixels();
  await tab(watcher, 'PIXEL').click();
  await settled(watcher);
  const pixelViewPixel = async () => {   // the middle of the picture, wherever the view puts it
    const view = await watcher.locator('article[tabindex="0"] .display canvas').boundingBox();
    return screenPixel(watcher, view.x + view.width / 2, view.y + view.height / 2);
  };
  const pixelBefore = await pixelViewPixel();

  await joinFromCard(watcher);
  await tab(host, 'ANSI').click();
  await editAt(host, 5, 3);
  await host.keyboard.type('Q');
  await expect.poll(() => watcherCells(watcher)).toEqual(await hostCells(host));
  expect(await watcherCells(watcher)).not.toEqual(before.cells);
  const art = await watching(watcher).getByLabel('The room\'s art').boundingBox();
  await watcher.mouse.move(art.x + art.width / 2, art.y + art.height / 2);
  await watcher.mouse.wheel(0, 200);   // looking around, then tracking again
  await trackTag(watcher).click();
  await expect(trackTag(watcher)).toHaveAttribute('aria-pressed', 'true');

  await tab(watcher, 'ANSI').click();
  await settled(watcher);
  await expect.poll(pixels).toEqual(shownBefore);   // the canvas draws after the tab shows
  await tab(watcher, 'PIXEL').click();
  await settled(watcher);
  await expect.poll(pixelViewPixel).toEqual(pixelBefore);
  expect(await own()).toEqual(before);
  expect(await store(watcher, 'room', (r) => r.status)).toBe('live');   // still watching

  await tab(watcher, 'SOCIAL').click();
  await chat(watcher).getByRole('button', { name: 'Exit' }).click();
  await expect(shown(watcher, 'lobby')).toBeVisible();
  expect(await own()).toEqual(before);
});
