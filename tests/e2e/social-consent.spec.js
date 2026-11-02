// SOCIAL's first question: nothing from the tab runs until it's answered, however you arrive.
import { test, expect, tab, store, seedConsent, openApp } from './support.js';
import { fakeServer, fakeRoom, goLive, watcherPage, joinFromCard, shown, asked, hash, selected, live, ROOM_ID } from './social-support.js';
import { CONSENT_KEY, CONSENT_VERSION } from '../../src/social/consent.js';

test.use({ consented: false });

const TERMS = /^I'm 13 or older and agree to the Terms\s*, Privacy Policy\s*, and Community Guidelines$/;
const consent = (page) => page.getByRole('dialog', { name: 'Before you open SOCIAL' });
const agree = (page) => consent(page).getByRole('checkbox', { name: TERMS });
const notNow = (page) => consent(page).getByRole('button', { name: 'Not now' });
const accept = (page) => consent(page).getByRole('button', { name: 'Accept' });
async function accepted(page) {
  await agree(page).check();
  await accept(page).click();
  await expect(consent(page)).toHaveCount(0);
}
// Everything the page asked of anywhere but the app's own origin.
const elsewhere = (page) => {
  const seen = [];
  page.on('request', (request) => { if (!request.url().startsWith('http://localhost:4180') && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) seen.push(request.url()); });
  page.on('websocket', (socket) => seen.push(socket.url()));
  return seen;
};
const databases = (page) => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
// Nothing from SOCIAL ran: no request or socket, no key, no pass.
async function nothingRan(page, server, seen) {
  await page.waitForLoadState('networkidle');
  expect(seen).toEqual([]);
  expect(server.requests).toEqual([]);
  expect(server.lobby.received).toEqual([]);
  expect(await databases(page)).not.toContain('phosphor-social');
  expect(await store(page, 'social', (s) => [s.supported, s.pass, s.lobbyWanted])).toEqual([null, null, false]);
}

test('the first SOCIAL tab asks, and nothing reaches the network until it\'s accepted', async ({ page }) => {
  const seen = elsewhere(page);
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(consent(page)).toHaveCount(0);   // only the tab asks
  await tab(page, 'SOCIAL').click();
  await expect(consent(page)).toBeVisible();
  await nothingRan(page, server, seen);
  await expect(page.locator('.people-tab')).toHaveCount(0);

  await accepted(page);
  await expect(shown(page, 'lobby')).toBeVisible();
  await selected(page, 'SOCIAL');
  await expect.poll(() => server.lobby.received.map((m) => m.type)).toEqual(['hello']);
  expect(server.sent('GET', '/api/me')).toHaveLength(1);
});

test('Accept stays off until the 13-or-older box is ticked', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/');
  await tab(page, 'SOCIAL').click();
  await expect(accept(page)).toBeDisabled();
  await expect(consent(page).locator('label')).toHaveText('I\'m 13 or older and agree to the Terms, Privacy Policy, and Community Guidelines');
  await agree(page).check();
  await expect(accept(page)).toBeEnabled();
  await agree(page).uncheck();
  await expect(accept(page)).toBeDisabled();
});

test('the modal says what the lobby, watching and starting a room mean, and how to behave', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/');
  await tab(page, 'SOCIAL').click();
  for (const heading of ['The lobby', 'Watching a room', 'Starting a room', 'Be kind']) {
    await expect(consent(page).getByRole('heading', { name: heading })).toBeVisible();
  }
  await expect(consent(page)).toContainText('each of you can see the other\'s IP address');
  await expect(consent(page)).toContainText('use a VPN');
  await expect(consent(page)).toContainText('including the original image');
  await expect(consent(page)).toContainText('snapshot of the canvas');
});

test('Not now goes back to the tab you came from, as if you never left it, and asks again next time', async ({ page }) => {
  const seen = elsewhere(page);
  const server = await fakeServer(page);
  await openApp(page);   // on ANSI
  await tab(page, 'SAUCE').click();
  await tab(page, 'SOCIAL').click();
  await notNow(page).click();
  await expect(consent(page)).toHaveCount(0);
  await selected(page, 'SAUCE');
  await hash(page, '/sauce');
  await nothingRan(page, server, seen);
  await page.goBack();   // no SOCIAL left to land on
  await selected(page, 'SAUCE');
  await expect(consent(page)).toHaveCount(0);

  await tab(page, 'SOCIAL').click();
  await expect(consent(page)).toBeVisible();
  await expect(agree(page)).not.toBeChecked();
});

test('Back with the question up leaves it, and a link\'s room with it', async ({ page }) => {
  const server = await fakeServer(page);
  await page.goto('/#/pixel');
  await page.evaluate((id) => { location.hash = `#/pixel?room=${id}`; }, ROOM_ID);
  await expect(consent(page)).toBeVisible();
  await page.goBack();
  await selected(page, 'PIXEL');
  await expect(consent(page)).toHaveCount(0);
  await tab(page, 'SOCIAL').click();
  await accepted(page);
  await expect.poll(() => server.lobby.received.map((m) => m.type)).toEqual(['hello']);
  await expect(asked(page)).toHaveCount(0);
});

test('Escape declines as Not now does', async ({ page }) => {
  const seen = elsewhere(page);
  const server = await fakeServer(page);
  await openApp(page);
  await tab(page, 'SOCIAL').click();
  await expect(consent(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(consent(page)).toHaveCount(0);
  await selected(page, 'ANSI');
  await hash(page, '/ansi');
  await nothingRan(page, server, seen);
  expect(await page.evaluate((key) => localStorage.getItem(key), CONSENT_KEY)).toBe(null);
});

test('with no tab to go back to, Not now lands on the editor at a clean address, with no room asked', async ({ page }) => {
  const seen = elsewhere(page);
  const server = await fakeServer(page);
  await page.goto(`/#/social/sign-in`);
  await notNow(page).click();
  await selected(page, 'PIXEL');
  await hash(page, '/pixel');
  await page.goto(`/?room=${ROOM_ID}`);
  await notNow(page).click();
  await selected(page, 'PIXEL');
  await hash(page, '/pixel');
  expect(new URL(page.url()).search).toBe('');
  await nothingRan(page, server, seen);
  await expect(asked(page)).toHaveCount(0);

  // Accepted later, the link it turned down stays turned down.
  await tab(page, 'SOCIAL').click();
  await accepted(page);
  await expect(shown(page, 'lobby')).toBeVisible();
  await expect.poll(() => server.lobby.received.map((m) => m.type)).toEqual(['hello']);
  await expect(asked(page)).toHaveCount(0);
});

test('a second visit doesn\'t ask', async ({ page }) => {
  const server = await fakeServer(page);
  await page.goto('/');
  await tab(page, 'SOCIAL').click();
  await accepted(page);
  await expect.poll(() => server.lobby.received.length).toBe(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), CONSENT_KEY)).toBe(String(CONSENT_VERSION));

  await page.reload();
  await expect(shown(page, 'lobby')).toBeVisible();
  await expect(consent(page)).toHaveCount(0);
  await expect.poll(() => server.lobby.received.length).toBe(2);
});

test('a new version of the policies asks again', async ({ page, context }) => {
  await seedConsent(context, CONSENT_VERSION - 1);
  const seen = elsewhere(page);
  const server = await fakeServer(page);
  await page.goto('/#/social');
  await expect(consent(page)).toBeVisible();
  await nothingRan(page, server, seen);
});

// Each its own test: a page load is slow on CI, and six of them don't fit one test's time.
for (const [address, there] of [
  [`/?room=${ROOM_ID}`, (page) => expect(asked(page)).toBeVisible()],
  [`/#/pixel?room=${ROOM_ID}`, (page) => expect(asked(page)).toBeVisible()],
  ['/?reset=tok', (page) => expect(shown(page, 'reset')).toBeVisible()],
  ['/?verified=1', (page) => expect(page.locator('.people-tab')).toContainText('Your email is confirmed')],
  ['/?social=two-factor', (page) => expect(shown(page, 'two-factor')).toBeVisible()],
  ['/#/social/sign-in', (page) => expect(shown(page, 'sign-in')).toBeVisible()],
]) {
  test(`${address} waits for the answer, then goes on to where it was going`, async ({ page }) => {
    const server = await fakeServer(page);
    await page.goto(address);
    await expect(consent(page)).toBeVisible();
    expect(server.requests).toEqual([]);
    await accepted(page);
    await there(page);
  });
}

test('a page you can\'t arrive at still goes where it would: Start a room for a guest is the lobby', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/#/social/start');
  await accepted(page);
  await expect(shown(page, 'lobby')).toBeVisible();
  await hash(page, '/social');
});

test('a host\'s reload from a session before the question keeps the room, unasked; the next plain load asks', async ({ page: host }) => {
  const room = fakeRoom();
  await fakeServer(host);
  await host.goto('/');
  await tab(host, 'SOCIAL').click();
  await accepted(host);
  const server = await goLive(host, room);
  host.on('dialog', (dialog) => dialog.accept());
  await host.evaluate((key) => localStorage.removeItem(key), CONSENT_KEY);   // what a session from before looks like
  await host.reload();
  await live(host);
  await expect(consent(host)).toHaveCount(0);
  await selected(host, 'SOCIAL');
  expect(server.sent('POST', '/api/pass').length).toBeGreaterThan(0);
  await host.getByRole('button', { name: 'End room' }).click();
  await host.getByRole('dialog').getByRole('button', { name: 'End room' }).click();
  await expect.poll(() => store(host, 'room', (r) => r.role)).toBe(null);
  await expect(consent(host)).toHaveCount(0);   // not in that load
  await host.reload();
  await expect(consent(host)).toBeVisible();
});

test('a watcher\'s reload from a session before the question stays in the room, unasked', async ({ page: host, context }) => {
  const room = fakeRoom();
  await fakeServer(host);
  await host.goto('/');
  await tab(host, 'SOCIAL').click();
  await accepted(host);
  await goLive(host, room);
  const watcher = await watcherPage(context, room);
  await watcher.goto('/');
  await tab(watcher, 'SOCIAL').click();
  await expect(consent(watcher)).toHaveCount(0);   // the browser's already answered: same context
  await joinFromCard(watcher);
  await watcher.evaluate((key) => localStorage.removeItem(key), CONSENT_KEY);
  await watcher.reload();
  await live(watcher);
  await expect(consent(watcher)).toHaveCount(0);
});

test('the Privacy Policy and the Terms say artists get the whole project, and the Terms say who can report as the rest do', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/');
  await tab(page, 'SOCIAL').click();
  await consent(page).getByRole('button', { name: 'Privacy Policy', exact: true }).click();
  const privacy = page.getByRole('dialog', { name: 'Privacy Policy' });
  await expect(privacy).toContainText('receives the whole project, including the original image');
  await expect(privacy).toContainText('Last updated: November 1, 2026.');
  await privacy.getByRole('button', { name: 'Close' }).click();
  await consent(page).getByRole('button', { name: 'Terms', exact: true }).click();
  const terms = page.getByRole('dialog', { name: 'Terms' });
  await expect(terms).toContainText('anyone signed in with a confirmed email can report a user or a room');
  await expect(terms).not.toContainText('any signed-in user');
  await expect(terms).toContainText('you allow them to receive a copy of the whole project, including the original image');
  await expect(terms).toContainText('Last updated: November 1, 2026.');
});

test('the Terms, Privacy Policy and Guidelines open over the modal, and coming back leaves it and its tick as they were', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/');
  await tab(page, 'SOCIAL').click();
  await agree(page).check();
  for (const [name, heading] of [['Terms', 'Terms'], ['Privacy Policy', 'Privacy Policy'], ['Community Guidelines', 'Community Guidelines']]) {
    const link = consent(page).getByRole('button', { name, exact: true });
    await link.click();
    const dialog = page.getByRole('dialog', { name: heading });
    await expect(dialog.getByRole('heading', { level: 1 })).toHaveText(heading);
    await dialog.getByRole('button', { name: 'Close' }).click();   // on top: a click on the wrong layer would fail
    await expect(dialog).toHaveCount(0);
    await expect(agree(page)).toBeChecked();
    await expect(link).toBeFocused();
  }
  await consent(page).getByRole('button', { name: 'Terms', exact: true }).click();
  await page.keyboard.press('Escape');   // that dialog's Escape, not this one's
  await expect(page.getByRole('dialog', { name: 'Terms' })).toHaveCount(0);
  await expect(consent(page)).toBeVisible();
  await expect(agree(page)).toBeChecked();
});

test('focus starts in the modal and stays there; a click on its text or backdrop neither loses it nor declines', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/');
  await tab(page, 'SOCIAL').click();
  const inside = () => page.evaluate(() => !!document.activeElement.closest('[role=dialog]'));
  await expect.poll(inside).toBe(true);
  const stops = new Set();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await inside()).toBe(true);
    stops.add(await page.evaluate(() => document.activeElement.textContent.slice(0, 20) || document.activeElement.type));
  }
  expect(stops.size).toBeGreaterThan(3);
  await page.keyboard.press('Shift+Tab');
  expect(await inside()).toBe(true);

  await consent(page).getByRole('heading', { name: 'The lobby' }).click();
  expect(await inside()).toBe(true);
  await page.mouse.click(5, 5);
  await expect(consent(page)).toBeVisible();
  expect(await inside()).toBe(true);
  await page.keyboard.press('Escape');
  await expect(consent(page)).toHaveCount(0);
  await expect(tab(page, 'PIXEL')).toBeFocused();
});

test('the agreement and both answers share a row, with the answers at the right', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/');
  await tab(page, 'SOCIAL').click();
  const box = await agree(page).boundingBox();
  const no = await notNow(page).boundingBox(), yes = await accept(page).boundingBox();
  const middle = ({ y, height }) => y + height / 2;
  expect(Math.abs(middle(no) - middle(box))).toBeLessThanOrEqual(12);
  expect(no.height).toBe(yes.height);
  expect(no.y).toBe(yes.y);
  expect(box.x).toBeLessThan(no.x);
  expect(no.x).toBeLessThan(yes.x);
});

test('in a window too short for it, the modal scrolls and its buttons stay reachable', async ({ page }) => {
  await fakeServer(page);
  await page.setViewportSize({ width: 1000, height: 420 });
  await page.goto('/');
  await tab(page, 'SOCIAL').click();
  await expect(accept(page)).toBeInViewport({ ratio: 1 });
  await expect(notNow(page)).toBeInViewport({ ratio: 1 });
  await expect(agree(page)).toBeInViewport({ ratio: 1 });
  const body = consent(page).getByRole('region', { name: 'What SOCIAL means for you' });
  const scrolls = await body.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(scrolls).toBe(true);
  await body.focus();
  await page.keyboard.press('End');
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test('a narrow screen has no SOCIAL: an address for it lands on PIXEL, unasked', async ({ page }) => {
  const server = await fakeServer(page);
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/#/social');
  await selected(page, 'PIXEL');
  await expect(consent(page)).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  expect(server.requests).toEqual([]);
});
