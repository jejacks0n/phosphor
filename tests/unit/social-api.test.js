// The SOCIAL tab's small modules: where the server is, base64url, the fetch wrapper and the plain
// words for the server's error codes. No network: fetch is stubbed.
import { test, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { apiOrigin, wsOrigin, appOrigin, desktopQuery } from '../../src/social/config.js';
import { toBase64url, fromBase64url } from '../../src/social/base64url.js';
import { api } from '../../src/social/api.js';
import { messageFor } from '../../src/social/messages.js';

const realFetch = globalThis.fetch;
globalThis.location = { hostname: 'localhost', origin: 'http://localhost:5173' };   // Node has no page
afterEach(() => { globalThis.fetch = realFetch; });

test('The API origin is VITE_SOCIAL_API, else the local server on localhost, else the production API; the socket origin follows the scheme', () => {
  assert.equal(apiOrigin({ VITE_SOCIAL_API: 'http://10.0.0.5:9000' }, { hostname: 'localhost' }), 'http://10.0.0.5:9000');
  assert.equal(apiOrigin({}, { hostname: 'localhost' }), 'http://localhost:8787');
  assert.equal(apiOrigin({}, { hostname: 'phosphor.work' }), 'https://api.phosphor.work');
  assert.equal(wsOrigin('https://api.phosphor.work'), 'wss://api.phosphor.work');
  assert.equal(wsOrigin('http://localhost:8787'), 'ws://localhost:8787');
  assert.equal(appOrigin({ origin: 'http://localhost:5173' }), 'http://localhost:5173');
  assert.equal(desktopQuery, '(min-width: 769px)');
});

test('base64url round trips without padding and refuses anything else', () => {
  for (const n of [0, 1, 2, 3, 4, 32, 64]) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 250) % 256);
    const text = toBase64url(bytes);
    assert.doesNotMatch(text, /[+/=]/);
    assert.deepEqual(fromBase64url(text), bytes);
  }
  assert.equal(toBase64url(Uint8Array.of(251, 255, 254)), '-__-');   // the url alphabet, not + and /
  for (const bad of ['ab+c', 'ab/c', 'abc=', 'a', 'abcde', 'ab c']) assert.throws(() => fromBase64url(bad), bad);
});

test('api sends JSON with cookies and returns { ok, status, data, code }; a failed fetch is NETWORK, never a throw', async () => {
  let seen;
  globalThis.fetch = async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ code: 'TAKEN' }), { status: 409 });
  };
  const res = await api('/me/username', { method: 'POST', body: { username: 'ada' } });
  assert.equal(seen.url, 'http://localhost:8787/me/username');
  assert.equal(seen.init.credentials, 'include');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['content-type'], 'application/json');
  assert.equal(seen.init.body, '{"username":"ada"}');
  assert.deepEqual(res, { ok: false, status: 409, data: { code: 'TAKEN' }, code: 'TAKEN' });

  globalThis.fetch = async () => new Response('{"rooms":[]}', { status: 200 });
  assert.deepEqual(await api('/rooms'), { ok: true, status: 200, data: { rooms: [] }, code: null });

  globalThis.fetch = async () => new Response('not json', { status: 502 });   // a proxy's error page
  assert.deepEqual(await api('/rooms'), { ok: false, status: 502, data: null, code: null });

  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  assert.deepEqual(await api('/rooms'), { ok: false, status: 0, data: null, code: 'NETWORK' });
});

test('messageFor has plain words for every code the server sends, and a fallback', () => {
  const codes = ['TERMS_REQUIRED', 'USERNAME', 'TAKEN', 'TOO_SOON', 'ONBOARDING_REQUIRED', 'NEEDS_ONBOARDING', 'SUSPENDED',
    'THROTTLED', 'TURNSTILE_FAILED', 'PASSWORD_BREACHED', 'EMAIL_NOT_VERIFIED', 'USE_RENAME', 'SESSION_EXPIRED', 'VERIFY_EMAIL',
    'NETWORK', 'INVALID_EMAIL_OR_PASSWORD', 'INVALID_USERNAME_OR_PASSWORD', 'USER_ALREADY_EXISTS',
    'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', 'USERNAME_IS_ALREADY_TAKEN', 'PASSWORD_TOO_SHORT'];
  const fallback = messageFor('NO_SUCH_CODE');
  assert.equal(fallback, 'Something went wrong. Try again.');
  for (const code of codes) assert.notEqual(messageFor(code), fallback, code);
  assert.equal(messageFor('NETWORK'), "Couldn't reach Phosphor's server. Check your connection.");
  assert.equal(messageFor('USERNAME', { problem: 'length' }), 'Usernames are 3 to 24 characters');
  assert.equal(messageFor('USERNAME', { problem: 'characters' }), 'Use only lowercase letters, numbers, underscores and hyphens');
  assert.equal(messageFor('USERNAME', { problem: 'reserved' }),
    "That name is reserved: names can't be three words joined by hyphens, or admin, phosphor, guest, host or system");
  assert.equal(messageFor('USERNAME_IS_ALREADY_TAKEN'), messageFor('TAKEN'));
  assert.equal(messageFor('INVALID_USERNAME_OR_PASSWORD'), "That email or username and password don't match");
  assert.equal(messageFor('USER_ALREADY_EXISTS'), 'An account already uses that email');
  assert.equal(messageFor('PASSWORD_TOO_SHORT'), 'Passwords need at least 10 characters');
  const until = new Date(2026, 10, 3).getTime();
  const day = new Date(until).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  assert.equal(messageFor('TOO_SOON', { until }), `You can change your username again on ${day}`);
  assert.equal(messageFor('SUSPENDED'), 'This account is suspended for good');
  assert.equal(messageFor('SUSPENDED', { until }), `This account is suspended until ${day}`);
});
