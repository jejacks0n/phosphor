// The social store in the desktop build: no server and no question; the browser's own key signs the pass,
// with the name kept on this computer.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSocialStore } from '@/store/SocialStore';
import { forgetKey } from '@/social/keys';
import { WINDOW_KEY } from '@/social/windowKey';
import { verifyPass } from '@/social/pass';
import { makeSelfPass, verifySelfPass } from '@/social/selfPass';
import { ownSocialDatabase } from '../support/socialDatabase.js';

let social, deleteDatabase, fetched;
beforeEach(async () => {
  deleteDatabase = ownSocialDatabase('desktop-store');
  sessionStorage.removeItem(WINDOW_KEY);   // each test's window starts with no key of its own
  forgetKey();
  await deleteDatabase();
  localStorage.clear();   // no consent kept
  fetched = vi.fn(() => Promise.reject(new Error('no server on desktop')));
  vi.stubGlobal('fetch', fetched);
  setActivePinia(createPinia());
  social = useSocialStore();
});
afterEach(() => {
  social.dropPass();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('allowed without consent', () => {
  expect(social.consentVersion).toBe(0);
  expect(social.allowed).toBe(true);
});

test('desktop boot makes no request', async () => {
  await social.start();
  await social.boot();
  expect([social.supported, social.signedIn, social.me]).toEqual([true, false, null]);
  await social.getPass();
  await social.showLobby();
  expect(social._connection).toBe(null);
  expect(fetched).not.toHaveBeenCalled();
});

test('getPass gives a self pass with the desktop name', async () => {
  social.setDesktopName('  ansi-fan  ');
  await social.boot();
  const { pass, privateKey } = await social.getPass();
  expect(privateKey).toBe(social._key.privateKey);
  const claims = await verifySelfPass(pass);
  expect(claims).toMatchObject({ name: 'ansi-fan', key: social._key.publicKey, guest: false });
  expect(social.claims).toEqual(claims);
  expect(social._renewTimer).not.toBe(null);
});

test('setDesktopName changes the next pass\'s name, kept on this computer and cut to a username\'s length', async () => {
  expect(social.desktopName).toBe('');
  await social.boot();
  const first = (await social.getPass()).pass;
  social.setDesktopName('x'.repeat(40));
  expect(social.pass).toBe(null);
  const second = (await social.getPass()).pass;
  expect(second).not.toBe(first);
  expect((await verifySelfPass(second)).name).toBe('x'.repeat(24));
  expect(localStorage.getItem('phosphor-desktop-name')).toBe('x'.repeat(24));
  setActivePinia(createPinia());
  expect(useSocialStore().desktopName).toBe('x'.repeat(24));
  social.setDesktopName('a'.repeat(23) + ' b');   // cut at the space: none left at the end
  expect(social.desktopName).toBe('a'.repeat(23));
});

test('verifyPass takes a self pass and refuses a tampered one', async () => {
  await social.boot();
  const { pass, claims } = await makeSelfPass(social._key, 'ansi-fan');
  expect(await verifyPass(pass, 'unused')).toEqual(claims);
  const [body, signature] = pass.split('.');
  const other = (await makeSelfPass(social._key, 'someone-else')).pass.split('.');
  expect(await verifyPass(`${other[0]}.${signature}`, 'unused')).toBe(null);   // another name under this signature
  expect(await verifyPass(`${body}.${other[1]}`, 'unused')).toBe(null);
});
