// The room you're watching in the address: Back, Forward and reload, with a real history (its entries'
// marks are what tell your own room from a link).
import { test, expect, tab, store, openApp } from './support.js';
import { fakeRoom, member, ROOM_ID, shown, goLive, watcherPage, joinFromCard, followLink } from './social-support.js';

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
    await expect(watcher.getByText(UNAVAILABLE)).toBeVisible();
    await expect(asked(watcher)).toHaveCount(0);
    await hash(watcher, '/social');
    expect(room.received).toEqual([]);
  });
}

test('a link to a room you already left asks, from the address or a page load', async ({ page: host, context }) => {
  const room = fakeRoom();
  const watcher = await watching(host, context, room);
  await chat(watcher).getByRole('button', { name: 'Exit' }).click();
  await hash(watcher, '/social');

  await watcher.evaluate((id) => { location.hash = `#/pixel?room=${id}`; }, ROOM_ID);
  await expect(asked(watcher)).toBeVisible();
  await asked(watcher).getByRole('button', { name: 'Not now' }).click();

  await watcher.goto('about:blank');
  await watcher.goto(`/#/social?room=${ROOM_ID}`);
  await expect(asked(watcher)).toBeVisible();
  expect(joins(room)).toBe(1);
});

test('with storage that can\'t be read, reloading on an entry of yours doesn\'t join', async ({ page: host, context }) => {
  const room = fakeRoom();
  const watcher = await watching(host, context, room);
  await watcher.addInitScript(() => {
    const read = Storage.prototype.getItem;
    Storage.prototype.getItem = function getItem(key) {
      if (key === 'phosphor-left-rooms') throw new Error('no storage');
      return read.call(this, key);
    };
  });

  await watcher.reload();
  await hash(watcher, '/social');
  await expect(asked(watcher)).toHaveCount(0);
  await outOfRoom(watcher);
  expect(joins(room)).toBe(1);
});

test('signing in while watching, Back from the room you come back to stays in it', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const watcher = await watcherPage(context, room, { signsInAs: member({ id: 'u_2', username: 'pixel_wren', name: 'pixel_wren' }) });
  await watcher.goto('/');
  await joinFromCard(watcher);
  await chat(watcher).getByRole('button', { name: 'Sign in to chat' }).click();
  const form = shown(watcher, 'sign-in');
  await hash(watcher, `/social/sign-in?room=${ROOM_ID}`);
  await form.getByLabel('Email or username').fill('pixel_wren');
  await form.getByLabel('Password').fill('correct horse battery');
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect.poll(() => joins(room)).toBe(2);
  await live(watcher);
  await hash(watcher, `/social?room=${ROOM_ID}`);

  await watcher.goBack();
  await hash(watcher, `/social?room=${ROOM_ID}`);
  expect(await status(watcher)).toBe('live');
  await expect(shown(watcher, 'watch-room')).toBeVisible();
  expect(joins(room)).toBe(2);
});

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

// Hosting: going live is a step, and Back past it asks. The browser has moved already by then, so while
// it asks the address is where Back was going; a refusal puts it back with no navigation of its own.
const endRoom = (page) => page.getByRole('dialog', { name: 'End the room?' });
const entry = (page) => page.evaluate(() => [history.state.position, history.length]);
const LIVE = `/social?room=${ROOM_ID}`;
// What the router does from here on: each navigation's address and how it failed (4 is refused by a guard).
const noteNavigations = (page) => page.evaluate(() => {
  window.navigated = [];
  document.querySelector('#phosphor').__vue_app__.config.globalProperties.$router.afterEach((to, from, failure) => window.navigated.push([to.fullPath, failure?.type ?? null]));
});
const navigated = (page) => page.evaluate(() => window.navigated);

test('going live is a step; Back past it from PIXEL asks over PIXEL', async ({ page: host }) => {
  await goLive(host, fakeRoom());
  await hash(host, LIVE);
  await tab(host, 'PIXEL').click();
  await hash(host, `/pixel?room=${ROOM_ID}`);

  await host.goBack();   // from PIXEL to the host's page, past nothing
  await hash(host, LIVE);
  await expect(endRoom(host)).toHaveCount(0);
  await host.goForward();
  await hash(host, `/pixel?room=${ROOM_ID}`);

  await host.evaluate(() => history.go(-2));
  await expect(endRoom(host)).toBeVisible();
  await selected(host, 'PIXEL');
});

test('Cancel: still live, URL unchanged, Back asks again', async ({ page: host }) => {
  const room = fakeRoom();
  await goLive(host, room);
  await hash(host, LIVE);
  const before = await entry(host);
  await noteNavigations(host);

  await host.goBack();
  await expect(endRoom(host)).toBeVisible();
  await endRoom(host).getByRole('button', { name: 'Cancel' }).click();
  await expect(endRoom(host)).toHaveCount(0);
  await hash(host, LIVE);
  await expect.poll(() => entry(host)).toEqual(before);
  expect(await navigated(host)).toEqual([['/social/start', 4]]);   // refused, and putting it back is no navigation
  expect(await status(host)).toBe('live');
  await expect(shown(host, 'host-room')).toBeVisible();
  expect(room.received.filter((r) => r.msg.type === 'end')).toEqual([]);

  await host.goBack();
  await expect(endRoom(host)).toBeVisible();
  await endRoom(host).getByRole('button', { name: 'End room' }).click();
  await hash(host, '/social/start');
  await outOfRoom(host);
  await expect(shown(host, 'start-room')).toBeVisible();
  await expect.poll(() => room.received.filter((r) => r.msg.type === 'end').length).toBe(1);
});

test('Back past several entries at once asks once: Cancel puts them all back, End lands where it was going', async ({ page: host }) => {
  await goLive(host, fakeRoom());
  await tab(host, 'PIXEL').click();
  await hash(host, `/pixel?room=${ROOM_ID}`);
  const before = await entry(host);

  await host.evaluate(() => history.go(-3));   // PIXEL, the host's page, Setup room: the lobby
  await expect(endRoom(host)).toBeVisible();
  await hash(host, '/social');
  await endRoom(host).getByRole('button', { name: 'Cancel' }).click();
  await hash(host, `/pixel?room=${ROOM_ID}`);
  await expect.poll(() => entry(host)).toEqual(before);
  await selected(host, 'PIXEL');
  expect(await status(host)).toBe('live');

  await host.evaluate(() => history.go(-3));
  await expect(endRoom(host)).toBeVisible();
  await endRoom(host).getByRole('button', { name: 'End room' }).click();
  await outOfRoom(host);
  await hash(host, '/social');
  await selected(host, 'SOCIAL');
  await expect(shown(host, 'lobby')).toBeVisible();
});

for (const presses of [1, 3]) {
  test(`${presses} more Back pressed while it asks: one question, and its answer stands`, async ({ page: host }) => {
    await goLive(host, fakeRoom());
    await hash(host, LIVE);
    const before = await entry(host);
    const pressed = async () => {
      await host.goBack();
      await expect(endRoom(host)).toBeVisible();
      for (let i = 0; i < presses; i++) await host.evaluate(() => history.back());
      await hash(host, '/social/start');   // those steps are undone
      await expect(endRoom(host)).toHaveCount(1);
    };

    await pressed();
    await endRoom(host).getByRole('button', { name: 'Cancel' }).click();
    await hash(host, LIVE);
    await expect.poll(() => entry(host)).toEqual(before);
    await expect(endRoom(host)).toHaveCount(0);
    expect(await status(host)).toBe('live');

    await pressed();
    await endRoom(host).getByRole('button', { name: 'End room' }).click();
    await outOfRoom(host);
    await hash(host, '/social/start');
    await expect(shown(host, 'start-room')).toBeVisible();
    await expect(endRoom(host)).toHaveCount(0);
  });
}

test('an address pasted while live asks too: Cancel puts it back', async ({ page: host }) => {
  await goLive(host, fakeRoom());
  await hash(host, LIVE);
  await host.evaluate(() => { location.hash = '#/pixel'; });
  await expect(endRoom(host)).toBeVisible();
  await endRoom(host).getByRole('button', { name: 'Cancel' }).click();
  await hash(host, LIVE);
  await selected(host, 'SOCIAL');
  expect(await status(host)).toBe('live');
});

test('Forward pressed while it asks changes nothing: Cancel is still the way back', async ({ page: host }) => {
  await goLive(host, fakeRoom());
  await hash(host, LIVE);
  await host.goBack();
  await expect(endRoom(host)).toBeVisible();

  await host.evaluate(() => history.forward());
  await hash(host, '/social/start');
  await expect(endRoom(host)).toBeVisible();
  await endRoom(host).getByRole('button', { name: 'Cancel' }).click();
  await hash(host, LIVE);
  expect(await status(host)).toBe('live');
});

test('after End, Forward and Back on the room\'s entries don\'t rejoin', async ({ page: host }) => {
  const room = fakeRoom();
  await goLive(host, room);
  await tab(host, 'PIXEL').click();
  await hash(host, `/pixel?room=${ROOM_ID}`);
  await host.evaluate(() => history.go(-2));
  await endRoom(host).getByRole('button', { name: 'End room' }).click();
  await hash(host, '/social/start');
  await outOfRoom(host);

  await host.goForward();
  await hash(host, '/social');
  await host.goForward();
  await hash(host, '/pixel');
  await selected(host, 'PIXEL');
  await host.goBack();
  await hash(host, '/social');
  await selected(host, 'SOCIAL');
  await expect(endRoom(host)).toHaveCount(0);
  await expect(asked(host)).toHaveCount(0);
  await outOfRoom(host);
  expect(joins(room)).toBe(0);
});
