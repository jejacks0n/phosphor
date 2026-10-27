// The browser's own Ed25519 key (kept in IndexedDB), the proofs it signs, and asking the server for a
// pass. Real WebCrypto and IndexedDB; fetch is stubbed.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ed25519Supported, loadKey, forgetKey, sign, proof } from '@/social/keys';
import { decodePass, requestPass, renewAt, passKey, verifyPass } from '@/social/pass';
import { toBase64url, fromBase64url } from '@/social/base64url';

const deleteDatabase = () => new Promise((resolve, reject) => {
  const req = indexedDB.deleteDatabase('phosphor-social');
  req.onsuccess = resolve;
  req.onerror = () => reject(req.error);
  req.onblocked = () => reject(new Error('phosphor-social is still open'));
});

beforeEach(async () => {
  forgetKey();
  await deleteDatabase();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const verify = async (publicKey, message, signature) => {
  const key = await crypto.subtle.importKey('raw', fromBase64url(publicKey), { name: 'Ed25519' }, false, ['verify']);
  return crypto.subtle.verify('Ed25519', key, fromBase64url(signature), new TextEncoder().encode(message));
};

const claims = { sub: 'g_abc', name: 'quiet-amber-fox', guest: true, verified: false, key: 'k', exp: 1_800_000_000 };
const fakePass = toBase64url(new TextEncoder().encode(JSON.stringify(claims))) + '.c2ln';

// fetch answers with `reply` and remembers what it was sent.
function stubFetch(status, reply) {
  const sent = [];
  vi.stubGlobal('fetch', async (url, init) => {
    sent.push({ url, init, body: init.body && JSON.parse(init.body) });
    return new Response(JSON.stringify(reply), { status });
  });
  return sent;
}

test('Ed25519 is supported here; a browser whose generateKey refuses it is not', async () => {
  expect(await ed25519Supported()).toBe(true);
  vi.spyOn(crypto.subtle, 'generateKey').mockRejectedValue(new DOMException('Unrecognized name', 'NotSupportedError'));
  expect(await ed25519Supported()).toBe(false);
});

test('The key is made once, its private half not extractable, and comes back the same from IndexedDB', async () => {
  const generateKey = vi.spyOn(crypto.subtle, 'generateKey');
  const first = await loadKey();
  expect(first.privateKey.extractable).toBe(false);
  expect(fromBase64url(first.publicKey)).toHaveLength(32);

  forgetKey();   // as a new page would: read it from IndexedDB, not memory
  const again = await loadKey();
  expect(again.publicKey).toBe(first.publicKey);
  expect(generateKey).toHaveBeenCalledTimes(1);
});

test('Concurrent first calls share one key', async () => {
  const generateKey = vi.spyOn(crypto.subtle, 'generateKey');
  const [a, b] = await Promise.all([loadKey(), loadKey()]);
  expect(a.publicKey).toBe(b.publicKey);
  expect(generateKey).toHaveBeenCalledTimes(1);
});

test('A key that can\'t be stored makes loadKey fail, not resolve empty; the next loadKey tries again', async () => {
  vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementationOnce(() => {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  });
  await expect(loadKey()).rejects.toThrow('quota');
  const key = await loadKey();
  expect(fromBase64url(key.publicKey)).toHaveLength(32);
  forgetKey();
  expect((await loadKey()).publicKey).toBe(key.publicKey);   // the retry's key was stored
});

test('When another tab stored its key first, loadKey uses that one', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
  const theirs = { privateKey: pair.privateKey, publicKey: 'theirs' };
  const add = IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (value, key) {
    this.put(theirs, key);   // lands between this tab's read and its add
    return add.call(this, value, key);
  });
  expect((await loadKey()).publicKey).toBe('theirs');
});

test('A signature verifies with the public key; a proof signs its message with its timestamp', async () => {
  const { privateKey, publicKey } = await loadKey();
  const signature = await sign(privateKey, 'hello ✓');
  expect(signature).not.toMatch(/[+/=]/);
  expect(await verify(publicKey, 'hello ✓', signature)).toBe(true);
  expect(await verify(publicKey, 'hello', signature)).toBe(false);

  const signed = await proof(privateKey, (ts) => `lobby:${ts}`, 1_700_000_000_000);
  expect(signed.ts).toBe(1_700_000_000_000);
  expect(await verify(publicKey, 'lobby:1700000000000', signed.proof)).toBe(true);
});

test('requestPass sends the key signed out, and the previous pass with a fresh proof for a guest renewal', async () => {
  const key = await loadKey();
  let sent = stubFetch(200, { pass: fakePass, claims });
  expect(await requestPass(key)).toEqual({ pass: fakePass, claims });
  expect(sent[0].url).toMatch(/\/api\/pass$/);
  expect(sent[0].init.method).toBe('POST');
  expect(sent[0].init.credentials).toBe('include');
  expect(sent[0].body).toEqual({ key: key.publicKey });

  sent = stubFetch(200, { pass: fakePass, claims });
  await requestPass(key, fakePass);
  const { body } = sent[0];
  expect(Object.keys(body).sort()).toEqual(['key', 'previous', 'proof', 'ts']);
  expect(body.previous).toBe(fakePass);
  expect(Math.abs(Date.now() - body.ts)).toBeLessThan(5000);
  expect(await verify(key.publicKey, `pass-renew:${body.ts}`, body.proof)).toBe(true);
});

test('requestPass returns the server\'s error code, with until for a suspension, and NETWORK when unreachable', async () => {
  const key = await loadKey();
  stubFetch(409, { code: 'NEEDS_ONBOARDING' });
  expect(await requestPass(key)).toEqual({ error: 'NEEDS_ONBOARDING' });
  stubFetch(403, { code: 'SUSPENDED', until: 1_800_000_000_000 });
  expect(await requestPass(key)).toEqual({ error: 'SUSPENDED', until: 1_800_000_000_000 });
  stubFetch(429, { code: 'THROTTLED' });
  expect(await requestPass(key)).toEqual({ error: 'THROTTLED' });
  vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
  expect(await requestPass(key)).toEqual({ error: 'NETWORK' });
});

test('decodePass reads the claims; renewAt is 5 minutes before expiry, never in the past', () => {
  expect(decodePass(fakePass)).toEqual(claims);
  expect(() => decodePass('!')).toThrow();
  const now = 1_700_000_000_000;
  expect(renewAt({ exp: now / 1000 + 3600 }, now)).toBe(now + 55 * 60_000);
  expect(renewAt({ exp: now / 1000 + 60 }, now)).toBe(now);
});

// A pass signed the way the server signs one: Ed25519 over the ASCII of the first part.
async function signedPass(privateKey, claimsToSign) {
  const body = toBase64url(new TextEncoder().encode(JSON.stringify(claimsToSign)));
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(body)));
  return `${body}.${toBase64url(signature)}`;
}

test('verifyPass gives the claims for a good pass, and null for a tampered body, another key, an expired pass and junk', async () => {
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const keyB64 = toBase64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  const other = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const otherB64 = toBase64url(new Uint8Array(await crypto.subtle.exportKey('raw', other.publicKey)));
  const now = 1_700_000_000_000;
  const good = await signedPass(pair.privateKey, { ...claims, exp: now / 1000 + 60 });

  expect(await verifyPass(good, keyB64, now)).toEqual({ ...claims, exp: now / 1000 + 60 });
  const [, signature] = good.split('.');
  const forged = toBase64url(new TextEncoder().encode(JSON.stringify({ ...claims, sub: 'u_other', exp: now / 1000 + 60 })));
  expect(await verifyPass(`${forged}.${signature}`, keyB64, now)).toBeNull();
  expect(await verifyPass(good, otherB64, now)).toBeNull();
  expect(await verifyPass(await signedPass(pair.privateKey, { ...claims, exp: now / 1000 }), keyB64, now)).toBeNull();
  for (const junk of ['x', '', 'a.b.c', '!.!', `${good}.`]) expect(await verifyPass(junk, keyB64, now)).toBeNull();
  expect(await verifyPass(good, 'not a key', now)).toBeNull();
});

test('passKey asks the server once and gives the same key after', async () => {
  const sent = stubFetch(200, { key: 'a2V5' });
  expect(await passKey()).toBe('a2V5');
  expect(await passKey()).toBe('a2V5');
  expect(sent).toHaveLength(1);
  expect(sent[0].url).toMatch(/\/api\/pass-key$/);
});
