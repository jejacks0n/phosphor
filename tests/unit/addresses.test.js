// The table of addresses: which tab and SOCIAL page each path is, and where a page may land.
import { test, expect } from 'vitest';
import { PLACES, pathOf, arrivalPage } from '../../src/lib/addresses.js';

test('every place round-trips through its path', () => {
  for (const [path, { tab, page = 'lobby' }] of PLACES) expect(pathOf({ tab, page, role: null })).toBe(path);
});
test('the page is forgotten off the SOCIAL tab', () => expect(pathOf({ tab: 'input', page: 'account', role: null })).toBe('/pixel'));
test('in a room, SOCIAL is the room', () => {
  expect(pathOf({ tab: 'social', page: 'start-room', role: 'host' })).toBe('/social');
  expect(pathOf({ tab: 'social', page: 'account', role: 'watch' })).toBe('/social');
  expect(pathOf({ tab: 'social', page: 'sign-in', role: 'watch' })).toBe('/social/sign-in');
  expect(pathOf({ tab: 'sauce', page: 'lobby', role: 'host' })).toBe('/sauce');
});
const known = { signedIn: false, needsOnboarding: false, resetToken: null, codePending: false, canStart: false };
test.each([
  ['account', {}, 'sign-in'], ['account', { signedIn: true }, 'account'],
  ['two-factor', {}, 'lobby'], ['two-factor', { codePending: true }, 'two-factor'],
  ['reset', {}, 'lobby'], ['reset', { resetToken: 't' }, 'reset'],
  ['sign-in', { signedIn: true }, 'lobby'], ['create', { signedIn: true }, 'lobby'], ['sign-in', {}, 'sign-in'],
  ['forgot', { signedIn: true }, 'forgot'],   // Account's "Forgot your password?"
  ['onboarding', {}, 'lobby'], ['onboarding', { needsOnboarding: true }, 'onboarding'],
  ['start-room', {}, 'lobby'], ['start-room', { canStart: true }, 'start-room'],
])('%s with %o lands on %s', (page, fields, expected) => expect(arrivalPage(page, { ...known, ...fields })).toBe(expected));
