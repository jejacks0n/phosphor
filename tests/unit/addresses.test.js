// The table of addresses: which tab, SOCIAL page or the lobby each path is, and where a page may land.
import { test, expect } from 'vitest';
import { PLACES, pathOf, arrivalPage } from '../../src/lib/addresses.js';

test('every tab and page round-trips through its path; the lobby has none of its own', () => {
  for (const [path, { tab, page, lobby }] of PLACES) {
    if (lobby) expect(path).toBe('/social');
    else expect(pathOf(page ? { tab: 'input', page } : { tab })).toBe(path);
  }
  expect(pathOf({ tab: 'input', page: 'lobby' })).toBe('/pixel');
});
test('/vector is the VECTOR tab, between ANSI and SAUCE', () => {
  expect(pathOf({ tab: 'vector' })).toBe('/vector');
  const paths = PLACES.map(([path]) => path);
  expect(paths.indexOf('/vector')).toBe(paths.indexOf('/ansi') + 1);
  expect(paths.indexOf('/sauce')).toBe(paths.indexOf('/vector') + 1);
});
test('a page open is the address, over whichever tab', () => {
  expect(pathOf({ tab: 'sauce', page: 'account' })).toBe('/social/account');
  expect(pathOf({ tab: 'room', page: 'sign-in' })).toBe('/social/sign-in');
});
test('with nothing open the art tabs are the start screen, at /; ROOM and a page aren\'t', () => {
  for (const tab of ['input', 'output', 'vector', 'sauce']) expect(pathOf({ tab, empty: true })).toBe('/');
  expect(pathOf({ tab: 'room', empty: true })).toBe('/room');
  expect(pathOf({ tab: 'input', page: 'account', empty: true })).toBe('/social/account');
});
const known = { signedIn: false, needsOnboarding: false, resetToken: null, codePending: false, canStart: false };
test.each([
  ['account', {}, 'sign-in'], ['account', { signedIn: true }, 'account'],
  ['blocked', {}, 'sign-in'], ['blocked', { signedIn: true }, 'blocked'],
  ['two-factor', {}, 'lobby'], ['two-factor', { codePending: true }, 'two-factor'],
  ['reset', {}, 'lobby'], ['reset', { resetToken: 't' }, 'reset'],
  ['sign-in', { signedIn: true }, 'lobby'], ['create', { signedIn: true }, 'lobby'], ['sign-in', {}, 'sign-in'],
  ['forgot', { signedIn: true }, 'forgot'],   // Account's "Forgot your password?"
  ['onboarding', {}, 'lobby'], ['onboarding', { needsOnboarding: true }, 'onboarding'],
  ['start-room', {}, 'lobby'], ['start-room', { canStart: true }, 'start-room'],
])('%s with %o lands on %s', (page, fields, expected) => expect(arrivalPage(page, { ...known, ...fields })).toBe(expected));
