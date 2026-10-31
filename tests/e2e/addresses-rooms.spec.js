// The room you're watching in the address: Back, Forward and reload, with a real history (its entries'
// marks are what tell your own room from a link).
import { test, expect, tab, store, openApp } from './support.js';
import { fakeRoom, ROOM_ID, shown, goLive, watcherPage, joinFromCard, followLink } from './social-support.js';

const UNAVAILABLE = "This room isn't available";
const selected = (page, label) => expect(tab(page, label)).toHaveAttribute('aria-selected', 'true');
const hash = (page, path) => expect.poll(() => new URL(page.url()).hash).toBe(`#${path}`);
const asked = (page) => page.getByRole('dialog', { name: 'Join this room?' });
const status = (page) => store(page, 'room', (r) => r.status);
const live = (page) => expect.poll(() => status(page), { timeout: 20_000, intervals: [100] }).toBe('live');
const chat = (page) => page.getByRole('complementary', { name: 'Chat' });
const outOfRoom = (page) => expect.poll(() => store(page, 'room', (r) => r.role)).toBe(null);
const joins = (room) => room.received.filter((r) => r.msg.type === 'join').length;

// A host live in `room`, and a watcher on it from the lobby's card, on /social?room=.
async function watching(host, context, room) {
  await goLive(host, room);
  const watcher = await watcherPage(context, room);
  await watcher.goto('/');
  await joinFromCard(watcher);
  await hash(watcher, `/social?room=${ROOM_ID}`);
  return watcher;
}

test('a watcher reloading on PIXEL is back in the room, unasked, still on PIXEL', async ({ page: host, context }) => {
  const room = fakeRoom();
  const watcher = await watching(host, context, room);
  await tab(watcher, 'PIXEL').click();
  await hash(watcher, `/pixel?room=${ROOM_ID}`);

  await watcher.reload();
  await live(watcher);
  await expect(asked(watcher)).toHaveCount(0);
  await selected(watcher, 'PIXEL');
  await hash(watcher, `/pixel?room=${ROOM_ID}`);
  expect(joins(room)).toBe(2);
});

test('a pasted #/pixel?room=<id> asks first, on SOCIAL; Not now leaves /social and no socket', async ({ context }) => {
  const room = fakeRoom();
  const watcher = await watcherPage(context, room);
  await watcher.goto(`/#/pixel?room=${ROOM_ID}`);
  await expect(asked(watcher)).toBeVisible();
  await selected(watcher, 'SOCIAL');
  expect(room.received).toEqual([]);

  await asked(watcher).getByRole('button', { name: 'Not now' }).click();
  await expect(asked(watcher)).toHaveCount(0);
  await hash(watcher, '/social');
  await outOfRoom(watcher);
  expect(room.received).toEqual([]);
});

test('a link pasted over a page with the app open asks too, and leaves no entry to ask again', async ({ context }) => {
  const room = fakeRoom();
  const watcher = await watcherPage(context, room);
  await watcher.goto('/');
  await hash(watcher, '/pixel');
  await watcher.evaluate((id) => { location.hash = `#/pixel?room=${id}`; }, ROOM_ID);
  await expect(asked(watcher)).toBeVisible();
  await asked(watcher).getByRole('button', { name: 'Not now' }).click();
  await hash(watcher, '/social');

  await watcher.goBack();
  await hash(watcher, '/pixel');
  await expect(asked(watcher)).toHaveCount(0);
  expect(room.received).toEqual([]);
});

test('a followed link: Join, then Back leaves the room and lands on the lobby, in Phosphor; Forward joins again, unasked', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const watcher = await watcherPage(context, room);
  await followLink(watcher);
  await live(watcher);
  await hash(watcher, `/social?room=${ROOM_ID}`);

  await watcher.goBack();
  await hash(watcher, '/social');
  await outOfRoom(watcher);
  await expect(shown(watcher, 'lobby')).toBeVisible();

  await watcher.goForward();
  await live(watcher);
  await expect(asked(watcher)).toHaveCount(0);
  await hash(watcher, `/social?room=${ROOM_ID}`);
  expect(joins(room)).toBe(2);
});

test('exit, reload, Back onto the room\'s entry: not rejoined, ?room= gone', async ({ page: host, context }) => {
  const room = fakeRoom();
  const watcher = await watching(host, context, room);
  await tab(watcher, 'PIXEL').click();
  await hash(watcher, `/pixel?room=${ROOM_ID}`);
  await chat(watcher).getByRole('button', { name: 'Exit' }).click();
  await hash(watcher, '/pixel');

  await watcher.reload();
  await hash(watcher, '/pixel');
  await watcher.goBack();
  await hash(watcher, '/social');
  await selected(watcher, 'SOCIAL');
  await expect(asked(watcher)).toHaveCount(0);
  await outOfRoom(watcher);
  expect(joins(room)).toBe(1);
});

test('Forward onto a room that now wants a password shows its form on SOCIAL', async ({ page: host, context }) => {
  const room = fakeRoom();
  const watcher = await watching(host, context, room);
  await tab(watcher, 'PIXEL').click();
  await hash(watcher, `/pixel?room=${ROOM_ID}`);
  await watcher.goBack();
  await watcher.goBack();
  await hash(watcher, '/social');
  await outOfRoom(watcher);

  room.setup.password = 'hunter22';
  await watcher.evaluate(() => history.go(2));   // right onto PIXEL's entry: the form isn't there
  await selected(watcher, 'SOCIAL');
  await expect(shown(watcher, 'watch-room').getByRole('heading', { name: 'This room needs a password' })).toBeVisible();
  await hash(watcher, `/social?room=${ROOM_ID}`);
});

test('Forward onto a room that ended shows why on SOCIAL, and the entry loses ?room=', async ({ page: host, context }) => {
  const room = fakeRoom();
  const watcher = await watching(host, context, room);
  await tab(watcher, 'PIXEL').click();
  await hash(watcher, `/pixel?room=${ROOM_ID}`);
  await watcher.goBack();
  await watcher.goBack();
  await hash(watcher, '/social');
  await outOfRoom(watcher);

  await store(host, 'room', (r) => r.endRoom());
  await expect.poll(() => store(host, 'room', (r) => r.role)).toBe(null);
  await watcher.evaluate(() => history.go(2));   // right onto PIXEL's entry: the words aren't there
  await selected(watcher, 'SOCIAL');
  await expect(watcher.getByText(UNAVAILABLE)).toBeVisible();
  await hash(watcher, '/social');
  await outOfRoom(watcher);
});

test('a host\'s reload lands where it was without ?room=, and never joins its own ended room', async ({ page: host }) => {
  const room = fakeRoom();
  await goLive(host, room);
  await hash(host, `/social?room=${ROOM_ID}`);
  await tab(host, 'PIXEL').click();
  await hash(host, `/pixel?room=${ROOM_ID}`);
  host.on('dialog', (dialog) => dialog.accept());   // the page-closing prompt

  await host.reload();
  await hash(host, '/pixel');
  await selected(host, 'PIXEL');
  await expect(asked(host)).toHaveCount(0);
  await outOfRoom(host);
  expect(room.received.filter((r) => r.msg.type === 'join')).toEqual([]);
});

for (const typed of ['garbage', 'a&room=b']) {
  test(`a typed ?room=${typed}: no socket, the unavailable words, a clean address`, async ({ context }) => {
    const room = fakeRoom();
    const watcher = await watcherPage(context, room);
    await watcher.goto(`/#/social?room=${typed}`);
    await asked(watcher).getByRole('button', { name: 'Join', exact: true }).click();
    await expect(watcher.getByText(UNAVAILABLE)).toBeVisible();
    await hash(watcher, '/social');
    expect(room.received).toEqual([]);
  });
}

test('a server ?room= link on a phone still stays in the URL for a computer', async ({ context }) => {
  const room = fakeRoom();
  const watcher = await watcherPage(context, room);
  await watcher.setViewportSize({ width: 700, height: 900 });
  await watcher.goto(`/?room=${ROOM_ID}`);
  await selected(watcher, 'PIXEL');
  await expect.poll(() => new URL(watcher.url()).search).toBe(`?room=${ROOM_ID}`);
  await expect(asked(watcher)).toHaveCount(0);
  expect(room.received).toEqual([]);
});

test('a ?room= moved between a phone\'s tabs is no mark of yours: widened and reloaded, it still asks', async ({ context }) => {
  const room = fakeRoom();
  const watcher = await watcherPage(context, room);
  await watcher.setViewportSize({ width: 700, height: 900 });
  await openApp(watcher);
  await watcher.goto(`/#/pixel?room=${ROOM_ID}`);
  await hash(watcher, `/pixel?room=${ROOM_ID}`);
  await tab(watcher, 'ANSI').click();
  await hash(watcher, `/ansi?room=${ROOM_ID}`);

  await watcher.setViewportSize({ width: 1400, height: 900 });
  await watcher.reload();
  await expect(asked(watcher)).toBeVisible();
  expect(room.received).toEqual([]);
});
