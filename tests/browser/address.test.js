// The address and the stores keeping each other in step (followAddress), with real stores and a
// router on a memory history.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createTestApp, loadImage } from '../support/app.js';
import { useSocialStore } from '@/store/SocialStore';
import { forgetKey } from '@/social/keys';
import { ownSocialDatabase } from '../support/socialDatabase.js';
import { fakeServer, member } from '../support/socialServer.js';
import { createAddressRouter, followAddress } from '@/router';

const GRADIENT = '/tests/fixtures/images/gradient.png';
let project, workspace, social, router, stop, push, replace;

// The router's work is promises, so a macrotask sees it through.
const settled = async () => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve));
};
const path = () => router.currentRoute.value.path;
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
  ownSocialDatabase('address');   // its own copy: the files run side by side
  forgetKey();
  desktop(true);
});

afterEach(() => {
  stop?.();
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
  await landed('/social/sign-in');
  await expect.poll(() => social.supported).toBe(true);
  await social.signIn('fan@example.com', 'right-password');
  await settled();
  expect(social.page).toBe('two-factor');
  expect(path()).toBe('/social/two-factor');

  router.back();   // to Sign in, and forward to the code still being asked for
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
