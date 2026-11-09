// The build with path addresses (VITE_ADDRESSES=path): its own project in playwright.config.js. There the room in
// the address is in the same query a link from outside and a return from the server use.
import { test, expect, tab, store, startScreen } from './support.js';
import { fakeRoom, fakeServer, ROOM_ID, goLive, watcherPage, followLink, openLobby, shown } from './social-support.js';

const selected = (page, label) => expect(tab(page, label)).toHaveAttribute('aria-selected', 'true');
const at = (page, address) => expect.poll(() => { const url = new URL(page.url()); return url.pathname + url.search; }).toBe(address);
const asked = (page) => page.getByRole('dialog', { name: 'Join this room?' });
const live = (page) => expect.poll(() => store(page, 'room', (r) => r.status), { timeout: 20_000, intervals: [100] }).toBe('live');
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

test('a narrow window keeps a return for a computer; widened, it\'s read once and doesn\'t come back', async ({ page }) => {
  await fakeServer(page);
  await page.setViewportSize({ width: 500, height: 800 });
  await page.goto('/?verified=1');
  await expect.poll(() => new URL(page.url()).search).toBe('?verified=1');

  await page.setViewportSize({ width: 1400, height: 900 });
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
  const consent = (page) => page.getByRole('dialog', { name: 'Before you open SOCIAL' });

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
