// Path addresses, the web build's: the room in the address is in the same query a link from outside and a return
// from the server use, and an old #/ address is the path address it means.
import { test, expect, store, startScreen, openApp, autosaved } from './support.js';
import { fakeRoom, fakeServer, ROOM_ID, goLive, watcherPage, followLink, openLobby, shown, selected, asked, live, addressIs as at } from './social-support.js';

// Steps that move the address with nothing open (the art tabs are off then): Sign in opening, and Escape closing it.
async function stepAway(page) {
  await shown(page, 'lobby').getByRole('button', { name: 'Sign in' }).click();
  await at(page, '/social/sign-in');
  await page.keyboard.press('Escape');
  await at(page, '/');
}
const joins = (room) => room.received.filter((r) => r.msg.type === 'join').length;

test('an address deep in the app loads on its own, and closing its page and Back are paths', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/social/sign-in');
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
  await expect(shown(page, 'sign-in').getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');   // nothing open under it: the start screen
  await expect(shown(page, 'sign-in')).toHaveCount(0);
  await at(page, '/');
  await page.goBack();
  await at(page, '/social/sign-in');
  await expect(shown(page, 'sign-in')).toBeVisible();
});

test('a link followed joins, on the room\'s own address; a watcher\'s reload is back in the room, unasked, with the room still in the address', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const watcher = await watcherPage(context, room);
  await followLink(watcher);
  await live(watcher);
  await selected(watcher, 'ROOM');
  await at(watcher, `/room?room=${ROOM_ID}`);

  await watcher.reload();
  await live(watcher);
  await expect(asked(watcher)).toHaveCount(0);
  await selected(watcher, 'ROOM');
  await at(watcher, `/room?room=${ROOM_ID}`);
  expect(joins(room)).toBe(2);
});

test('a link from outside asks, and Not now leaves a clean address', async ({ context }) => {
  const room = fakeRoom();
  const watcher = await watcherPage(context, room);
  await watcher.goto(`/?room=${ROOM_ID}`);
  await asked(watcher).getByRole('button', { name: 'Not now' }).click();
  await expect(asked(watcher)).toHaveCount(0);
  await expect(shown(watcher, 'lobby')).toBeVisible();
  await startScreen(watcher);
  await at(watcher, '/');
  expect(joins(room)).toBe(0);
});

test('a return from the server is read once: it leaves the address, and no later step brings it back', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/?verified=1');
  await expect(shown(page, 'lobby').getByText('Your email is confirmed')).toBeVisible();
  await at(page, '/');
  await stepAway(page);
  await page.reload();
  await openLobby(page);
  await expect(page.getByText('Your email is confirmed')).toHaveCount(0);
});

test('a narrow window reads a return as a wide one does: once, and it doesn\'t come back', async ({ page }) => {
  await fakeServer(page);
  await page.setViewportSize({ width: 500, height: 800 });
  await page.goto('/?verified=1');
  await openLobby(page);
  await expect(page.getByText('Your email is confirmed')).toBeVisible();
  await expect.poll(() => new URL(page.url()).search).toBe('');
  await stepAway(page);
  await page.reload();
  await openLobby(page);
  await expect(page.getByText('Your email is confirmed')).toHaveCount(0);
});

test.describe('before SOCIAL\'s question is answered', () => {
  test.use({ consented: false });
  const consent = (page) => page.getByRole('dialog', { name: 'Before you use Social rooms' });

  test('a link waits for the answer: Not now leaves a clean address, and accepting goes on to it', async ({ page }) => {
    const server = await fakeServer(page);
    await page.goto(`/?room=${ROOM_ID}`);
    await consent(page).getByRole('button', { name: 'Not now' }).click();
    await startScreen(page);
    await at(page, '/');
    expect(server.requests).toEqual([]);

    // On a tab's address too, the link asks first, and nothing reaches the network until it's answered.
    await page.goto(`/pixel?room=${ROOM_ID}`);
    await startScreen(page);   // nothing open
    await expect(consent(page)).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(server.requests).toEqual([]);
    await consent(page).getByRole('checkbox').check();
    await consent(page).getByRole('button', { name: 'Accept' }).click();
    await expect(asked(page)).toBeVisible();
  });
});

// Links from before path addresses: each loads as the path address it means, in place of it (no step of its own).
test('an old #/ room link asks, as its path address does, and Back never lands on a #/ address', async ({ context }) => {
  const room = fakeRoom();
  const watcher = await watcherPage(context, room);
  await watcher.goto(`/social?room=${ROOM_ID}`);
  await expect(asked(watcher)).toBeVisible();
  await at(watcher, '/');   // the room read, and the lobby's address giving way: nothing open, the start screen

  await watcher.goto('/social/sign-in');   // a page load before it, for Back (from / it would be the same page)
  await at(watcher, '/social/sign-in');
  await watcher.goto(`/#/social?room=${ROOM_ID}`);
  await expect(asked(watcher)).toBeVisible();
  await at(watcher, '/');
  await watcher.goBack();
  await at(watcher, '/social/sign-in');
  expect(joins(room)).toBe(0);
});

test('an old ?plugins=off#/ansi link is /ansi?plugins=off, on ANSI with plugins off', async ({ page }) => {
  await openApp(page);
  await autosaved(page);
  await page.goto('about:blank');
  await page.goto('/?plugins=off#/ansi');
  await selected(page, 'ANSI');
  await at(page, '/ansi?plugins=off');
  expect(await store(page, 'plugins', (p) => p.off)).toBe(true);
});

test('a return from the server in an old #/ link\'s query is read as one in the address is', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/#/?verified=1');
  await expect(shown(page, 'lobby').getByText('Your email is confirmed')).toBeVisible();
  await at(page, '/');
});
