// The build with path addresses (VITE_ADDRESSES=path): its own project in playwright.config.js. There the room in
// the address is in the same query a link from outside and a return from the server use.
import { test, expect, tab, store, startScreen } from './support.js';
import { fakeRoom, fakeServer, ROOM_ID, goLive, watcherPage, followLink } from './social-support.js';

const selected = (page, label) => expect(tab(page, label)).toHaveAttribute('aria-selected', 'true');
const at = (page, address) => expect.poll(() => { const url = new URL(page.url()); return url.pathname + url.search; }).toBe(address);
const asked = (page) => page.getByRole('dialog', { name: 'Join this room?' });
const live = (page) => expect.poll(() => store(page, 'room', (r) => r.status), { timeout: 20_000, intervals: [100] }).toBe('live');
const joins = (room) => room.received.filter((r) => r.msg.type === 'join').length;

test('an address deep in the app loads on its own, and tabs are paths', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/social/sign-in');
  await selected(page, 'SOCIAL');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await tab(page, 'PIXEL').click();   // nothing open: the start screen
  await at(page, '/');
  await page.goBack();
  await at(page, '/social/sign-in');
});

test('a link followed joins, on the room\'s own address; a watcher\'s reload is back in the room, unasked, with the room still in the address', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const watcher = await watcherPage(context, room);
  await followLink(watcher);
  await live(watcher);
  await at(watcher, `/social?room=${ROOM_ID}`);

  await watcher.reload();
  await live(watcher);
  await expect(asked(watcher)).toHaveCount(0);
  await at(watcher, `/social?room=${ROOM_ID}`);
  expect(joins(room)).toBe(2);
});

test('a link from outside asks, and Not now leaves a clean address', async ({ context }) => {
  const room = fakeRoom();
  const watcher = await watcherPage(context, room);
  await watcher.goto(`/?room=${ROOM_ID}`);
  await asked(watcher).getByRole('button', { name: 'Not now' }).click();
  await selected(watcher, 'SOCIAL');
  await at(watcher, '/social');
  await tab(watcher, 'PIXEL').click();
  await at(watcher, '/');
  expect(joins(room)).toBe(0);
});

test('a return from the server is read once: it leaves the address, and no later step brings it back', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/?verified=1');
  await selected(page, 'SOCIAL');
  await expect(page.getByText('Your email is confirmed')).toBeVisible();
  await at(page, '/social');
  await tab(page, 'PIXEL').click();
  await at(page, '/');
  await page.reload();
  await tab(page, 'SOCIAL').click();
  await expect(page.getByText('Your email is confirmed')).toHaveCount(0);
});

test('a narrow window keeps a return for a computer; widened, it\'s read once and doesn\'t come back', async ({ page }) => {
  await fakeServer(page);
  await page.setViewportSize({ width: 500, height: 800 });
  await page.goto('/?verified=1');
  await expect.poll(() => new URL(page.url()).search).toBe('?verified=1');

  await page.setViewportSize({ width: 1400, height: 900 });
  await tab(page, 'SOCIAL').click();
  await expect(page.getByText('Your email is confirmed')).toBeVisible();
  await expect.poll(() => new URL(page.url()).search).toBe('');
  await tab(page, 'PIXEL').click();
  await at(page, '/');
  await page.reload();
  await tab(page, 'SOCIAL').click();
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

    // Here the room in a tab's address is read before the router looks, so it stays on that tab: the link waits for SOCIAL.
    await page.goto(`/pixel?room=${ROOM_ID}`);
    await startScreen(page);   // nothing open
    await expect(consent(page)).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    expect(server.requests).toEqual([]);
    await tab(page, 'SOCIAL').click();
    await consent(page).getByRole('checkbox').check();
    await consent(page).getByRole('button', { name: 'Accept' }).click();
    await expect(asked(page)).toBeVisible();
  });
});
