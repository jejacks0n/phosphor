// The lobby page: the live public rooms with their Join buttons and filter, you, who's here, and
// the lobby's states (connecting, reconnecting, empty, unavailable, an unsupported browser).
import { test, expect, tab, store } from './support.js';
import { fakeServer, member } from './social-support.js';
import { nameColor } from '../../src/social/names.js';

const MIN = 60_000;
const room = (id, more) => ({
  id, name: `Room ${id}`, host: 'velvet-static-moth', count: 1, max: 12, allowGuests: true, signal: null,
  liveSince: Date.now() - 5 * MIN, thumbnail: null, blockedInside: false, ...more,
});
const ROOMS = [
  room('harbor', { name: 'neon harbor at dusk', count: 4, signal: 'feedback', liveSince: Date.now() - 42 * MIN, thumbnail: 'UklGRg==' }),
  room('shading', { name: 'first time trying shading', host: 'tin-lantern-owl', count: 2, signal: 'chat' }),
  room('full', { name: 'acid logo for my bbs', count: 7, max: 7, liveSince: Date.now() - 75 * MIN }),
  room('members', { name: 'members only', count: 3, max: 8, allowGuests: false, blockedInside: true }),
];
const PEOPLE = [
  { sub: 'u_2', name: 'dusty-neon-heron', guest: false, signal: 'chat' },
  { sub: 'g_9', name: 'soft-copper-gnat', guest: true, signal: null },
];

const lobby = (page) => page.locator('.social-tab [data-page="lobby"]');
const card = (page, name) => lobby(page).getByRole('article').filter({ hasText: name });
const side = (page) => lobby(page).getByRole('complementary');
const you = (page) => side(page).locator('.you');

async function showLobby(page, server) {
  await page.goto('/');
  await tab(page, 'SOCIAL').click();
  await expect.poll(() => server.lobby.received.map((m) => m.type)).toContain('hello');
}

test('a guest sees the rooms, their Join buttons, the guest tag and Sign in; Join opens a room', async ({ page }) => {
  const server = await fakeServer(page, { rooms: ROOMS, people: PEOPLE });
  await showLobby(page, server);

  await expect(lobby(page).getByRole('heading', { name: 'Public rooms' })).toBeVisible();
  await expect(lobby(page).getByText('4 live')).toBeVisible();
  await expect(lobby(page).getByRole('article')).toHaveCount(4);

  const harbor = card(page, 'neon harbor at dusk');
  await expect(harbor.getByText('velvet-static-moth')).toBeVisible();
  await expect(harbor.getByText('live 42 min, wants feedback')).toBeVisible();
  await expect(harbor.locator('img')).toHaveAttribute('src', 'data:image/webp;base64,UklGRg==');
  await expect(card(page, 'acid logo').getByText('live 1 hr 15 min')).toBeVisible();
  await expect(card(page, 'first time').locator('img')).toHaveCount(0); // no thumbnail yet: a placeholder

  const join = harbor.getByRole('button', { name: 'Join 4/12', exact: true });
  await expect(join).toBeEnabled();
  const full = card(page, 'acid logo').getByRole('button', { name: 'Join 7/7', exact: true });
  await expect(full).toBeDisabled();
  await expect(full).toHaveAccessibleDescription('Room is full');
  const members = card(page, 'members only').getByRole('button', { name: 'Join 3/8', exact: true });
  await expect(members).toBeDisabled();
  await expect(members).toHaveAccessibleDescription('Signed-in users only');
  await expect(card(page, 'members only').getByText('Someone you blocked is here')).toBeVisible();
  await expect(harbor.getByText('Someone you blocked is here')).toHaveCount(0);

  await expect(you(page)).toContainText('quiet-amber-fox');
  await expect(you(page).getByText('guest', { exact: true })).toBeVisible();
  await expect(side(page).getByText('Sign in to chat and start rooms.')).toBeVisible();
  await expect(lobby(page).getByRole('button', { name: 'Start a room' })).toHaveCount(0);

  const here = lobby(page).getByRole('list', { name: 'In the lobby' });
  await expect(lobby(page).getByText('In the lobby 3')).toBeVisible();
  // a person's signal isn't shown (the server still sends one): a member's row is just the name
  await expect(here.getByRole('listitem')).toHaveText([/quiet-amber-fox\s*guest/, /^\s*dusty-neon-heron\s*$/, /soft-copper-gnat\s*guest/]);

  await join.click();   // the room store joins it (this fake id isn't a room id, so it's refused at once)
  await expect(page.getByText('This room isn\'t available')).toBeVisible();

  await side(page).getByRole('button', { name: 'Sign in', exact: true }).click();
  expect(await store(page, 'social', (s) => s.page)).toBe('sign-in');
  await page.reload();
  await tab(page, 'SOCIAL').click();
  await side(page).getByRole('button', { name: 'Create one' }).click();
  expect(await store(page, 'social', (s) => s.page)).toBe('create');
});

test('while it\'s asking who you are, the side shows no Sign in and no guest tag, then you', async ({ page }) => {
  let answer;
  const me = new Promise((resolve) => { answer = resolve; });
  await fakeServer(page, { 'GET /api/me': () => me });
  await page.goto('/');
  await tab(page, 'SOCIAL').click();
  await expect(you(page)).toBeVisible();
  await page.waitForTimeout(300);   // the moment the flash showed in
  await expect(side(page).getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
  await expect(you(page).getByText('guest', { exact: true })).toHaveCount(0);
  answer([200, member()]);
  await expect(side(page).getByRole('button', { name: 'Edit account' })).toBeVisible();
  await expect(side(page).getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
});

test('a member can join a members-only room and can start a room, and has no signal of their own', async ({ page }) => {
  const server = await fakeServer(page, { me: member(), rooms: ROOMS });
  await showLobby(page, server);

  await expect(card(page, 'members only').getByRole('button', { name: 'Join 3/8', exact: true })).toBeEnabled();
  await expect(card(page, 'acid logo').getByRole('button', { name: 'Join 7/7', exact: true })).toBeDisabled();

  await expect(you(page)).toContainText('ansi-fan');
  await expect(you(page).getByText('guest', { exact: true })).toHaveCount(0);
  for (const name of ['Edit account', 'Sign out']) {   // buttons, not links
    await expect(side(page).getByRole('button', { name })).toBeVisible();
    await expect(side(page).getByRole('button', { name })).not.toHaveClass(/\blink\b/);
  }
  // Start a room sits across from the Public rooms title, right-aligned; the filter is below them, past a rule.
  const start = lobby(page).getByRole('button', { name: 'Start a room' });
  await expect(start).toBeEnabled();
  await expect(side(page).getByRole('button', { name: 'Start a room' })).toHaveCount(0);
  const title = await lobby(page).getByRole('heading', { name: 'Public rooms' }).boundingBox();
  const button = await start.boundingBox();
  const main = await lobby(page).locator('section.main').boundingBox();
  const rule = await lobby(page).locator('section.main hr').boundingBox();
  const filter = await lobby(page).getByRole('group', { name: 'Filter rooms' }).boundingBox();
  expect(Math.abs((button.y + button.height / 2) - (title.y + title.height / 2))).toBeLessThan(2);
  await expect(start).not.toHaveClass(/\bprimary\b/);   // the secondary style
  // The same space above it, to its right, and below it to the rule.
  const above = button.y - main.y, right = main.x + main.width - (button.x + button.width), below = rule.y - (button.y + button.height);
  expect(Math.abs(above - right)).toBeLessThan(1);
  expect(Math.abs(below - right)).toBeLessThan(1);
  expect(filter.y).toBeGreaterThan(rule.y);

  await expect(lobby(page).getByText('Your signal')).toHaveCount(0);   // a room's signal is chosen in Start a room
  await expect(side(page).getByRole('button', { name: 'Open to chat' })).toHaveCount(0);
  await expect(lobby(page).getByRole('list', { name: 'In the lobby' }).getByRole('listitem').first()).toHaveText(/^\s*ansi-fan\s*$/);

  await side(page).getByRole('button', { name: 'Edit account' }).click();
  expect(await store(page, 'social', (s) => s.page)).toBe('account');
  await page.getByRole('button', { name: '‹ Back to the lobby' }).click();
  await lobby(page).getByRole('button', { name: 'Start a room' }).click();
  expect(await store(page, 'social', (s) => s.page)).toBe('start-room');
});

test('a member whose email isn\'t confirmed is asked to confirm it to start a room, and can resend', async ({ page }) => {
  const server = await fakeServer(page, {
    me: member({ emailVerified: false }),
    'POST /api/auth/send-verification-email': () => [200, { status: true }],
  });
  await showLobby(page, server);
  await expect(side(page).getByText('Confirm your email to start a room')).toBeVisible();
  await expect(lobby(page).getByRole('button', { name: 'Start a room' })).toHaveCount(0);
  await side(page).getByRole('button', { name: 'Resend' }).click();
  await expect.poll(() => server.sent('POST', '/api/auth/send-verification-email')).toHaveLength(1);
});

test('the filter chips show only the rooms with that signal', async ({ page }) => {
  const server = await fakeServer(page, { rooms: ROOMS });
  await showLobby(page, server);
  const filters = lobby(page).getByRole('group', { name: 'Filter rooms' });
  await expect(filters.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

  await filters.getByRole('button', { name: 'Wants feedback' }).click();
  await expect(lobby(page).getByRole('article')).toHaveCount(1);
  await expect(card(page, 'neon harbor')).toBeVisible();
  await expect(filters.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');

  await filters.getByRole('button', { name: 'Open to chat' }).click();
  await expect(lobby(page).getByRole('article')).toHaveCount(1);
  await expect(card(page, 'first time')).toBeVisible();

  await filters.getByRole('button', { name: 'All' }).click();
  await expect(lobby(page).getByRole('article')).toHaveCount(4);

  server.lobby.send({ type: 'room-gone', id: 'harbor' });
  await filters.getByRole('button', { name: 'Wants feedback' }).click();
  await expect(lobby(page).getByRole('article')).toHaveCount(0);
  await expect(lobby(page).getByText('No rooms match this filter')).toBeVisible();
});

test('a room the server adds appears, one it removes disappears; people come and go', async ({ page }) => {
  const server = await fakeServer(page, { rooms: ROOMS.slice(0, 2), people: PEOPLE });
  await showLobby(page, server);
  await expect(lobby(page).getByRole('article')).toHaveCount(2);

  server.lobby.send({ type: 'room-gone', id: 'harbor' });
  await expect(card(page, 'neon harbor')).toHaveCount(0);
  await expect(lobby(page).getByText('1 live')).toBeVisible();
  server.lobby.send({ type: 'room', room: room('new', { name: 'cyberdeck sunset' }) });
  await expect(card(page, 'cyberdeck sunset')).toBeVisible();

  server.lobby.send({ type: 'person-gone', sub: 'u_2' });
  await expect(lobby(page).getByText('In the lobby 2')).toBeVisible(); // you and the guest
});

test('no rooms: the lobby says so', async ({ page }) => {
  const server = await fakeServer(page);
  await showLobby(page, server);
  await expect(lobby(page).getByText('No public rooms right now')).toBeVisible();
  await expect(lobby(page).getByText('Start one and you\'ll be the first thing people see here.')).toBeVisible();
  await expect(lobby(page).getByText('0 live')).toBeVisible();
});

test('a refused pass is tried once more with a fresh one; refused again, the rooms are unavailable and the clock is named', async ({ page }) => {
  const server = await fakeServer(page, { rooms: ROOMS });
  await showLobby(page, server);
  await expect(lobby(page).getByRole('article')).toHaveCount(4);
  server.lobby.refusing = true;
  server.lobby.send({ type: 'refused', code: 'bad-pass' });
  await expect(lobby(page).getByText('Rooms are unavailable right now')).toBeVisible();
  await expect(lobby(page).getByText('The editor works as usual.')).toBeVisible();
  await expect(lobby(page).getByText('If your computer\'s clock is wrong, fix it and reload.')).toBeVisible();
  await expect(lobby(page).getByRole('article')).toHaveCount(0);
  expect(server.lobby.received.filter((m) => m.type === 'hello')).toHaveLength(2);
  expect(server.sent('POST', '/api/pass')).toHaveLength(2);
});

test('a server that can\'t be reached: unavailable, not loading forever', async ({ page }) => {
  await fakeServer(page, { 'POST /api/pass': () => [503, { code: 'UNAVAILABLE' }] });
  await page.goto('/');
  await tab(page, 'SOCIAL').click();
  await expect(lobby(page).getByText('Rooms are unavailable right now')).toBeVisible();
  await expect(lobby(page).getByText('If your computer\'s clock is wrong', { exact: false })).toHaveCount(0); // not refused
  await expect(lobby(page).getByText('Reconnecting…')).toHaveCount(0);
});

test('while connecting, skeleton cards stand in for the rooms', async ({ page }) => {
  let answer;
  const server = await fakeServer(page, { 'POST /api/pass': () => new Promise((resolve) => { answer = resolve; }) });
  await page.goto('/');
  await tab(page, 'SOCIAL').click();
  await expect(lobby(page).locator('.skeleton').first()).toBeVisible();
  await expect(lobby(page).getByRole('article')).toHaveCount(0);
  await expect.poll(() => typeof answer).toBe('function');
  const claims = { sub: 'g_1', name: 'quiet-amber-fox', guest: true, verified: false, key: 'k', exp: Math.floor(Date.now() / 1000) + 3600 };
  answer([200, { pass: 'e30.c2ln', claims }]);
  await expect.poll(() => server.lobby.received.map((m) => m.type)).toContain('hello');
  await expect(lobby(page).getByText('No public rooms right now')).toBeVisible();
  await expect(lobby(page).locator('.skeleton')).toHaveCount(0);
});

test('a dropped socket shows Reconnecting… over the dimmed rooms, then recovers with the new state', async ({ page }) => {
  const server = await fakeServer(page, { rooms: ROOMS.slice(0, 2), people: PEOPLE });
  await showLobby(page, server);
  await expect(lobby(page).getByRole('article')).toHaveCount(2);

  server.rooms = [room('after', { name: 'after the drop' })];
  server.lobby.drop();
  await expect(lobby(page).getByText('Reconnecting…')).toBeVisible();
  await expect(lobby(page).getByRole('article')).toHaveCount(2); // still there, dimmed
  await expect(lobby(page).locator('.rooms.stale')).toBeVisible();
  await expect(lobby(page).locator('.rooms')).toHaveAttribute('inert'); // and their Join buttons out of reach

  await expect(lobby(page).getByText('Reconnecting…')).toHaveCount(0, { timeout: 5000 }); // retried after 1 s
  await expect(lobby(page).getByRole('article')).toHaveCount(1);
  await expect(card(page, 'after the drop')).toBeVisible();
  await expect(lobby(page).locator('.rooms.stale')).toHaveCount(0);
  await expect(lobby(page).locator('.rooms')).not.toHaveAttribute('inert');
});

test('the notice is one line at the top of the tab, and can be dismissed', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/?verified=1');
  const notice = page.locator('.social-tab').getByRole('status');
  await expect(notice).toContainText('Your email is confirmed');
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await expect(notice).toHaveCount(0);
  expect(await store(page, 'social', (s) => s.notice)).toBe(null);
});

// Review focus 1: a browser without Ed25519 in WebCrypto is told so, and shown nothing else.
test('a browser that can\'t do Ed25519 is told plainly, with nothing else on the tab', async ({ page }) => {
  await fakeServer(page, { rooms: ROOMS });
  await page.addInitScript(() => {
    crypto.subtle.generateKey = () => Promise.reject(new DOMException('Unsupported', 'NotSupportedError'));
  });
  await page.goto('/');
  await tab(page, 'SOCIAL').click();
  await expect(page.locator('.social-tab')).toHaveText('This browser can\'t sign you in to SOCIAL yet');
});

// A person shows the same wherever they do: their name in the text color, after a 10px square of its color.
test('a name is drawn the same everywhere: the square of its color, then the name in the text color', async ({ page }) => {
  const server = await fakeServer(page, { me: member(), rooms: ROOMS, people: PEOPLE });
  await showLobby(page, server);
  const look = (name) => name.evaluate((el) => {
    const square = el.querySelector('.swatch'), box = square.getBoundingClientRect();
    return { name: el.textContent, color: getComputedStyle(el).color, square: [box.width, box.height, getComputedStyle(square).backgroundColor] };
  });
  const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
  const text = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text').trim());
  const textColor = rgb(text.length === 4 ? `#${[...text.slice(1)].map((c) => c + c).join('')}` : text);
  const expected = (name) => ({ name, color: textColor, square: [10, 10, rgb(nameColor(name))] });

  expect(await look(you(page).locator('.name'))).toEqual(expected('ansi-fan'));
  expect(await look(side(page).getByRole('listitem').filter({ hasText: 'dusty-neon-heron' }).locator('.name'))).toEqual(expected('dusty-neon-heron'));
  expect(await look(card(page, 'first time trying shading').locator('.host'))).toEqual(expected('tin-lantern-owl'));
  await side(page).getByRole('button', { name: 'Edit account' }).click();
  expect(await look(page.locator('.social-tab .username'))).toEqual(expected('ansi-fan'));
});
