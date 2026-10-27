// The social store: you, your pass and the lobby. fetch is routed to a small fake API (by method and
// path, every request recorded), WebSocket is a fake class the test answers for the server, and the
// browser's key is real, so the proofs verify with WebCrypto.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSocialStore } from '@/store/SocialStore';
import { forgetKey, loadKey } from '@/social/keys';
import { toBase64url, fromBase64url } from '@/social/base64url';
import { messageFor } from '@/social/messages';

const deleteDatabase = () => new Promise((resolve, reject) => {
  const req = indexedDB.deleteDatabase('phosphor-social');
  req.onsuccess = resolve;
  req.onerror = () => reject(req.error);
  req.onblocked = () => reject(new Error('phosphor-social is still open'));
});

const verify = async (publicKey, message, signature) => {
  const key = await crypto.subtle.importKey('raw', fromBase64url(publicKey), { name: 'Ed25519' }, false, ['verify']);
  return crypto.subtle.verify('Ed25519', key, fromBase64url(signature), new TextEncoder().encode(message));
};

const makePass = (claims) => toBase64url(new TextEncoder().encode(JSON.stringify(claims))) + '.c2ln';
const claimsOf = (pass) => JSON.parse(new TextDecoder().decode(fromBase64url(pass.split('.')[0])));

const member = (fields = {}) => ({
  id: 'u_1', username: 'ansi-fan', email: 'fan@example.com', emailVerified: true, needsOnboarding: false,
  providers: ['credential'], twoFactorEnabled: false, usernameChangeableAt: null, ...fields,
});

const room = (id, count = 1) => ({
  id, name: `Room ${id}`, host: 'ansi-fan', count, max: 12, allowGuests: true, signal: null,
  liveSince: 1000, thumbnail: null, blockedInside: false,
});

// The server's side: `session` is who the cookie says you are; passes are minted for it (a guest renewing
// with a previous pass keeps its id and name). Routes answer [status, body].
function fakeServer() {
  const server = { session: null, suspended: null, passTtlMs: 3_600_000, guests: 0, requests: [] };
  const routes = {
    'GET /api/me': () => (server.suspended ? [403, { code: 'SUSPENDED', until: server.suspended.until }]
      : server.session ? [200, server.session] : [401, { code: 'SIGNED_OUT' }]),
    'POST /api/pass': (body) => {
      if (server.suspended) return [403, { code: 'SUSPENDED', until: server.suspended.until }];
      if (server.session?.needsOnboarding) return [409, { code: 'NEEDS_ONBOARDING' }];
      const exp = (Date.now() + server.passTtlMs) / 1000;
      const kept = body.previous ? claimsOf(body.previous) : null;
      const claims = server.session
        ? { sub: server.session.id, name: server.session.username, guest: false, verified: true, key: body.key, exp }
        : { sub: kept?.sub ?? `g_${++server.guests}`, name: kept?.name ?? `quiet-amber-fox-${server.guests}`, guest: true, verified: false, key: body.key, exp };
      return [200, { pass: makePass(claims), claims }];
    },
    'POST /api/auth/sign-in/username': (body) => (body.password === 'right-password'
      ? ((server.session = member({ username: body.username })), [200, { token: 't' }])
      : [401, { code: 'INVALID_USERNAME_OR_PASSWORD' }]),
    'POST /api/auth/sign-in/email': () => ((server.session = member()), [200, { token: 't' }]),
    'POST /api/auth/sign-out': () => ((server.session = null), [200, { success: true }]),
  };
  vi.stubGlobal('fetch', async (url, init = {}) => {
    const { pathname } = new URL(url);
    const method = init.method ?? 'GET';
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    server.requests.push({ method, path: pathname, body, headers: init.headers ?? {} });
    const route = routes[`${method} ${pathname}`];
    const [status, reply] = route ? await route(body) : [404, { code: 'NOT_FOUND' }];
    return new Response(JSON.stringify(reply), { status });
  });
  server.route = (key, answer) => { routes[key] = answer; };
  server.routeOf = (key) => routes[key];
  server.sent = (method, path) => server.requests.filter((r) => r.method === method && r.path === path);
  return server;
}

// The lobby's sockets, in the order the store made them.
let sockets;
class FakeSocket {
  constructor(url) {
    Object.assign(this, { url, sent: [], closed: false });
    sockets.push(this);
  }
  send(text) { this.sent.push(JSON.parse(text)); }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.({ code: 1000 });
  }
  accept() { this.onopen?.({}); }
  receive(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
  signals() { return this.sent.filter((m) => m.type === 'signal').map((m) => m.signal); }
}

// Accepts the socket, waits for its hello, answers with a state: the lobby is live. Returns the hello.
async function goLive(socket, state = { rooms: [], people: [] }) {
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('hello'));
  socket.receive({ type: 'state', ...state });
  return socket.sent[0];
}

// A dropped socket is replaced after the connection's first backoff, 1 s.
const lastSocket = async (count) => {
  await vi.waitFor(() => expect(sockets).toHaveLength(count), { timeout: 3000 });
  return sockets[count - 1];
};

// The page's location, with the test's query: start() reads it; replaceState is spied (not run, so the
// test page's own URL stays) to see what it would leave.
const at = (query) => new URL(`${window.location.origin}${window.location.pathname}${query}`);

let social;
beforeEach(async () => {
  forgetKey();
  await deleteDatabase();
  localStorage.clear();
  sockets = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  setActivePinia(createPinia());
  social = useSocialStore();
});
afterEach(() => {
  social.disconnectLobby();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('start with no session gets a guest pass and says hello with it; the state makes the lobby live', async () => {
  const server = fakeServer();
  const key = await loadKey();
  await social.start(at(''));
  expect(social.supported).toBe(true);
  expect(social.me).toBe(null);
  expect(social.signedIn).toBe(false);
  expect(social.page).toBe('lobby');

  const socket = await lastSocket(1);
  expect(socket.url).toMatch(/^ws:\/\/.+\/api\/lobby$/);
  const hello = await goLive(socket, { rooms: [room('quiet'), room('busy', 5)], people: [] });
  expect(server.sent('POST', '/api/pass')[0].body).toEqual({ key: key.publicKey });
  expect(hello.pass).toBe(social.pass);
  expect(await verify(key.publicKey, `lobby:${hello.ts}`, hello.proof)).toBe(true);
  expect(social.isGuest).toBe(true);
  expect(social.myName).toBe('quiet-amber-fox-1');
  expect(social.lobbyStatus).toBe('live');
  expect(social.rooms.map((r) => r.id)).toEqual(['busy', 'quiet']);

  await social.start(at(''));   // once
  expect(sockets).toHaveLength(1);
});

test('A browser without Ed25519, or without IndexedDB, is unsupported, and nothing is asked of the server', async () => {
  const server = fakeServer();
  vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('No IndexedDB here', 'InvalidStateError'); });
  await social.start(at(''));
  expect(social.supported).toBe(false);
  expect(server.requests).toHaveLength(0);
  expect(sockets).toHaveLength(0);
});

test('?verified=1 says the email is confirmed and leaves the URL without it, keeping other params', async () => {
  fakeServer();
  const replaceState = vi.spyOn(history, 'replaceState').mockImplementation(() => {});
  await social.start(at('?room=abc&verified=1'));
  expect(social.notice).toBe('Your email is confirmed');
  expect(replaceState).toHaveBeenCalledTimes(1);
  expect(replaceState.mock.calls[0][2]).toBe(`${window.location.pathname}?room=abc`);
});

test('?reset=<token> opens the reset page; resetPassword sends the token and lands on sign-in', async () => {
  const server = fakeServer();
  server.route('POST /api/auth/reset-password', () => [200, { status: true }]);
  vi.spyOn(history, 'replaceState').mockImplementation(() => {});
  await social.start(at('?reset=abc'));
  expect(social.page).toBe('reset');
  expect(social.resetToken).toBe('abc');

  const asked = server.sent('GET', '/api/me').length;
  await social.resetPassword('a-new-long-password');
  expect(server.sent('POST', '/api/auth/reset-password')[0].body).toEqual({ newPassword: 'a-new-long-password', token: 'abc' });
  expect(server.sent('GET', '/api/me')).toHaveLength(asked + 1);   // a reset ends every session
  expect(social.page).toBe('sign-in');
  expect(social.notice).toBe('Your password is changed. Sign in with it');
});

test('An OAuth return: ?social=error with EMAIL_NOT_VERIFIED says so in words', async () => {
  fakeServer();
  const replaceState = vi.spyOn(history, 'replaceState').mockImplementation(() => {});
  await social.start(at('?social=error&error=EMAIL_NOT_VERIFIED'));
  expect(social.notice).toBe('Confirm your email with Discord or GitHub first');
  expect(replaceState.mock.calls[0][2]).toBe(window.location.pathname);
});

test('A Discord-made account without a username opens onboarding and stays out of the lobby until it picks one', async () => {
  const server = fakeServer();
  server.session = member({ username: null, needsOnboarding: true, providers: ['discord'] });
  server.route('POST /api/me/onboarding', (body) => {
    server.session = member({ username: body.username, providers: ['discord'] });
    return [200, server.session];
  });
  await social.start(at('?social=signed-in'));
  expect(social.page).toBe('onboarding');
  expect(social.signedIn).toBe(false);
  (await lastSocket(1)).accept();
  await vi.waitFor(() => expect(social.lobbyStatus).toBe('closed'));   // no pass to give: no retrying
  expect(sockets[0].sent).toHaveLength(0);

  await social.finishOnboarding('ansi-fan');
  expect(server.sent('POST', '/api/me/onboarding')[0].body).toEqual({ username: 'ansi-fan', termsAccepted: true });
  expect(social.me.username).toBe('ansi-fan');
  expect(social.page).toBe('lobby');
  const hello = await goLive(await lastSocket(2));
  expect(claimsOf(hello.pass)).toMatchObject({ name: 'ansi-fan', guest: false });
});

test('signIn picks the username or email endpoint; a wrong password, or a suspended account, shows the server\'s words', async () => {
  const server = fakeServer();
  await social.start(at(''));
  server.route('POST /api/auth/sign-in/email', () => [403, { code: 'BANNED_USER', message: 'You have been banned from this application' }]);
  expect(await social.signIn('banned@example.com', 'right-password')).toBe(false);
  expect(social.notice).toBe('This account is suspended');
  server.route('POST /api/auth/sign-in/email', () => ((server.session = member()), [200, { token: 't' }]));
  expect(await social.signIn('ansi-fan', 'wrong')).toBe(false);
  expect(social.notice).toBe(messageFor('INVALID_USERNAME_OR_PASSWORD'));
  expect(await social.signIn('ansi-fan', 'right-password')).toBe(true);
  expect(await social.signIn('fan@example.com', 'right-password')).toBe(true);
  expect(server.sent('POST', '/api/auth/sign-in/username').map((r) => r.body)).toEqual([
    { username: 'ansi-fan', password: 'wrong' }, { username: 'ansi-fan', password: 'right-password' },
  ]);
  expect(server.sent('POST', '/api/auth/sign-in/email').map((r) => r.body)).toEqual([
    { email: 'banned@example.com', password: 'right-password' }, { email: 'fan@example.com', password: 'right-password' },
  ]);
  expect(social.signedIn).toBe(true);
  expect(social.page).toBe('lobby');
});

test('Review focus 4: signing in with the lobby open reconnects with a member pass; signing out reconnects as a guest', async () => {
  const server = fakeServer();
  await social.start(at(''));
  const guestSocket = await lastSocket(1);
  await goLive(guestSocket, { rooms: [room('r1')], people: [] });
  expect(social.isGuest).toBe(true);

  await social.signIn('ansi-fan', 'right-password');
  expect(guestSocket.closed).toBe(true);
  const memberHello = await goLive(await lastSocket(2), { rooms: [room('r1')], people: [] });
  expect(claimsOf(memberHello.pass)).toMatchObject({ sub: 'u_1', name: 'ansi-fan', guest: false });
  expect(server.sent('POST', '/api/pass')[1].body.previous).toBeUndefined();   // a member pass names no guest
  expect(social.isGuest).toBe(false);
  expect(social.myName).toBe('ansi-fan');
  social.setSignal('chat');

  await social.signOut();
  expect(server.sent('POST', '/api/auth/sign-out')).toHaveLength(1);
  expect(sockets[1].closed).toBe(true);
  const guestHello = await goLive(await lastSocket(3));
  expect(claimsOf(guestHello.pass)).toMatchObject({ guest: true });
  expect(server.sent('POST', '/api/pass')[2].body.previous).toBeUndefined();   // a member's pass isn't a guest's previous
  expect(social.me).toBe(null);
  expect(social.isGuest).toBe(true);
  expect(social.signal).toBe(null);
  expect(sockets[2].signals()).toEqual([]);
});

test('Review focus 3: at renewAt a guest renews with its previous pass and a proof, keeps its nickname, and the lobby stays open', async () => {
  const server = fakeServer();
  const key = await loadKey();
  server.passTtlMs = 5 * 60_000 + 300;   // renewAt is 5 minutes before expiry: 300 ms from now
  await social.start(at(''));
  const socket = await lastSocket(1);
  await goLive(socket);
  const first = social.pass;
  server.passTtlMs = 3_600_000;

  await vi.waitFor(() => expect(server.sent('POST', '/api/pass')).toHaveLength(2));
  const { body } = server.sent('POST', '/api/pass')[1];
  expect(body.previous).toBe(first);
  expect(await verify(key.publicKey, `pass-renew:${body.ts}`, body.proof)).toBe(true);
  await vi.waitFor(() => expect(social.pass).not.toBe(first));
  expect(social.myName).toBe('quiet-amber-fox-1');
  expect(socket.closed).toBe(false);
  expect(sockets).toHaveLength(1);
  expect(social.lobbyStatus).toBe('live');

  socket.close();   // the next hello uses the renewed pass
  const again = await lastSocket(2);
  again.accept();
  await vi.waitFor(() => expect(again.sent[0]?.pass).toBe(social.pass));
  expect(server.sent('POST', '/api/pass')).toHaveLength(2);
});

test('A member\'s renewal names no previous pass', async () => {
  const server = fakeServer();
  server.session = member();
  server.passTtlMs = 5 * 60_000 + 300;
  await social.start(at(''));
  await goLive(await lastSocket(1));
  server.passTtlMs = 3_600_000;
  await vi.waitFor(() => expect(server.sent('POST', '/api/pass')).toHaveLength(2));
  expect(server.sent('POST', '/api/pass')[1].body.previous).toBeUndefined();
});

test('A guest pass still on its way when you sign in is dropped, not used', async () => {
  const server = fakeServer();
  let release;
  await social.start(at(''));
  const held = new Promise((resolve) => { release = resolve; });
  const passRoute = server.routeOf('POST /api/pass');
  server.route('POST /api/pass', async (body) => {
    const answer = passRoute(body);   // a guest's, minted now, arriving after the sign-in
    await held;
    return answer;
  });
  (await lastSocket(1)).accept();
  await vi.waitFor(() => expect(server.sent('POST', '/api/pass')).toHaveLength(1));

  server.route('POST /api/pass', passRoute);
  await social.signIn('ansi-fan', 'right-password');
  const hello = await goLive(await lastSocket(2));
  expect(claimsOf(hello.pass).guest).toBe(false);
  release();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(social.claims.guest).toBe(false);
  expect(social.pass).toBe(hello.pass);
});

test('After a disconnect, connecting again re-arms the renewal of the pass it still holds', async () => {
  const server = fakeServer();
  server.passTtlMs = 5 * 60_000 + 600;
  await social.start(at(''));
  await goLive(await lastSocket(1));
  server.passTtlMs = 3_600_000;
  social.disconnectLobby();
  social.connectLobby();
  await goLive(await lastSocket(2));
  expect(server.sent('POST', '/api/pass')).toHaveLength(1);   // the held pass is used
  await vi.waitFor(() => expect(server.sent('POST', '/api/pass')).toHaveLength(2), { timeout: 3000 });
  expect(server.sent('POST', '/api/pass')[1].body.previous).toBeTruthy();
});

test('A renewal that comes back after a disconnect is ignored and arms no timer', async () => {
  const server = fakeServer();
  server.passTtlMs = 5 * 60_000 + 300;
  await social.start(at(''));
  await goLive(await lastSocket(1));
  const first = social.pass;
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const passRoute = server.routeOf('POST /api/pass');
  server.route('POST /api/pass', async (body) => {
    const answer = passRoute(body);
    await held;
    return answer;
  });
  await vi.waitFor(() => expect(server.sent('POST', '/api/pass')).toHaveLength(2));
  social.disconnectLobby();
  release();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(social.pass).toBe(first);
  expect(social._renewTimer).toBe(null);
});

test('A renewal that fails for a passing reason is tried again 30 s later', async () => {
  const server = fakeServer();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  await social.start(at(''));
  await goLive(await lastSocket(1));
  const first = social.pass;
  const passRoute = server.routeOf('POST /api/pass');
  server.route('POST /api/pass', () => [429, { code: 'THROTTLED' }]);

  await vi.advanceTimersByTimeAsync(55 * 60_000);   // renewAt: 5 minutes before the hour is up
  await vi.waitFor(() => expect(server.sent('POST', '/api/pass')).toHaveLength(2));
  server.route('POST /api/pass', passRoute);
  await vi.advanceTimersByTimeAsync(29_000);
  expect(server.sent('POST', '/api/pass')).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(1000);
  await vi.waitFor(() => expect(server.sent('POST', '/api/pass')).toHaveLength(3));
  await vi.waitFor(() => expect(social.pass).not.toBe(first));
  expect(server.sent('POST', '/api/pass')[2].body.previous).toBe(first);
  expect(social.lobbyStatus).toBe('live');
});

test('A member whose renewal comes back as a guest pass (the session ended) is signed out', async () => {
  const server = fakeServer();
  server.session = member();
  server.passTtlMs = 5 * 60_000 + 300;
  await social.start(at(''));
  await goLive(await lastSocket(1));
  social.setSignal('chat');
  server.passTtlMs = 3_600_000;
  server.session = null;
  await vi.waitFor(() => expect(social.me).toBe(null));
  expect(social.signal).toBe(null);
  const hello = await goLive(await lastSocket(2));
  expect(claimsOf(hello.pass).guest).toBe(true);
  expect(social.isGuest).toBe(true);
});

test('SUSPENDED shows its notice, with the date or for good, and the lobby doesn\'t keep asking for a pass', async () => {
  const server = fakeServer();
  const until = Date.UTC(2027, 0, 15, 12);
  server.suspended = { until };
  await social.start(at(''));
  expect(social.notice).toBe(messageFor('SUSPENDED', { until }));
  expect(social.notice).toMatch(/^This account is suspended until /);
  expect(social.me).toBe(null);
  const socket = await lastSocket(1);
  socket.accept();
  await vi.waitFor(() => expect(social.lobbyStatus).toBe('closed'));
  expect(socket.sent).toHaveLength(0);

  server.suspended = { until: null };
  await social.refreshMe();
  expect(social.notice).toBe('This account is suspended for good');
});

test('setSignal is for members: it shows at once, and is sent at most once per 2 s with the latest value', async () => {
  const server = fakeServer();
  server.session = member();
  await social.start(at(''));
  const socket = await lastSocket(1);
  await goLive(socket);

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  social.setSignal('chat');
  social.setSignal('feedback');
  social.setSignal('heads-down');
  expect(social.signal).toBe('heads-down');
  expect(socket.signals()).toEqual(['chat']);
  vi.advanceTimersByTime(1999);
  expect(socket.signals()).toEqual(['chat']);
  vi.advanceTimersByTime(1);
  expect(socket.signals()).toEqual(['chat', 'heads-down']);
  vi.useRealTimers();

  // The server's answer for your own sub is your signal; another person's isn't.
  socket.receive({ type: 'person', person: { sub: 'u_2', name: 'other', guest: false, signal: 'chat' } });
  expect(social.signal).toBe('heads-down');
  socket.receive({ type: 'person', person: { sub: 'u_1', name: 'ansi-fan', guest: false, signal: 'feedback' } });
  expect(social.signal).toBe('feedback');
  expect(social.people.map((p) => p.sub)).toEqual(['u_1', 'u_2']);

  // A new socket starts over: the current signal goes again once it's live.
  socket.close();
  await goLive(await lastSocket(2));
  expect(sockets[1].signals()).toEqual(['feedback']);
});

test('A guest\'s setSignal does nothing; a refused pass empties the lobby', async () => {
  fakeServer();
  await social.start(at(''));
  const socket = await lastSocket(1);
  await goLive(socket, { rooms: [room('r1')], people: [] });
  social.setSignal('chat');
  expect(social.signal).toBe(null);
  expect(socket.signals()).toEqual([]);

  socket.receive({ type: 'refused', code: 'bad-pass' });
  expect(social.lobbyStatus).toBe('refused');
  expect(social.rooms).toEqual([]);
});

test('unlink finds the account for the provider; SESSION_EXPIRED goes to sign-in with its notice', async () => {
  const server = fakeServer();
  server.session = member({ providers: ['credential', 'discord'] });
  server.route('GET /api/auth/list-accounts', () => [200, [
    { id: 'acc_1', providerId: 'credential', accountId: 'u_1' },
    { id: 'acc_2', providerId: 'discord', accountId: '1234' },
  ]]);
  server.route('POST /api/auth/unlink-account', () => [403, { code: 'SESSION_EXPIRED' }]);
  await social.start(at(''));
  social.page = 'account';
  expect(await social.unlink('discord')).toBe(false);
  expect(server.sent('POST', '/api/auth/unlink-account')[0].body).toEqual({ accountId: 'acc_2' });
  expect(social.page).toBe('sign-in');
  expect(social.notice).toBe('Sign in again to change how you sign in');

  server.route('POST /api/auth/unlink-account', () => {
    server.session = member({ providers: ['credential'] });
    return [200, { status: true }];
  });
  social.page = 'account';
  expect(await social.unlink('discord')).toBe(true);
  expect(social.me.providers).toEqual(['credential']);
  expect(social.page).toBe('account');

  social.notice = null;
  expect(await social.unlink('github')).toBe(false);
  expect(social.notice).toBe("That way to sign in isn't connected");
  expect(server.sent('POST', '/api/auth/unlink-account')).toHaveLength(2);
});

test('Deleting without a password after a stale sign-in goes to sign-in with the same notice', async () => {
  const server = fakeServer();
  server.session = member({ providers: ['discord'] });
  server.route('POST /api/auth/delete-user', () => [400, { code: 'SESSION_EXPIRED' }]);
  await social.start(at(''));
  social.page = 'account';
  expect(await social.deleteAccount()).toBe(false);
  expect(server.sent('POST', '/api/auth/delete-user')[0].body).toEqual({});
  expect(social.page).toBe('sign-in');
  expect(social.notice).toBe('Sign in again to change how you sign in');
  expect(social.me).not.toBe(null);
});

test('The account actions send the server\'s shapes', async () => {
  const server = fakeServer();
  const assign = vi.fn();
  const origin = window.location.origin;
  server.route('POST /api/auth/sign-up/email', (body) => ((server.session = member({ username: body.username, emailVerified: false })), [200, {}]));
  server.route('POST /api/auth/sign-in/social', () => [200, { url: 'https://discord.com/oauth2/authorize?x=1', redirect: true }]);
  server.route('POST /api/auth/link-social', () => [200, { url: 'https://github.com/login/oauth/authorize?x=1', redirect: true }]);
  server.route('POST /api/auth/request-password-reset', () => [200, { status: true }]);
  server.route('POST /api/auth/send-verification-email', () => [200, { status: true }]);
  server.route('PATCH /api/me/username', (body) => ((server.session = member({ username: body.username })), [200, server.session]));
  server.route('GET /api/blocks', () => [200, { blocked: [{ username: 'troll', since: 1 }, { username: 'other one', since: 2 }] }]);
  server.route('DELETE /api/blocks/other%20one', () => [200, {}]);
  server.route('POST /api/auth/delete-user', () => ((server.session = null), [200, { success: true }]));
  await social.start(at(''));
  await goLive(await lastSocket(1));

  await social.signInWith('discord', { assign });
  expect(server.sent('POST', '/api/auth/sign-in/social')[0].body).toEqual({
    provider: 'discord', callbackURL: `${origin}/?social=signed-in`, errorCallbackURL: `${origin}/?social=error`,
  });
  expect(assign).toHaveBeenCalledWith('https://discord.com/oauth2/authorize?x=1');

  social.page = 'create';
  expect(await social.signUp({ username: 'ansi-fan', email: 'fan@example.com', password: 'long-enough-1', termsAccepted: true, turnstileToken: 'tt' })).toBe(true);
  const signUp = server.sent('POST', '/api/auth/sign-up/email')[0];
  expect(signUp.body).toEqual({
    username: 'ansi-fan', name: 'ansi-fan', email: 'fan@example.com', password: 'long-enough-1', termsAccepted: true,
    callbackURL: `${origin}/?verified=1`,
  });
  expect(signUp.headers['x-turnstile-token']).toBe('tt');
  expect(social.page).toBe('lobby');
  expect(social.notice).toBe('Check your email to confirm your address');
  expect(social.signedIn).toBe(true);
  expect(claimsOf((await goLive(await lastSocket(2))).pass).guest).toBe(false);

  await social.resendConfirmation();
  expect(server.sent('POST', '/api/auth/send-verification-email')[0].body).toEqual({ email: 'fan@example.com', callbackURL: `${origin}/?verified=1` });

  await social.requestReset('fan@example.com', 'tt2');
  const reset = server.sent('POST', '/api/auth/request-password-reset')[0];
  expect(reset.body).toEqual({ email: 'fan@example.com' });
  expect(reset.headers['x-turnstile-token']).toBe('tt2');
  expect(social.notice).toBe('If that email has an account, a link is on its way');

  await social.linkWith('github', { assign });
  expect(server.sent('POST', '/api/auth/link-social')[0].body).toMatchObject({ provider: 'github' });
  expect(assign).toHaveBeenLastCalledWith('https://github.com/login/oauth/authorize?x=1');

  expect(await social.rename('new-name')).toBe(true);
  expect(server.sent('PATCH', '/api/me/username')[0].body).toEqual({ username: 'new-name' });
  expect(social.me.username).toBe('new-name');
  expect(claimsOf((await goLive(await lastSocket(3))).pass).name).toBe('new-name');   // the pass carries the name

  await social.loadBlocked();
  expect(social.blocked.map((b) => b.username)).toEqual(['troll', 'other one']);
  await social.unblock('other one');
  expect(social.blocked.map((b) => b.username)).toEqual(['troll']);

  expect(await social.deleteAccount('long-enough-1')).toBe(true);
  expect(server.sent('POST', '/api/auth/delete-user')[0].body).toEqual({ password: 'long-enough-1' });
  expect(social.me).toBe(null);
  expect(social.page).toBe('lobby');
  expect(social.notice).toBe('Your account is deleted');
  const hello = await goLive(await lastSocket(4));
  expect(claimsOf(hello.pass).guest).toBe(true);

  social.openRoom('r1');
  expect(social.joining).toBe('r1');
});
