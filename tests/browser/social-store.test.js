// The social store: you, your pass and the lobby, against the fake server (tests/support/socialServer.js);
// the browser's key is real, so the proofs verify with WebCrypto.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore, hasReportedRoom } from '@/store/RoomStore';
import { forgetKey, loadKey } from '@/social/keys';
import { ownSocialDatabase } from '../support/socialDatabase.js';
import { verify, claimsOf, member, fakeServer, sockets, useFakeSockets, goLive, lastSocket, at } from '../support/socialServer.js';
import { messageFor } from '@/social/messages';
import { desktopQuery } from '@/social/config';

let deleteDatabase;

const room = (id, count = 1) => ({
  id, name: `Room ${id}`, host: 'ansi-fan', count, max: 12, allowGuests: true, signal: null,
  liveSince: 1000, thumbnail: null, blockedInside: false,
});

let social;
beforeEach(async () => {
  deleteDatabase = ownSocialDatabase('store');
  forgetKey();
  await deleteDatabase();
  localStorage.clear();
  sessionStorage.clear();
  useFakeSockets();
  vi.stubGlobal('matchMedia', (query) => ({ matches: query === desktopQuery }));   // a desktop: links back are read
  setActivePinia(createPinia());
  social = useSocialStore();
});
afterEach(() => {
  social.disconnectLobby();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('A plain page load runs nothing SOCIAL: no key, no IndexedDB, no request; showing the tab starts it all', async () => {
  const server = fakeServer();
  const opened = vi.spyOn(indexedDB, 'open');
  const generated = vi.spyOn(crypto.subtle, 'generateKey');
  await social.start(at('?keep=abc'));
  expect(social.supported).toBe(null);
  expect(opened).not.toHaveBeenCalled();
  expect(generated).not.toHaveBeenCalled();
  expect(server.requests).toEqual([]);

  await social.showLobby();
  expect(opened).toHaveBeenCalled();
  expect(social.supported).toBe(true);
  expect(server.sent('GET', '/api/me')).toHaveLength(1);
});

test('With no session, showing the tab gets a guest pass and says hello with it; the state makes the lobby live', async () => {
  const server = fakeServer();
  await social.start(at(''));
  const showing = social.showLobby();
  expect(sockets).toHaveLength(0);   // not until you're known
  await showing;
  const key = await loadKey();
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
  await social.showLobby();
  expect(sockets).toHaveLength(1);
  expect(server.sent('GET', '/api/me')).toHaveLength(1);
});

test('The lobby asked for while a link back is still finding out who you are connects once it has', async () => {
  const server = fakeServer();
  vi.spyOn(history, 'replaceState').mockImplementation(() => {});
  const starting = social.start(at('?verified=1'));
  social.showLobby();
  expect(sockets).toHaveLength(0);
  await starting;
  expect(server.sent('GET', '/api/me')).toHaveLength(1);
  await goLive(await lastSocket(1));
  expect(social.lobbyStatus).toBe('live');
});

test('A browser without Ed25519, or without IndexedDB, is unsupported, and nothing is asked of the server', async () => {
  const server = fakeServer();
  vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('No IndexedDB here', 'InvalidStateError'); });
  await social.start(at(''));
  await social.showLobby();
  expect(social.supported).toBe(false);
  expect(server.requests).toHaveLength(0);
  expect(sockets).toHaveLength(0);
});

test('?verified=1 says the email is confirmed and leaves the URL without it, keeping other params', async () => {
  fakeServer();
  const replaceState = vi.spyOn(history, 'replaceState').mockImplementation(() => {});
  await social.start(at('?keep=abc&verified=1'));
  await social.showLobby();
  expect(social.notice).toBe('Your email is confirmed');
  expect(replaceState).toHaveBeenCalledTimes(1);
  expect(replaceState.mock.calls[0][2]).toBe(`${window.location.pathname}?keep=abc`);
});

test('?verified=1 with an error (a used or expired link) says so in words', async () => {
  fakeServer();
  vi.spyOn(history, 'replaceState').mockImplementation(() => {});
  await social.start(at('?verified=1&error=TOKEN_EXPIRED'));
  expect(social.notice).toBe('That link has expired or was already used. Ask for a new one.');
});

test('?reset=<token> opens the reset page; resetPassword sends the token and lands on sign-in', async () => {
  const server = fakeServer();
  server.route('POST /api/auth/reset-password', () => [200, { status: true }]);
  vi.spyOn(history, 'replaceState').mockImplementation(() => {});
  await social.start(at('?reset=abc'));
  await social.showLobby();
  expect(social.page).toBe('reset');
  expect(social.resetToken).toBe('abc');

  const asked = server.sent('GET', '/api/me').length;
  await social.resetPassword('a-new-long-password');
  expect(server.sent('POST', '/api/auth/reset-password')[0].body).toEqual({ newPassword: 'a-new-long-password', token: 'abc' });
  expect(server.sent('GET', '/api/me')).toHaveLength(asked + 1);   // a reset ends every session
  expect(social.page).toBe('sign-in');
  expect(social.notice).toBe('Your password is changed. Sign in with it');
});

test('An OAuth return: ?social=error with EMAIL_NOT_VERIFIED says so in words, and its error params leave the URL', async () => {
  fakeServer();
  const replaceState = vi.spyOn(history, 'replaceState').mockImplementation(() => {});
  await social.start(at('?social=error&error=EMAIL_NOT_VERIFIED&error_description=Email%20not%20verified&keep=abc'));
  await social.showLobby();
  expect(social.notice).toBe('Confirm your email with Discord or GitHub first');
  expect(replaceState.mock.calls[0][2]).toBe(`${window.location.pathname}?keep=abc`);
});

test('A Discord-made account without a username opens onboarding and stays out of the lobby until it picks one', async () => {
  const server = fakeServer();
  server.session = member({ username: null, needsOnboarding: true, providers: ['discord'] });
  server.route('POST /api/me/onboarding', (body) => {
    server.session = member({ username: body.username, providers: ['discord'] });
    return [200, server.session];
  });
  await social.start(at('?social=signed-in'));
  await social.showLobby();
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
  await social.showLobby();
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

test('reportRoom sends report-room on the lobby socket and remembers it', async () => {
  const server = fakeServer();
  server.session = member();
  await social.start(at(''));
  await social.showLobby();
  const socket = await lastSocket(1);
  expect(social.reportRoom('quiet', 'spam')).toBe(false);   // the lobby isn't open yet
  await goLive(socket, { rooms: [room('quiet')], people: [] });
  const reports = () => socket.sent.filter((m) => m.type === 'report-room');

  expect(social.reportRoom('quiet', 'rude')).toBe(false);   // not a reason
  social.claims = { ...social.claims, guest: true, verified: false };
  expect(social.reportRoom('quiet', 'spam')).toBe(false);   // a guest
  social.claims = { ...social.claims, guest: false, verified: false };
  expect(social.reportRoom('quiet', 'spam')).toBe(false);   // unconfirmed
  social.claims = { ...social.claims, verified: true };
  expect(reports()).toEqual([]);
  expect(hasReportedRoom('quiet')).toBe(false);

  expect(social.reportRoom('quiet', 'spam')).toBe(true);
  expect(reports()).toEqual([{ type: 'report-room', id: 'quiet', reason: 'spam' }]);
  expect(hasReportedRoom('quiet')).toBe(true);
  expect(social.reportRoom('quiet', 'other')).toBe(false);   // once is enough
  expect(reports()).toHaveLength(1);
});

// A sign-in to an account with two-factor on: no session yet, only the challenge, until a code is verified.
function twoFactorServer() {
  const server = fakeServer();
  server.route('POST /api/auth/sign-in/email', () => [200, { twoFactorRedirect: true, twoFactorMethods: ['totp'] }]);
  server.route('POST /api/auth/two-factor/verify-totp', () => ((server.session = member({ twoFactorEnabled: true })), [200, { token: 't' }]));
  server.route('POST /api/auth/two-factor/verify-backup-code', () => ((server.session = member({ twoFactorEnabled: true })), [200, { token: 't' }]));
  return server;
}

test('A sign-in that answers twoFactorRedirect goes to the Two-factor page, signed in as no one yet', async () => {
  const server = twoFactorServer();
  await social.start(at(''));
  await social.showLobby();
  const asked = server.sent('GET', '/api/me').length;
  const connected = sockets.length;
  expect(await social.signIn('fan@example.com', 'right-password')).toBe(true);
  expect(social.page).toBe('two-factor');
  expect(social.me).toBe(null);
  expect(social.notice).toBe(null);
  expect(server.sent('GET', '/api/me')).toHaveLength(asked);
  expect(sockets).toHaveLength(connected);   // no reconnect
});

test('verifyTwoFactor sends the code without spaces, and with trustDevice; then you are signed in', async () => {
  const server = twoFactorServer();
  await social.start(at(''));
  await social.showLobby();
  await social.signIn('fan@example.com', 'right-password');
  expect(await social.verifyTwoFactor('123 456', { trustDevice: true })).toBe(true);
  expect(server.sent('POST', '/api/auth/two-factor/verify-totp').map((r) => r.body)).toEqual([{ code: '123456', trustDevice: true }]);
  expect(social.signedIn).toBe(true);
  expect(social.page).toBe('lobby');

  social.page = 'two-factor';
  expect(await social.verifyTwoFactor(' abcde- fghij\t', { backup: true })).toBe(true);
  expect(server.sent('POST', '/api/auth/two-factor/verify-backup-code').map((r) => r.body)).toEqual([{ code: 'abcde-fghij', trustDevice: false }]);

  server.route('POST /api/auth/two-factor/verify-totp', () => [401, { code: 'INVALID_CODE' }]);
  social.page = 'two-factor';
  expect(await social.verifyTwoFactor('000000')).toBe(false);
  expect(social.notice).toBe("That code isn't right");
  expect(social.page).toBe('two-factor');
});

test('An expired challenge (INVALID_TWO_FACTOR_COOKIE) goes back to Sign in with its words', async () => {
  const server = twoFactorServer();
  server.route('POST /api/auth/two-factor/verify-totp', () => [401, { code: 'INVALID_TWO_FACTOR_COOKIE' }]);
  await social.start(at(''));
  await social.showLobby();
  await social.signIn('fan@example.com', 'right-password');
  expect(await social.verifyTwoFactor('123456')).toBe(false);
  expect(social.page).toBe('sign-in');
  expect(social.notice).toBe('That took too long. Sign in again');
  expect(social.me).toBe(null);
});

test.each(['TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE', 'ACCOUNT_TEMPORARILY_LOCKED'])('Too many wrong codes (%s) goes back to Sign in with its words', async (failure) => {
  const server = twoFactorServer();
  server.route('POST /api/auth/two-factor/verify-totp', () => [401, { code: failure }]);
  await social.start(at(''));
  await social.showLobby();
  await social.signIn('fan@example.com', 'right-password');
  expect(await social.verifyTwoFactor('123456')).toBe(false);
  expect(social.page).toBe('sign-in');
  expect(social.notice).toBe('Too many wrong codes. Wait a few minutes, then sign in again');
});

test('A challenged sign-in while signed in ends that sign-in: no one, on the Two-factor page, the lobby reconnected as a guest', async () => {
  const server = fakeServer();
  server.session = member();
  await social.start(at(''));
  await social.showLobby();
  const memberSocket = await lastSocket(1);
  await goLive(memberSocket, { rooms: [], people: [] });
  expect(social.signedIn).toBe(true);

  server.route('POST /api/auth/sign-in/email', () => ((server.session = null), [200, { twoFactorRedirect: true, twoFactorMethods: ['totp'] }]));
  expect(await social.signIn('other@example.com', 'right-password')).toBe(true);
  expect(social.page).toBe('two-factor');
  expect(social.me).toBe(null);
  expect(memberSocket.closed).toBe(true);
  const guestHello = await goLive(await lastSocket(2));
  expect(claimsOf(guestHello.pass)).toMatchObject({ guest: true });
});

test('A blank code (only whitespace) is not sent, to confirm two-factor or to sign in', async () => {
  const server = twoFactorServer();
  await social.start(at(''));
  await social.showLobby();
  await social.signIn('fan@example.com', 'right-password');
  expect(await social.verifyTwoFactor(' \t ')).toBe(false);
  expect(await social.verifyTwoFactor('  ', { backup: true })).toBe(false);
  expect(await social.confirmTwoFactor(' ')).toBe(false);
  expect(server.requests.filter((r) => r.path.includes('/two-factor/'))).toEqual([]);
});

test('?social=two-factor&verified=1 opens the Two-factor page with the email confirmed', async () => {
  fakeServer();
  vi.spyOn(history, 'replaceState').mockImplementation(() => {});
  await social.start(at('?social=two-factor&verified=1'));
  await social.showLobby();
  expect(social.page).toBe('two-factor');
  expect(social.notice).toBe('Your email is confirmed');
});

test('?social=two-factor opens the Two-factor page and leaves the URL', async () => {
  fakeServer();
  const replaceState = vi.spyOn(history, 'replaceState').mockImplementation(() => {});
  await social.start(at('?social=two-factor&keep=abc'));
  await social.showLobby();
  expect(social.page).toBe('two-factor');
  expect(replaceState.mock.calls[0][2]).toBe(`${window.location.pathname}?keep=abc`);
});

test('busy lasts the whole sign-in, sign-up or provider sign-in (until you\'re known, or gone), so neither form is sent twice', async () => {
  const server = fakeServer();
  await social.start(at(''));
  server.route('POST /api/auth/sign-up/email', () => ((server.session = member({ emailVerified: false })), [200, { token: null }]));
  server.route('POST /api/auth/sign-in/social', ({ provider }) => (provider === 'discord'
    ? [200, { url: 'https://discord.example/authorize', redirect: true }] : [500, { code: 'OOPS' }]));
  const me = server.routeOf('GET /api/me');
  let answerMe = null;
  server.route('GET /api/me', () => new Promise((resolve) => { answerMe = () => resolve(me()); }));

  const actions = [
    () => social.signIn('fan@example.com', 'right-password'),
    () => social.signUp({ username: 'pixel_wren', email: 'wren@example.com', password: 'a long password', termsAccepted: true }),
  ];
  for (const act of actions) {
    const done = act();
    await vi.waitFor(() => expect(answerMe).toBeTypeOf('function'));   // signed in; asking who you are
    expect(social.busy).toBe(true);
    answerMe();
    answerMe = null;
    expect(await done).toBe(true);
    expect(social.busy).toBe(false);
  }
  expect(social.notice).toBe('Check your email to confirm your address');

  const location = { assign: vi.fn() };
  await social.signInWith('discord', location);
  expect(location.assign).toHaveBeenCalledWith('https://discord.example/authorize');
  expect(social.busy).toBe(true);   // on the way to Discord
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));   // back from it (the page kept)
  expect(social.busy).toBe(false);
  await social.signInWith('github', location);   // refused: nowhere to go
  expect(social.busy).toBe(false);
});

test('Review focus 4: signing in with the lobby open reconnects with a member pass; signing out reconnects as the guest you were', async () => {
  const server = fakeServer();
  await social.start(at(''));
  await social.showLobby();
  const guestSocket = await lastSocket(1);
  await goLive(guestSocket, { rooms: [room('r1')], people: [] });
  expect(social.isGuest).toBe(true);
  const guestPass = social.pass;

  await social.signIn('ansi-fan', 'right-password');
  expect(guestSocket.closed).toBe(true);
  const memberHello = await goLive(await lastSocket(2), { rooms: [room('r1')], people: [] });
  expect(claimsOf(memberHello.pass)).toMatchObject({ sub: 'u_1', name: 'ansi-fan', guest: false });
  expect(server.sent('POST', '/api/pass')[1].body.previous).toBeUndefined();   // a member pass names no guest
  expect(social.isGuest).toBe(false);
  expect(social.myName).toBe('ansi-fan');

  await social.signOut();
  expect(server.sent('POST', '/api/auth/sign-out')).toHaveLength(1);
  expect(sockets[1].closed).toBe(true);
  const guestHello = await goLive(await lastSocket(3));
  expect(claimsOf(guestHello.pass)).toMatchObject({ guest: true });
  expect(server.sent('POST', '/api/pass')[2].body.previous).toBe(guestPass);   // the guest you were before, never the member's pass
  expect(claimsOf(guestHello.pass).name).toBe('quiet-amber-fox-1');
  expect(social.me).toBe(null);
  expect(social.isGuest).toBe(true);
});

test('A reload comes back as the same guest: the last guest pass is kept in the browser and sent, with a proof, as previous', async () => {
  const server = fakeServer();
  const key = await loadKey();
  await social.start(at(''));
  await social.showLobby();
  await goLive(await lastSocket(1));
  const first = social.pass;
  expect(social.myName).toBe('quiet-amber-fox-1');

  social.disconnectLobby();   // the page reloads: a new store, the same browser (its key and its storage)
  forgetKey();
  setActivePinia(createPinia());
  social = useSocialStore();
  await social.start(at(''));
  await social.showLobby();
  await goLive(await lastSocket(2));
  const { body } = server.sent('POST', '/api/pass')[1];
  expect(body.previous).toBe(first);
  expect(await verify(key.publicKey, `pass-renew:${body.ts}`, body.proof)).toBe(true);
  expect(social.myName).toBe('quiet-amber-fox-1');
  expect(claimsOf(social.pass).sub).toBe(claimsOf(first).sub);
});

test('Review focus 3: at renewAt a guest renews with its previous pass and a proof, keeps its nickname, and the lobby stays open', async () => {
  const server = fakeServer();
  const key = await loadKey();
  server.passTtlMs = 5 * 60_000 + 300;   // renewAt is 5 minutes before expiry: 300 ms from now
  await social.start(at(''));
  await social.showLobby();
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
  await social.showLobby();
  await goLive(await lastSocket(1));
  server.passTtlMs = 3_600_000;
  await vi.waitFor(() => expect(server.sent('POST', '/api/pass')).toHaveLength(2));
  expect(server.sent('POST', '/api/pass')[1].body.previous).toBeUndefined();
});

test('A guest pass still on its way when you sign in is dropped, not used', async () => {
  const server = fakeServer();
  let release;
  await social.start(at(''));
  await social.showLobby();
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
  await social.showLobby();
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
  await social.showLobby();
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
  await social.showLobby();
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
  await social.showLobby();
  await goLive(await lastSocket(1));
  server.passTtlMs = 3_600_000;
  server.session = null;
  await vi.waitFor(() => expect(social.me).toBe(null));
  const hello = await goLive(await lastSocket(2));
  expect(claimsOf(hello.pass).guest).toBe(true);
  expect(social.isGuest).toBe(true);
});

test('SUSPENDED shows its notice, with the date or for good, and the lobby doesn\'t keep asking for a pass', async () => {
  const server = fakeServer();
  const until = Date.UTC(2027, 0, 15, 12);
  server.suspended = { until };
  await social.start(at(''));
  await social.showLobby();
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

test('A refused pass is tried once more with a fresh one; refused again, the lobby is emptied and stays refused', async () => {
  const server = fakeServer();
  await social.start(at(''));
  await social.showLobby();
  await goLive(await lastSocket(1), { rooms: [room('r1')], people: [] });
  const refuse = async (socket) => {
    socket.accept();
    await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('hello'));
    socket.receive({ type: 'refused', code: 'bad-pass' });
  };

  sockets[0].receive({ type: 'refused', code: 'bad-pass' });
  expect(social.lobbyStatus).toBe('connecting');
  await refuse(await lastSocket(2));
  expect(server.sent('POST', '/api/pass')).toHaveLength(2);
  expect(sockets[1].sent[0].pass).toBe(social.pass);
  expect(social.lobbyStatus).toBe('refused');
  expect(social.rooms).toEqual([]);
  await new Promise((resolve) => setTimeout(resolve, 1200));   // past the first backoff
  expect(sockets).toHaveLength(2);

  // Live again (signing in reconnects): a refusal gets its one more try again.
  await social.signIn('ansi-fan', 'right-password');
  await goLive(await lastSocket(3));
  sockets[2].receive({ type: 'refused', code: 'bad-pass' });
  expect(social.lobbyStatus).toBe('connecting');
  await lastSocket(4);
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
  await social.showLobby();
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

test('startTwoFactor sends the password only when given, and SESSION_NOT_FRESH goes to Sign in with the notice', async () => {
  const server = fakeServer();
  server.session = member();
  const setup = { totpURI: 'otpauth://totp/Phosphor:ansi-fan?secret=JBSWY3DPEHPK3PXP&issuer=Phosphor', backupCodes: ['a-1', 'b-2'] };
  server.route('POST /api/auth/two-factor/enable', () => [200, setup]);
  await social.start(at(''));
  await social.showLobby();
  social.page = 'account';
  expect(await social.startTwoFactor('right-password')).toEqual(setup);
  expect(await social.startTwoFactor()).toEqual(setup);
  expect(server.sent('POST', '/api/auth/two-factor/enable').map((r) => r.body)).toEqual([{ password: 'right-password' }, {}]);

  server.route('POST /api/auth/two-factor/enable', () => [403, { code: 'SESSION_NOT_FRESH' }]);
  expect(await social.startTwoFactor()).toBe(null);
  expect(social.page).toBe('sign-in');
  expect(social.notice).toBe('Sign in again to change how you sign in');
});

test('confirmTwoFactor strips spaces and refreshes me', async () => {
  const server = fakeServer();
  server.session = member();
  server.route('POST /api/auth/two-factor/verify-totp', () => ((server.session = member({ twoFactorEnabled: true })), [200, { token: 't' }]));
  await social.start(at(''));
  await social.showLobby();
  social.page = 'account';
  expect(await social.confirmTwoFactor(' 123 456\t')).toBe(true);
  expect(server.sent('POST', '/api/auth/two-factor/verify-totp').map((r) => r.body)).toEqual([{ code: '123456' }]);
  expect(social.me.twoFactorEnabled).toBe(true);
  expect(social.page).toBe('account');

  server.route('POST /api/auth/two-factor/verify-totp', () => [401, { code: 'INVALID_CODE' }]);
  expect(await social.confirmTwoFactor('000000')).toBe(false);
  expect(social.notice).toBe("That code isn't right");
});

test('turnOffTwoFactor and newBackupCodes send the password only when given, and a stale sign-in goes to Sign in', async () => {
  const server = fakeServer();
  server.session = member({ twoFactorEnabled: true });
  server.route('POST /api/auth/two-factor/disable', () => ((server.session = member()), [200, { status: true }]));
  server.route('POST /api/auth/two-factor/generate-backup-codes', () => [200, { backupCodes: ['c-3', 'd-4'] }]);
  await social.start(at(''));
  await social.showLobby();
  social.page = 'account';
  expect(await social.newBackupCodes('right-password')).toEqual(['c-3', 'd-4']);
  expect(await social.newBackupCodes()).toEqual(['c-3', 'd-4']);
  expect(server.sent('POST', '/api/auth/two-factor/generate-backup-codes').map((r) => r.body)).toEqual([{ password: 'right-password' }, {}]);
  expect(await social.turnOffTwoFactor('right-password')).toBe(true);
  expect(server.sent('POST', '/api/auth/two-factor/disable')[0].body).toEqual({ password: 'right-password' });
  expect(social.me.twoFactorEnabled).toBe(false);

  server.route('POST /api/auth/two-factor/disable', () => [403, { code: 'SESSION_NOT_FRESH' }]);
  server.route('POST /api/auth/two-factor/generate-backup-codes', () => [403, { code: 'SESSION_NOT_FRESH' }]);
  expect(await social.newBackupCodes()).toBe(null);
  expect(social.page).toBe('sign-in');
  social.page = 'account';
  expect(await social.turnOffTwoFactor()).toBe(false);
  expect(server.sent('POST', '/api/auth/two-factor/disable')[1].body).toEqual({});
  expect(social.page).toBe('sign-in');
});

test('Deleting without a password after a stale sign-in goes to sign-in with the same notice', async () => {
  const server = fakeServer();
  server.session = member({ providers: ['discord'] });
  server.route('POST /api/auth/delete-user', () => [400, { code: 'SESSION_EXPIRED' }]);
  await social.start(at(''));
  await social.showLobby();
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
  server.route('GET /api/blocks', () => [200, { blocked: [{ id: 'u_9', username: 'troll', since: 1 }, { id: 'u_8', username: 'other one', since: 2 }] }]);
  server.route('DELETE /api/blocks/other%20one', () => [200, {}]);
  server.route('POST /api/auth/delete-user', () => ((server.session = null), [200, { success: true }]));
  await social.start(at(''));
  await social.showLobby();
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
  expect(social.notice).toBe('A link is on its way to fan@example.com');   // your own address
  await social.requestReset('someone@example.com');
  expect(social.notice).toBe('If that email has an account, a link is on its way');   // anyone else's

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
});

// join, spied on and not run, but as far as it counts: you're watching.
const joinSpy = (rooms) => vi.spyOn(rooms, 'join').mockImplementation((id) => { rooms.role = 'watch'; rooms.id = id; });

// A guest watching a room (the room store's state set as a join leaves it), its join spied on.
function watching(password) {
  const rooms = useRoomStore();
  Object.assign(rooms, { role: 'watch', id: 'abcdefghij', _password: password });
  return { rooms, join: joinSpy(rooms) };
}

test('A guest watching a room who signs in joins it again with the same password; a member signing out while watching does not', async () => {
  const server = fakeServer();
  await social.start(at(''));
  await social.showLobby();
  const { join } = watching('hush');
  server.route('POST /api/auth/sign-in/email', () => ((server.session = member()), [200, { token: 't' }]));
  expect(await social.signIn('fan@example.com', 'right-password')).toBe(true);
  expect(join).toHaveBeenCalledOnce();
  expect(join).toHaveBeenCalledWith('abcdefghij', { password: 'hush' });

  join.mockClear();
  watching(undefined);
  await social.becameSomeoneElse({ signedOut: true });
  expect(join).not.toHaveBeenCalled();
});

test('Signing in with Discord from a room keeps its id (never a password) for the way back; not watching, nothing is kept', async () => {
  const server = fakeServer();
  server.route('POST /api/auth/sign-in/social', () => [200, { url: 'https://discord.example/authorize', redirect: true }]);
  await social.start(at(''));
  await social.showLobby();
  const location = { assign: vi.fn() };
  watching('hush');
  await social.signInWith('discord', location);
  expect(sessionStorage.getItem('phosphor-rejoin')).toBe('abcdefghij');
  expect(JSON.stringify({ ...sessionStorage })).not.toContain('hush');

  useRoomStore().close();
  await social.signInWith('github', location);
  expect(sessionStorage.getItem('phosphor-rejoin')).toBe(null);
});

test('An OAuth return: ?social=signed-in makes the kept room the one to join, ?social=error forgets it, ?social=two-factor keeps it', async () => {
  fakeServer();
  sessionStorage.setItem('phosphor-rejoin', 'abcdefghij');
  social.readReturn(at('?social=signed-in'));
  expect(social._roomLink).toBe('abcdefghij');
  expect(sessionStorage.getItem('phosphor-rejoin')).toBe(null);

  social._roomLink = null;
  sessionStorage.setItem('phosphor-rejoin', 'abcdefghij');
  social.readReturn(at('?social=two-factor'));
  expect(social._roomLink).toBe(null);
  expect(sessionStorage.getItem('phosphor-rejoin')).toBe('abcdefghij');

  social.readReturn(at('?social=error&error=EMAIL_NOT_VERIFIED'));
  expect(social._roomLink).toBe(null);
  expect(sessionStorage.getItem('phosphor-rejoin')).toBe(null);
});

test('A two-factor code that signs you in joins the room kept before Discord, once; one already rejoined is not joined twice', async () => {
  const server = twoFactorServer();
  await social.start(at(''));
  await social.showLobby();
  const rooms = useRoomStore();
  const join = joinSpy(rooms);
  sessionStorage.setItem('phosphor-rejoin', 'abcdefghij');
  expect(await social.verifyTwoFactor('000000')).toBe(true);
  expect(join).toHaveBeenCalledExactlyOnceWith('abcdefghij');
  expect(sessionStorage.getItem('phosphor-rejoin')).toBe(null);

  join.mockClear();
  rooms.close();
  watching('hush');
  sessionStorage.setItem('phosphor-rejoin', 'abcdefghij');
  await social.verifyTwoFactor('123456');
  expect(join).toHaveBeenCalledExactlyOnceWith('abcdefghij', { password: 'hush' });
  expect(sessionStorage.getItem('phosphor-rejoin')).toBe(null);
  expect(server.sent('POST', '/api/auth/two-factor/verify-totp')).toHaveLength(2);
});

test('A room id left from a trip that never finished is good for no later sign-in: a plain page load forgets it', async () => {
  fakeServer();
  sessionStorage.setItem('phosphor-rejoin', 'abcdefghij');
  await social.start(at(''));
  await social.showLobby();
  expect(sessionStorage.getItem('phosphor-rejoin')).toBe(null);
  expect(social._roomLink).toBe(null);
});

test('A room id left from an abandoned code page is forgotten by a password sign-in, so the code that follows joins nothing', async () => {
  twoFactorServer();
  await social.start(at(''));
  await social.showLobby();
  const join = joinSpy(useRoomStore());
  sessionStorage.setItem('phosphor-rejoin', 'abcdefghij');
  await social.signIn('fan@example.com', 'right-password');
  expect(sessionStorage.getItem('phosphor-rejoin')).toBe(null);
  expect(await social.verifyTwoFactor('123456')).toBe(true);
  expect(join).not.toHaveBeenCalled();
});

test('A two-factor return keeps the room id through the page load, for the code', async () => {
  twoFactorServer();
  sessionStorage.setItem('phosphor-rejoin', 'abcdefghij');
  await social.start(at('?social=two-factor'));
  await social.showLobby();
  expect(sessionStorage.getItem('phosphor-rejoin')).toBe('abcdefghij');
});

test('Back from Discord needing a username: no room is joined until onboarding is done, then the same room is', async () => {
  const server = fakeServer();
  server.session = member({ username: null, needsOnboarding: true, providers: ['discord'] });
  server.route('POST /api/me/onboarding', (body) => ((server.session = member({ username: body.username })), [200, server.session]));
  const join = joinSpy(useRoomStore());
  sessionStorage.setItem('phosphor-rejoin', 'abcdefghij');
  await social.start(at('?social=signed-in'));
  await social.showLobby();
  expect(social.page).toBe('onboarding');
  expect(join).not.toHaveBeenCalled();

  await social.finishOnboarding('ansi-fan');
  expect(join).toHaveBeenCalledExactlyOnceWith('abcdefghij');
});

test('The back link says "room" while watching and "lobby" otherwise', () => {
  expect(social.backTo).toBe('lobby');
  watching();
  expect(social.backTo).toBe('room');
});
