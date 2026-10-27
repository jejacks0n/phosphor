// The lobby page: the live public rooms with their Join buttons, you and your signal, who's here, and
// the lobby's states (connecting, reconnecting, empty, unavailable, an unsupported browser).
import { test, expect, tab, store } from './support.js';
import { fakeServer, member } from './social-support.js';

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
  await expect(side(page).getByRole('group', { name: 'Your signal' })).toHaveCount(0); // members only
  await expect(side(page).getByRole('button', { name: 'Start a room' })).toHaveCount(0);

  const here = lobby(page).getByRole('list', { name: 'In the lobby' });
  await expect(lobby(page).getByText('In the lobby 3')).toBeVisible();
  await expect(here.getByRole('listitem')).toHaveText([/quiet-amber-fox\s*guest/, /dusty-neon-heron\s*Open to chat/, /soft-copper-gnat\s*guest/]);

  await join.click();
  expect(await store(page, 'social', (s) => s.joining)).toBe('harbor');

  await side(page).getByRole('button', { name: 'Sign in', exact: true }).click();
  expect(await store(page, 'social', (s) => s.page)).toBe('sign-in');
  await page.reload();
  await tab(page, 'SOCIAL').click();
  await side(page).getByRole('button', { name: 'Create one' }).click();
  expect(await store(page, 'social', (s) => s.page)).toBe('create');
});

test('a member can join a members-only room, picks a signal (sent once, shown chosen), and can\'t start a room yet', async ({ page }) => {
  const server = await fakeServer(page, { me: member(), rooms: ROOMS });
  await showLobby(page, server);

  await expect(card(page, 'members only').getByRole('button', { name: 'Join 3/8', exact: true })).toBeEnabled();
  await expect(card(page, 'acid logo').getByRole('button', { name: 'Join 7/7', exact: true })).toBeDisabled();

  await expect(you(page)).toContainText('ansi-fan');
  await expect(you(page).getByText('guest', { exact: true })).toHaveCount(0);
  await expect(side(page).getByRole('button', { name: 'Account' })).toBeVisible();
  await expect(side(page).getByRole('button', { name: 'Sign out' })).toBeVisible();
  const start = side(page).getByRole('button', { name: 'Start a room' });
  await expect(start).toBeDisabled();
  await expect(start).toHaveAttribute('title', 'Coming soon');

  const signals = side(page).getByRole('group', { name: 'Your signal' });
  const chat = signals.getByRole('button', { name: 'Open to chat' });
  await expect(chat).toHaveAttribute('aria-pressed', 'false');
  await chat.click();
  await expect(chat).toHaveAttribute('aria-pressed', 'true');
  await expect(signals.getByRole('button', { name: 'Wants feedback' })).toHaveAttribute('aria-pressed', 'false');
  await expect(lobby(page).getByRole('list', { name: 'In the lobby' }).getByRole('listitem').first()).toHaveText(/ansi-fan\s*Open to chat/);
  await expect.poll(() => server.lobby.received.filter((m) => m.type === 'signal')).toEqual([{ type: 'signal', signal: 'chat' }]);

  await side(page).getByRole('button', { name: 'Account' }).click();
  expect(await store(page, 'social', (s) => s.page)).toBe('account');
});

test('a member\'s second tab shows the signal the account already has', async ({ page }) => {
  const server = await fakeServer(page, { me: member(), signal: 'feedback' });
  await showLobby(page, server);
  const signals = side(page).getByRole('group', { name: 'Your signal' });
  await expect(signals.getByRole('button', { name: 'Wants feedback' })).toHaveAttribute('aria-pressed', 'true');
  await expect(lobby(page).getByRole('list', { name: 'In the lobby' }).getByRole('listitem')).toHaveText([/ansi-fan\s*Wants feedback/]);
  expect(server.lobby.received.filter((m) => m.type === 'signal')).toEqual([]);
});

test('a member whose email isn\'t confirmed is asked to confirm it to start a room, and can resend', async ({ page }) => {
  const server = await fakeServer(page, {
    me: member({ emailVerified: false }),
    'POST /api/auth/send-verification-email': () => [200, { status: true }],
  });
  await showLobby(page, server);
  await expect(side(page).getByText('Confirm your email to start a room')).toBeVisible();
  await expect(side(page).getByRole('button', { name: 'Start a room' })).toHaveCount(0);
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

test('a refused pass makes the rooms unavailable', async ({ page }) => {
  const server = await fakeServer(page, { rooms: ROOMS });
  await showLobby(page, server);
  await expect(lobby(page).getByRole('article')).toHaveCount(4);
  server.lobby.send({ type: 'refused', code: 'bad-pass' });
  await expect(lobby(page).getByText('Rooms are unavailable right now')).toBeVisible();
  await expect(lobby(page).getByText('The editor works as usual.')).toBeVisible();
  await expect(lobby(page).getByRole('article')).toHaveCount(0);
});

test('a server that can\'t be reached: unavailable, not loading forever', async ({ page }) => {
  await fakeServer(page, { 'POST /api/pass': () => [503, { code: 'UNAVAILABLE' }] });
  await page.goto('/');
  await tab(page, 'SOCIAL').click();
  await expect(lobby(page).getByText('Rooms are unavailable right now')).toBeVisible();
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

  await expect(lobby(page).getByText('Reconnecting…')).toHaveCount(0, { timeout: 5000 }); // retried after 1 s
  await expect(lobby(page).getByRole('article')).toHaveCount(1);
  await expect(card(page, 'after the drop')).toBeVisible();
  await expect(lobby(page).locator('.rooms.stale')).toHaveCount(0);
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
