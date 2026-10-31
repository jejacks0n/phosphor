// The address and the stores keeping each other in step (followAddress), with real stores and a
// router on a memory history.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createTestApp, loadImage } from '../support/app.js';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore, hasLeftRoom } from '@/store/RoomStore';
import { forgetKey } from '@/social/keys';
import { ownSocialDatabase } from '../support/socialDatabase.js';
import { fakeServer, member, sockets, useFakeSockets } from '../support/socialServer.js';
import { createAddressRouter, followAddress } from '@/router';

const GRADIENT = '/tests/fixtures/images/gradient.png';
const ID = 'abcdefghij', OTHER = 'bcdefghijk';
let project, workspace, social, room, router, stop, push, replace;

// The router's work is promises, so a macrotask sees it through.
const settled = async () => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve));
};
const path = () => router.currentRoute.value.path;
const address = () => router.currentRoute.value.fullPath;
const roomSockets = () => sockets.filter((s) => s.url.includes('/api/rooms/'));
const desktop = (matches) => vi.stubGlobal('matchMedia', () => ({ matches }));

// A page load at an address, up to where autosave has yet to answer.
async function landing(address) {
  router = createAddressRouter(createMemoryHistory());
  stop = followAddress(router);
  await router.replace(address);
  await settled();
}

// And past it, counting the navigations from here on.
async function landed(address = '/') {
  await landing(address);
  workspace.documentSettled = true;
  await settled();
  push = vi.spyOn(router, 'push');
  replace = vi.spyOn(router, 'replace');
}

// The server, with you signed in as `session` (or no one): SOCIAL pages wait for who you are.
const serverFor = (session = null) => Object.assign(fakeServer(), { session });

beforeEach(async () => {
  ({ project, workspace } = await createTestApp());
  social = useSocialStore();
  room = useRoomStore();
  sessionStorage.removeItem('phosphor-left-rooms');
  ownSocialDatabase('address');   // its own copy: the files run side by side
  forgetKey();
  desktop(true);
});

afterEach(() => {
  stop?.();
  room.close({ spent: false });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('a tab change is one step, and Back undoes it', async () => {
  await loadImage(project, GRADIENT);
  await landed();
  workspace.editorTab = 'sauce';
  await settled();
  expect(path()).toBe('/sauce');
  expect(push).toHaveBeenCalledTimes(1);

  router.back();
  await settled();
  expect(workspace.editorTab).toBe('input');
  expect(path()).toBe('/pixel');
  expect(push).toHaveBeenCalledTimes(1);
  expect(replace).not.toHaveBeenCalled();

  router.forward();
  await settled();
  expect(workspace.editorTab).toBe('sauce');
});

test('two changes in one tick are one step', async () => {
  await landed();
  social.page = 'sign-in'; workspace.editorTab = 'social';   // ChatFoot's order
  await settled();
  expect(path()).toBe('/social/sign-in');
  expect(push).toHaveBeenCalledTimes(1);

  router.back();
  await settled();
  expect(workspace.editorTab).toBe('input');
});

test('an address that is already true navigates nowhere', async () => {
  await loadImage(project, GRADIENT);
  await landed('/ansi');
  expect(workspace.editorTab).toBe('output');
  workspace.editorTab = 'sauce';
  workspace.editorTab = 'output';   // and back, in one tick
  await settled();
  expect(push).not.toHaveBeenCalled();
  await router.push('/sauce');   // the address got there first
  await settled();
  expect(workspace.editorTab).toBe('sauce');
  expect(push).toHaveBeenCalledTimes(1);   // the one above
  expect(replace).not.toHaveBeenCalled();
});

test('a SOCIAL page is in the address both ways, and the page stays when you leave the tab', async () => {
  serverFor(member());
  await landed('/social/account');
  await expect.poll(() => social.signedIn).toBe(true);
  expect(workspace.editorTab).toBe('social');
  expect(social.page).toBe('account');

  social.page = 'lobby';
  await settled();
  expect(path()).toBe('/social');

  workspace.editorTab = 'input';
  social.page = 'forgot';
  await settled();
  expect(path()).toBe('/pixel');
  router.back();
  await settled();
  expect(social.page).toBe('lobby');
});

test('Back onto /ansi with no image goes to /pixel, replacing', async () => {
  await loadImage(project, GRADIENT);
  await landed();
  workspace.editorTab = 'output';
  await settled();
  workspace.editorTab = 'sauce';
  await settled();
  expect(push).toHaveBeenCalledTimes(2);
  project.image = null;

  router.back();
  await settled();
  expect(workspace.editorTab).toBe('input');
  expect(path()).toBe('/pixel');
  expect(push).toHaveBeenCalledTimes(2);
  expect(replace).toHaveBeenCalledTimes(1);
});

test('/ with the app open is no step: it is replaced, and Back goes past it', async () => {
  await loadImage(project, GRADIENT);
  await landed();
  workspace.editorTab = 'sauce';
  await settled();
  push.mockClear();

  await router.push('/');   // #/ or an unknown path, pasted in
  await settled();
  expect(path()).toBe('/sauce');
  expect(push).toHaveBeenCalledTimes(1);   // the one above
  expect(replace).toHaveBeenCalledTimes(1);

  router.back();   // the /sauce it was before, not a / that pushes again
  await settled();
  router.back();
  await settled();
  expect(path()).toBe('/pixel');
  expect(workspace.editorTab).toBe('input');
  expect(push).toHaveBeenCalledTimes(1);

  router.forward();   // nothing was cut off
  await settled();
  expect(path()).toBe('/sauce');
});

test('an unknown path lands on the default tab', async () => {
  await landed('/no/such/place');
  expect(path()).toBe('/pixel');
  expect(workspace.editorTab).toBe('input');
  expect(workspace.tabAddressed).toBe(false);
});

test('/social on a phone falls back to the art tab, replacing', async () => {
  desktop(false);
  await landed();
  await router.push('/social');
  push.mockClear();
  await settled();
  expect(workspace.editorTab).toBe('input');
  expect(path()).toBe('/pixel');
  expect(push).not.toHaveBeenCalled();
  expect(replace).toHaveBeenCalledTimes(1);
});

test('/ names no tab, and is replaced by the default one', async () => {
  await landing('/');
  expect(path()).toBe('/pixel');
  expect(workspace.tabAddressed).toBe(false);
});

test('a landing that names a tab waits for the document before it gives up on it', async () => {
  await landing('/sauce');
  expect(workspace.tabAddressed).toBe(true);
  expect(workspace.editorTab).toBe('sauce');   // no image yet: autosave hasn't answered

  workspace.documentSettled = true;
  replace = vi.spyOn(router, 'replace');
  push = vi.spyOn(router, 'push');
  await settled();
  expect(workspace.editorTab).toBe('input');
  expect(path()).toBe('/pixel');
  expect(replace).toHaveBeenCalledTimes(1);
  expect(push).not.toHaveBeenCalled();
});

test('a landing whose document comes back stays where it named, and changes while landing add no step', async () => {
  await landing('/sauce');
  await loadImage(project, GRADIENT);
  workspace.documentSettled = true;
  await settled();
  expect(workspace.editorTab).toBe('sauce');
  expect(path()).toBe('/sauce');

  await landing('/');
  push = vi.spyOn(router, 'push');
  workspace.editorTab = 'output';   // autosave's restore
  await settled();
  expect(path()).toBe('/ansi');
  expect(push).not.toHaveBeenCalled();
});

test('navigating keeps the query', async () => {
  await landed('/pixel?verified=1');
  workspace.editorTab = 'sauce';
  await settled();
  expect(router.currentRoute.value.fullPath).toBe('/sauce?verified=1');
});

test('stop ends the sync', async () => {
  await landed();
  stop();
  workspace.editorTab = 'sauce';
  await settled();
  expect(path()).toBe('/pixel');
});

// [address, the page signed out, the page signed in]
const ARRIVALS = [
  ['account', 'sign-in', 'account'],
  ['sign-in', 'sign-in', 'lobby'],
  ['create', 'create', 'lobby'],
  ['forgot', 'forgot', 'forgot'],
  ['two-factor', 'lobby', 'lobby'],
  ['reset', 'lobby', 'lobby'],
  ['start', 'lobby', 'start-room'],
  ['name', 'lobby', 'lobby'],
];

for (const [address, out, signedIn] of ARRIVALS) {
  for (const [who, session, shown] of [['signed out', null, out], ['signed in', member(), signedIn]]) {
    test(`/social/${address} ${who} lands on ${shown}, replacing`, async () => {
      serverFor(session);
      await landed();
      await router.push(`/social/${address}`);
      await expect.poll(() => path()).toBe(shown === 'lobby' ? '/social' : `/social/${shown === 'start-room' ? 'start' : shown}`);
      expect(social.page).toBe(shown);
      expect(workspace.editorTab).toBe('social');
      expect(push).toHaveBeenCalledTimes(1);   // the one above
      expect(replace).toHaveBeenCalledTimes(shown === address || (address === 'start' && shown === 'start-room') ? 0 : 1);
    });
  }
}

test('Start a room is out of reach with an email not yet confirmed', async () => {
  serverFor(member({ emailVerified: false }));
  await landed();
  await router.push('/social/start');
  await expect.poll(() => path()).toBe('/social');
  expect(social.page).toBe('lobby');
});

test('an account page reload while signed in stays on Account, not bounced before /api/me answers', async () => {
  const server = serverFor(member());
  let answer;
  const asked = new Promise((resolve) => { answer = resolve; });
  const me = server.routeOf('GET /api/me');
  server.route('GET /api/me', async () => (await asked, me()));
  await landed('/social/account');
  await settled();
  expect(social.page).toBe('account');
  expect(path()).toBe('/social/account');

  answer();
  await expect.poll(() => social.signedIn).toBe(true);
  await settled();
  expect(social.page).toBe('account');
  expect(path()).toBe('/social/account');
});

test('a stale session\'s Sign in page isn\'t bounced while signed in', async () => {
  serverFor(member());
  await landed('/social/account');
  await expect.poll(() => social.signedIn).toBe(true);

  social.staleSession('SESSION_NOT_FRESH');
  await settled();
  expect(social.page).toBe('sign-in');
  expect(path()).toBe('/social/sign-in');
  expect(social.signedIn).toBe(true);
});

test('a Two-factor page the store showed is not an arrival, and stays', async () => {
  const server = serverFor();
  server.route('POST /api/auth/sign-in/email', () => [200, { twoFactorRedirect: true, twoFactorMethods: ['totp'] }]);
  await landed('/social');
  await expect.poll(() => social.supported).toBe(true);
  social.page = 'sign-in';
  await settled();
  await social.signIn('fan@example.com', 'right-password');
  await settled();
  expect(social.page).toBe('two-factor');
  expect(path()).toBe('/social/two-factor');

  router.back();   // to the lobby (the code took Sign in's place), and forward to the code still being asked for
  await settled();
  router.forward();
  await settled();
  expect(social.page).toBe('two-factor');
  expect(path()).toBe('/social/two-factor');
});

test('a two-factor return from the server is read before the router lands, and stays', async () => {
  serverFor();
  social.readReturn(new URL(`${window.location.origin}/?social=two-factor`));
  await landed('/');
  await settled();
  expect(social.page).toBe('two-factor');
  expect(path()).toBe('/social/two-factor');
});

test('a visitor who never shows SOCIAL costs nothing', async () => {
  const server = serverFor();
  const boot = vi.spyOn(social, 'boot');
  await landed('/pixel');
  workspace.editorTab = 'sauce';
  await settled();
  expect(boot).not.toHaveBeenCalled();
  expect(server.requests).toEqual([]);
});

// In a room, as a lobby card's Join does. Memory history keeps each entry's state, so the marks work here; what
// a page load does with them (a reload, a host's) is in tests/e2e/addresses-rooms.spec.js.
async function inRoomFrom(address, id = ID) {
  useFakeSockets();
  serverFor(member());
  await landed(address);
  await social.boot();
  room.join(id);
  await settled();
}

test('joining pushes ?room=, and it rides along on every tab', async () => {
  await inRoomFrom('/social');
  expect(address()).toBe(`/social?room=${ID}`);
  expect(push).toHaveBeenCalledTimes(1);
  expect(replace).not.toHaveBeenCalled();

  workspace.editorTab = 'input';
  await settled();
  expect(address()).toBe(`/pixel?room=${ID}`);
  expect(push).toHaveBeenCalledTimes(2);
});

test('Back through tabs stays in the room', async () => {
  await inRoomFrom('/social');
  workspace.editorTab = 'input';
  await settled();

  router.back();
  await settled();
  expect(workspace.editorTab).toBe('social');
  expect(address()).toBe(`/social?room=${ID}`);
  expect(room.id).toBe(ID);
  expect(roomSockets()).toHaveLength(1);
  expect(push).toHaveBeenCalledTimes(2);
});

test('Back past the join leaves the room; Forward joins it again', async () => {
  await inRoomFrom('/social');
  const socket = roomSockets()[0];

  router.back();
  await settled();
  expect(socket.closed).toBe(true);
  expect(room.role).toBe(null);
  expect(address()).toBe('/social');
  expect(hasLeftRoom(ID)).toBe(false);
  expect(replace).not.toHaveBeenCalled();
  expect(push).toHaveBeenCalledTimes(1);

  router.forward();
  await expect.poll(() => roomSockets().length).toBe(2);
  expect(social.roomInvite).toBe(null);
  expect(room.id).toBe(ID);
  expect(address()).toBe(`/social?room=${ID}`);
});

test('Exit replaces, dropping ?room=, and the entries before it are spent', async () => {
  await inRoomFrom('/social');
  workspace.editorTab = 'input';
  await settled();
  room.leave();
  await settled();
  expect(address()).toBe('/pixel');
  expect(push).toHaveBeenCalledTimes(2);
  expect(replace).toHaveBeenCalledTimes(1);
  expect(hasLeftRoom(ID)).toBe(true);

  router.back();
  await settled();
  expect(address()).toBe('/social');
  expect(workspace.editorTab).toBe('social');
  expect(replace).toHaveBeenCalledTimes(2);
  expect([room.role, social.roomInvite, social._roomLink]).toEqual([null, null, null]);
  expect(roomSockets()).toHaveLength(1);
});

for (const reason of ['removed', 'ended']) {
  test(`being ${reason} replaces the same way`, async () => {
    await inRoomFrom('/social');
    workspace.editorTab = 'input';
    await settled();
    room.heard({ type: reason });
    await settled();
    expect(address()).toBe('/pixel');
    expect(push).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(hasLeftRoom(ID)).toBe(true);
  });
}

test('joining another room spends the first', async () => {
  await inRoomFrom('/social');
  room.join(OTHER);
  await settled();
  expect(address()).toBe(`/social?room=${OTHER}`);
  expect(push).toHaveBeenCalledTimes(2);
  expect(hasLeftRoom(ID)).toBe(true);

  router.back();   // onto the first room's entry: no room at all, and the one past it can be undone
  await settled();
  expect(address()).toBe('/social');
  expect(room.role).toBe(null);
  expect(social.roomInvite).toBe(null);
  expect(hasLeftRoom(OTHER)).toBe(false);
  expect(roomSockets()).toHaveLength(2);
});

// Back past the join and Forward onto its entry: the rejoin is waiting for the room's answer.
async function rejoinedOnForward() {
  await inRoomFrom('/social');
  router.back();
  await settled();
  router.forward();
  await expect.poll(() => room.status).toBe('joining');
  await settled();
  expect(push).toHaveBeenCalledTimes(1);
  expect(replace).not.toHaveBeenCalled();
}

test('a password form on SOCIAL already moves nothing: the next tab change is still a step', async () => {
  await rejoinedOnForward();
  room.heard({ type: 'refused', reason: 'wrong-password' });
  await settled();
  expect(room.status).toBe('password');
  expect(address()).toBe(`/social?room=${ID}`);

  workspace.editorTab = 'input';
  await settled();
  expect(address()).toBe(`/pixel?room=${ID}`);
  expect(push).toHaveBeenCalledTimes(2);
  expect(replace).not.toHaveBeenCalled();
});

test('a refusal on SOCIAL already loses ?room= by replacing, and the next tab change is still a step', async () => {
  await rejoinedOnForward();
  room.heard({ type: 'refused', reason: 'unavailable' });
  await settled();
  expect(address()).toBe('/social');
  expect(replace).toHaveBeenCalledTimes(1);

  workspace.editorTab = 'input';
  await settled();
  expect(address()).toBe('/pixel');
  expect(push).toHaveBeenCalledTimes(2);
  expect(replace).toHaveBeenCalledTimes(1);
});

test('a password form for an entry on another tab moves to SOCIAL by replacing it', async () => {
  await inRoomFrom('/social');
  workspace.editorTab = 'input';
  await settled();
  router.go(-2);
  await settled();
  expect(room.role).toBe(null);
  router.go(2);
  await expect.poll(() => room.status).toBe('joining');
  room.heard({ type: 'refused', reason: 'wrong-password' });
  await settled();
  expect(workspace.editorTab).toBe('social');
  expect(address()).toBe(`/social?room=${ID}`);
  expect(push).toHaveBeenCalledTimes(2);
  expect(replace).toHaveBeenCalledTimes(1);
});

test('joining a spent room again un-spends it', async () => {
  await inRoomFrom('/social');
  room.leave();
  await settled();
  expect(hasLeftRoom(ID)).toBe(true);
  room.join(ID);
  await settled();
  expect(hasLeftRoom(ID)).toBe(false);
  expect(address()).toBe(`/social?room=${ID}`);
});

test('signing in while watching goes back into the room, which is not spent', async () => {
  await inRoomFrom('/social');
  await social.signIn('fan@example.com', 'right-password');
  await settled();
  expect(room.id).toBe(ID);
  expect(hasLeftRoom(ID)).toBe(false);
  expect(address()).toBe(`/social?room=${ID}`);
});

test('a Join before autosave has answered is still a step, so Back stays in Phosphor', async () => {
  useFakeSockets();
  serverFor(member());
  await landing('/social');
  await social.boot();
  push = vi.spyOn(router, 'push');

  room.join(ID);
  await settled();
  expect(address()).toBe(`/social?room=${ID}`);
  expect(push).toHaveBeenCalledTimes(1);

  router.back();
  await settled();
  expect(address()).toBe('/social');
  expect(room.role).toBe(null);
});

// [the page, how you stop being able to come back to it, the page you're on then]
const NO_RETURN = [
  ['sign-in', () => social.signIn('fan@example.com', 'right-password'), 'lobby'],
  ['create', () => social.signUp({ username: 'pixel_wren', email: 'wren@example.com', password: 'a long new password', termsAccepted: true }), 'lobby'],
  ['reset', () => Object.assign(social, { resetToken: null, page: 'sign-in' }), 'sign-in'],
  ['onboarding', () => social.finishOnboarding('wren'), 'lobby'],
];

for (const [page, leave, next] of NO_RETURN) {
  test(`leaving ${page} for good replaces it`, async () => {
    useFakeSockets();
    const server = serverFor(page === 'onboarding' ? member({ needsOnboarding: true }) : null);
    server.route('POST /api/auth/sign-up/email', () => ((server.session = member()), [200, { token: 't' }]));
    server.route('POST /api/me/onboarding', () => ((server.session = member()), [200, server.session]));
    await landed('/pixel');
    await social.boot();
    if (page === 'reset') social.resetToken = 'tok';
    social.page = page;
    workspace.editorTab = 'social';
    await settled();
    expect(social.page).toBe(page);
    push.mockClear();
    replace.mockClear();

    await leave();
    await settled();
    expect(social.page).toBe(next);
    expect(push).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
  });
}

test('the Sign in a stale session sends you to still shows, and is a step; leaving it replaces', async () => {
  serverFor(member());
  await landed('/social/account');
  await expect.poll(() => social.signedIn).toBe(true);
  await settled();

  social.staleSession('SESSION_NOT_FRESH');
  await settled();
  expect(path()).toBe('/social/sign-in');
  expect(push).toHaveBeenCalledTimes(1);
  expect(replace).not.toHaveBeenCalled();

  workspace.editorTab = 'input';
  await settled();
  expect(path()).toBe('/pixel');
  expect(push).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledTimes(1);
});

// A /api/me that answers when told to.
function slowServer() {
  useFakeSockets();
  const server = serverFor(member()), me = server.routeOf('GET /api/me');
  let answer;
  const asked = new Promise((resolve) => { answer = resolve; });
  server.route('GET /api/me', async () => (await asked, me()));
  return answer;
}

test('a rejoin waiting to know who you are keeps its ?room=, and joins', async () => {
  const answer = slowServer();
  await landed('/pixel');
  const rejoining = social.rejoin(ID);
  await settled();
  expect(address()).toBe(`/pixel?room=${ID}`);
  expect(social.roomGoingTo).toBe(ID);

  answer();
  await rejoining;
  await settled();
  expect(room.id).toBe(ID);
  expect(address()).toBe(`/pixel?room=${ID}`);
  expect(social.roomGoingTo).toBe(null);
  expect(roomSockets()).toHaveLength(1);
});

test('going elsewhere before a rejoin gets there means no join', async () => {
  const answer = slowServer();
  await landed('/pixel');
  const rejoining = social.rejoin(ID);
  await settled();
  expect(address()).toBe(`/pixel?room=${ID}`);

  router.back();
  await settled();
  expect(address()).toBe('/pixel');
  answer();
  await rejoining;
  await settled();
  expect(room.role).toBe(null);
  expect(address()).toBe('/pixel');
  expect(roomSockets()).toEqual([]);
});

test('an unmarked ?room= asks on SOCIAL, and the address it came in on goes', async () => {
  useFakeSockets();
  serverFor(member());
  await landed();
  await router.push(`/pixel?room=${ID}`);
  await expect.poll(() => social.roomInvite).toBe(ID);
  await settled();
  expect(workspace.editorTab).toBe('social');
  expect(address()).toBe('/social');
  expect(push).toHaveBeenCalledTimes(1);   // the one above: this is no step of its own
  expect(roomSockets()).toEqual([]);

  social.answerRoomInvite(false);
  router.back();
  await settled();
  expect(address()).toBe('/pixel');
  expect(social.roomInvite).toBe(null);
});

test('on a phone a ?room= is left alone: no join, no asking, still in the address', async () => {
  desktop(false);
  await loadImage(project, GRADIENT);   // before fetch is the fake's
  useFakeSockets();
  serverFor(member());
  await landed(`/pixel?room=${ID}`);
  expect(address()).toBe(`/pixel?room=${ID}`);
  workspace.editorTab = 'output';
  await settled();
  expect(address()).toBe(`/ansi?room=${ID}`);
  expect([room.role, social.roomInvite, social._roomLink]).toEqual([null, null, null]);
  expect(roomSockets()).toEqual([]);
});

test('other query params stay as the room comes and goes', async () => {
  useFakeSockets();
  serverFor(member());
  await landed('/social?keep=1');
  await social.boot();
  room.join(ID);
  await settled();
  expect(router.currentRoute.value.query).toEqual({ keep: '1', room: ID });
  room.leave();
  await settled();
  expect(router.currentRoute.value.query).toEqual({ keep: '1' });
});

test('close with no room notes nothing, and unreadable storage counts every room as left', async () => {
  room.close();
  expect(sessionStorage.getItem('phosphor-left-rooms')).toBe(null);
  expect(hasLeftRoom(ID)).toBe(false);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('no storage'); });
  expect(hasLeftRoom(ID)).toBe(true);
});

// Live in a room you started on Setup room, the step before it.
async function hostingFrom(address = '/social/start') {
  useFakeSockets();
  serverFor(member()).route('POST /api/rooms', () => [200, { id: ID, link: `http://localhost/?room=${ID}` }]);
  await landed(address);
  await social.boot();
  await room.startRoom({ name: 'Night shift', welcome: '', isPublic: true, allowGuests: true, max: 12 });
  await settled();
}

test('Back past going live asks, and Cancel keeps the room and the address', async () => {
  await hostingFrom();
  expect(address()).toBe(`/social?room=${ID}`);
  expect(push).toHaveBeenCalledTimes(1);

  router.back();
  await settled();
  expect(room.askingEnd).toBe(true);
  expect(address()).toBe(`/social?room=${ID}`);

  room.answerEnd(false);
  await settled();
  expect(room.askingEnd).toBe(false);
  expect(room.role).toBe('host');
  expect(address()).toBe(`/social?room=${ID}`);
  expect(router.options.history.location).toBe(`/social?room=${ID}`);
  expect(push).toHaveBeenCalledTimes(1);

  router.back();
  await settled();
  expect(room.askingEnd).toBe(true);
});

test('End ends the room and lands on Setup room', async () => {
  await hostingFrom();
  const socket = roomSockets()[0];
  router.back();
  await settled();

  room.answerEnd(true);
  await settled();
  expect(room.askingEnd).toBe(false);
  expect(room.role).toBe(null);
  expect(socket.closed).toBe(true);
  expect(hasLeftRoom(ID)).toBe(true);
  expect(address()).toBe('/social/start');
  expect(social.page).toBe('start-room');
  expect(workspace.editorTab).toBe('social');
  expect(push).toHaveBeenCalledTimes(1);
  expect(replace).not.toHaveBeenCalled();
});

test('Back between tabs while hosting doesn\'t ask', async () => {
  await hostingFrom();
  workspace.editorTab = 'input';
  await settled();
  expect(address()).toBe(`/pixel?room=${ID}`);

  router.back();
  await settled();
  expect(room.askingEnd).toBe(false);
  expect(room.role).toBe('host');
  expect(address()).toBe(`/social?room=${ID}`);
  expect(workspace.editorTab).toBe('social');
});

test('the room ending while it asks: the question goes and Back finishes', async () => {
  await hostingFrom();
  router.back();
  await settled();

  room.heard({ type: 'ended' });
  await settled();
  expect(room.askingEnd).toBe(false);
  expect(room.role).toBe(null);
  expect(address()).toBe('/social/start');
  expect(social.page).toBe('start-room');
  expect(replace).not.toHaveBeenCalled();
});

test('a store changing while it asks moves the address only after the answer', async () => {
  await hostingFrom();
  router.back();
  await settled();

  workspace.editorTab = 'input';
  await settled();
  expect(room.askingEnd).toBe(true);
  expect(address()).toBe(`/social?room=${ID}`);
  expect(push).toHaveBeenCalledTimes(1);

  room.answerEnd(false);
  await settled();
  expect(address()).toBe(`/pixel?room=${ID}`);
  expect(room.role).toBe('host');
});
