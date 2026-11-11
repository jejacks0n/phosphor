// SOCIAL's first question: nothing of SOCIAL runs until it's answered, however you arrive (the Social tab, a page, a link).
import { test, expect, tab, store, openApp, startScreen } from './support.js';
import { fakeServer, fakeRoom, goLive, shown, asked, hash, selected, live, chat, ROOM_ID, openLobby } from './social-support.js';
import { CONSENT_KEY } from '../../src/social/consent.js';

test.use({ consented: false });

const TERMS = /^I'm 13 or older and agree to the Terms\s*, Privacy Policy\s*, and Community Guidelines$/;
const consent = (page) => page.getByRole('dialog', { name: 'Before you open SOCIAL' });
const lobbyTab = (page) => page.locator('.side-panel').getByRole('tab', { name: 'Social' });
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
  page.on('request', (request) => { if (!/^https?:\/\/localhost(:\d+)?\//.test(request.url()) && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) seen.push(request.url()); });
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

test('the Social tab first shown asks, saying what SOCIAL means with the agreement and both answers in a row, Accept off until the 13-or-older box is ticked, and nothing reaches the network until it\'s accepted', async ({ page }) => {
  const seen = elsewhere(page);
  const server = await fakeServer(page);
  await page.goto('/');
  await expect(consent(page)).toHaveCount(0);   // only the lobby asks: Layers isn't SOCIAL
  await lobbyTab(page).click();
  await expect(consent(page)).toBeVisible();
  await nothingRan(page, server, seen);
  await expect(shown(page, 'lobby')).toHaveCount(0);

  // What the lobby, joining and starting a room mean, and how to behave.
  for (const heading of ['The lobby', 'Joining a room', 'Starting a room', 'Be kind']) {
    await expect(consent(page).getByRole('heading', { name: heading })).toBeVisible();
  }
  await expect(consent(page)).toContainText('each of you can see the other\'s IP address');
  await expect(consent(page)).toContainText('use a VPN');
  await expect(consent(page)).toContainText('including the original image');
  await expect(consent(page)).toContainText('snapshot of the canvas');

  // The agreement and both answers share a row, with the answers at the right.
  const box = await agree(page).boundingBox();
  const no = await notNow(page).boundingBox(), yes = await accept(page).boundingBox();
  const middle = ({ y, height }) => y + height / 2;
  expect(Math.abs(middle(no) - middle(box))).toBeLessThanOrEqual(12);
  expect(no.height).toBe(yes.height);
  expect(no.y).toBe(yes.y);
  expect(box.x).toBeLessThan(no.x);
  expect(no.x).toBeLessThan(yes.x);

  // Accept stays off until the box is ticked.
  await expect(accept(page)).toBeDisabled();
  await expect(consent(page).locator('label')).toHaveText('I\'m 13 or older and agree to the Terms, Privacy Policy, and Community Guidelines');
  await agree(page).check();
  await expect(accept(page)).toBeEnabled();
  await agree(page).uncheck();
  await expect(accept(page)).toBeDisabled();

  await accepted(page);
  await expect(shown(page, 'lobby')).toBeVisible();
  await selected(page, 'Social');
  await expect.poll(() => server.lobby.received.map((m) => m.type)).toEqual(['hello']);
  expect(server.sent('GET', '/api/me')).toHaveLength(1);
});

test('Not now puts the panel back on Layers, leaves the tab you were on as it was, and asks again next time', async ({ page }) => {
  const seen = elsewhere(page);
  const server = await fakeServer(page);
  await openApp(page);   // on ANSI
  await tab(page, 'SAUCE').click();
  await openLobby(page);
  await notNow(page).click();
  await expect(consent(page)).toHaveCount(0);
  await selected(page, 'Layers');
  await selected(page, 'SAUCE');
  await hash(page, '/sauce');
  await nothingRan(page, server, seen);
  await page.goBack();   // no SOCIAL left to land on: the step before SAUCE
  await selected(page, 'ANSI');
  await expect(consent(page)).toHaveCount(0);

  await openLobby(page);
  await expect(consent(page)).toBeVisible();
  await expect(agree(page)).not.toBeChecked();
});

// The link opened the lobby behind its question; Back takes the link's room away, not the lobby, which still asks.
test('Back with a link\'s question up forgets the link\'s room; the question stays for the lobby the link opened', async ({ page }) => {
  const server = await fakeServer(page);
  await page.goto('/#/pixel');
  await page.evaluate((id) => { location.hash = `#/pixel?room=${id}`; }, ROOM_ID);
  await expect(consent(page)).toBeVisible();
  await page.goBack();
  await startScreen(page);
  expect(new URL(page.url()).hash).not.toContain('room=');
  await selected(page, 'Social');
  await accepted(page);
  await expect.poll(() => server.lobby.received.map((m) => m.type)).toEqual(['hello']);
  await expect(asked(page)).toHaveCount(0);
});

test('Not now over a page or a link with nothing open leaves the start screen at a clean address, with no room asked', async ({ page }) => {
  const seen = elsewhere(page);
  const server = await fakeServer(page);
  await page.goto(`/#/social/sign-in`);
  await notNow(page).click();
  await startScreen(page);
  await hash(page, '/');
  await page.goto(`/?room=${ROOM_ID}`);
  await notNow(page).click();
  await startScreen(page);
  await hash(page, '/');
  expect(new URL(page.url()).search).toBe('');
  await selected(page, 'Layers');   // the lobby the link opened, closed
  await nothingRan(page, server, seen);
  await expect(asked(page)).toHaveCount(0);

  // Accepted later, the link it turned down stays turned down.
  await openLobby(page);
  await accepted(page);
  await expect(shown(page, 'lobby')).toBeVisible();
  await expect.poll(() => server.lobby.received.map((m) => m.type)).toEqual(['hello']);
  await expect(asked(page)).toHaveCount(0);
});

// Each its own test: a page load is slow on CI, and six of them don't fit one test's time.
for (const [address, there] of [
  [`/?room=${ROOM_ID}`, (page) => expect(asked(page)).toBeVisible()],
  [`/#/pixel?room=${ROOM_ID}`, (page) => expect(asked(page)).toBeVisible()],
  ['/?reset=tok', (page) => expect(shown(page, 'reset')).toBeVisible()],
  ['/?verified=1', (page) => expect(shown(page, 'lobby').locator('p.notice')).toContainText('Your email is confirmed')],
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

test('a host\'s reload from a session before the question keeps the room, unasked; the next plain load asks', async ({ page: host }) => {
  const room = fakeRoom();
  await fakeServer(host);
  await host.goto('/');
  await openLobby(host);
  await accepted(host);
  const server = await goLive(host, room);
  host.on('dialog', (dialog) => dialog.accept());
  await host.evaluate((key) => localStorage.removeItem(key), CONSENT_KEY);   // what a session from before looks like
  await host.reload();
  await live(host);
  await expect(consent(host)).toHaveCount(0);
  await selected(host, 'ANSI');   // on their art
  expect(server.sent('POST', '/api/pass').length).toBeGreaterThan(0);
  await selected(host, 'Chat');   // the panel back on the room's chat, with End room in its header
  await expect(chat(host)).toBeVisible();
  await host.getByRole('button', { name: 'End room' }).click();
  await host.getByRole('dialog').getByRole('button', { name: 'End room' }).click();
  await expect.poll(() => store(host, 'room', (r) => r.role)).toBe(null);
  await selected(host, 'Social');   // out of the room, the lobby shows there
  await expect(consent(host)).toHaveCount(0);   // and doesn't ask, not in that load
  await host.reload();
  await openLobby(host);
  await expect(consent(host)).toBeVisible();
});

test('in French, the Terms and the Privacy Policy they link to are the French copy', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Language' }).selectOption('fr');
  await page.locator('.side-panel').getByRole('tab', { name: 'Social' }).click();
  await page.getByRole('dialog', { name: 'Avant d\'ouvrir SOCIAL' }).getByRole('button', { name: 'Conditions d\'utilisation', exact: true }).click();
  const terms = page.getByRole('dialog', { name: 'Conditions d\'utilisation' });
  await expect(terms.getByRole('heading', { level: 1 })).toHaveText('Conditions d\'utilisation');
  await expect(terms).toContainText('Dernière mise à jour : 1er novembre 2026.');
  await terms.getByRole('button', { name: 'Politique de confidentialité' }).first().click();
  const privacy = page.getByRole('dialog', { name: 'Politique de confidentialité' });
  await expect(privacy.getByRole('heading', { level: 1 })).toHaveText('Politique de confidentialité');
  await expect(privacy).not.toContainText('Last updated');
});

test('the Terms, Privacy Policy and Guidelines open over the modal, the Privacy Policy and the Terms say artists get the whole project and the Terms say who can report as the rest do, and coming back leaves it and its tick as they were', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/');
  await openLobby(page);
  await agree(page).check();
  const says = {
    'Terms': async (terms) => {
      await expect(terms).toContainText('anyone signed in with a confirmed email can report a user or a room');
      await expect(terms).not.toContainText('any signed-in user');
      await expect(terms).toContainText('you allow them to receive a copy of the whole project, including the original image');
      await expect(terms).toContainText('Last updated: November 1, 2026.');
    },
    'Privacy Policy': async (privacy) => {
      await expect(privacy).toContainText('receives the whole project, including the original image');
      await expect(privacy).toContainText('Last updated: November 1, 2026.');
    },
    'Community Guidelines': async () => {},
  };
  for (const [name, heading] of [['Terms', 'Terms'], ['Privacy Policy', 'Privacy Policy'], ['Community Guidelines', 'Community Guidelines']]) {
    const link = consent(page).getByRole('button', { name, exact: true });
    await link.click();
    const dialog = page.getByRole('dialog', { name: heading });
    await expect(dialog.getByRole('heading', { level: 1 })).toHaveText(heading);
    await says[name](dialog);
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
  await openLobby(page);
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
  await expect(lobbyTab(page)).toBeFocused();   // back on the tab that asked, not dropped on the page
});

test('in a window too short for it, the modal scrolls and its buttons stay reachable', async ({ page }) => {
  await fakeServer(page);
  await page.setViewportSize({ width: 1000, height: 420 });
  await page.goto('/');
  await openLobby(page);
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

test('a narrow screen has no SOCIAL: an address for it lands on the start screen, unasked', async ({ page }) => {
  const server = await fakeServer(page);
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/#/social');
  await startScreen(page);
  await expect(consent(page)).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  expect(server.requests).toEqual([]);
});
