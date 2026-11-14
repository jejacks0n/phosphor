// A desktop pass is signed by its own key, not a server's: sub is the key's fingerprint.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fingerprint, makeSelfPass, verifySelfPass } from '../../src/social/selfPass.js';
import { verifySelfPass as verifyInNode, verifyProof } from '../../desktop/selfPass.js';
import { toBase64url } from '../../src/social/base64url.js';
import { sign, proof, verifySignature } from '../../src/social/keys.js';
import { isSub } from '../../src/social/wire.js';

async function newKey() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { privateKey: pair.privateKey, publicKey: toBase64url(raw) };
}
const NOW = 1_700_000_000_000;
const encode = (claims) => toBase64url(new TextEncoder().encode(JSON.stringify(claims)));

test('a self pass verifies, and its sub is the key\'s fingerprint', async () => {
  const key = await newKey();
  const { pass, claims } = await makeSelfPass(key, 'Ana', NOW);
  assert.equal(claims.sub, await fingerprint(key.publicKey));
  assert.equal(claims.sub.length, 22);
  assert.ok(isSub(claims.sub));
  assert.deepEqual(await verifySelfPass(pass, NOW), claims);
  assert.equal(claims.exp, Math.floor(NOW / 1000) + 3600);
  assert.equal(claims.name, 'Ana');
});

test('a pass signed by another key is refused', async () => {
  const [a, b] = [await newKey(), await newKey()];
  const { claims } = await makeSelfPass(a, 'Ana', NOW);
  const body = encode(claims);
  assert.equal(await verifySelfPass(`${body}.${await sign(b.privateKey, body)}`, NOW), null);
});

test('a pass whose sub isn\'t its key\'s fingerprint is refused', async () => {
  const key = await newKey();
  const { claims } = await makeSelfPass(key, 'Ana', NOW);
  const body = encode({ ...claims, sub: 'someone-else' });
  const pass = `${body}.${await sign(key.privateKey, body)}`;
  assert.equal(await verifySelfPass(pass, NOW), null);
  assert.equal(await verifyInNode(pass, NOW), null);
});

test('an expired pass is refused', async () => {
  const key = await newKey();
  const { pass, claims } = await makeSelfPass(key, 'Ana', NOW);
  assert.ok(await verifySelfPass(pass, claims.exp * 1000 - 1));
  assert.equal(await verifySelfPass(pass, claims.exp * 1000 + 1000), null);
  assert.equal(await verifyInNode(pass, claims.exp * 1000 + 1000), null);
});

test('malformed passes are refused', async () => {
  for (const bad of ['', 'x', 'a.b.c', '!!.!!']) {
    assert.equal(await verifySelfPass(bad, NOW), null);
    assert.equal(await verifyInNode(bad, NOW), null);
  }
});

test('the Node and renderer checks agree', async () => {
  const key = await newKey();
  const { pass, claims } = await makeSelfPass(key, 'Ana', NOW);
  assert.deepEqual(await verifyInNode(pass, NOW), claims);
  assert.deepEqual(await verifyInNode(pass, NOW), await verifySelfPass(pass, NOW));
});

test('verifyProof checks a proof the way verifySignature does', async () => {
  const key = await newKey();
  const { proof: p, ts } = await proof(key.privateKey, (t) => `lobby:${t}`, NOW);
  const message = `lobby:${ts}`;
  assert.equal(await verifyProof(key.publicKey, message, p), true);
  assert.equal(await verifyProof(key.publicKey, 'other', p), false);
  assert.equal(await verifyProof('bad', message, p), false);
  assert.equal(await verifySignature(key.publicKey, message, p), true);
});

// A pass's own key signs whatever claims it likes, so the claims are checked in shape too: what the host's page
// shows (the name) and how long it's good (exp).
test('a name that isn\'t a short string, or an exp past an hour from now, is refused by both checks', async () => {
  const key = await newKey();
  const { claims } = await makeSelfPass(key, 'Ana', NOW);
  const signed = async (changes) => {
    const body = encode({ ...claims, ...changes });
    return `${body}.${await sign(key.privateKey, body)}`;
  };
  const hour = Math.floor(NOW / 1000) + 3600;
  for (const bad of [{ name: ['x'] }, { name: null }, { name: 7 }, { name: '' }, { name: '   ' }, { name: 'x'.repeat(25) }, { name: 'x'.repeat(15_000) },
    { exp: hour + 3600 }, { exp: 1e15 }]) {
    const pass = await signed(bad);
    assert.equal(await verifySelfPass(pass, NOW), null, JSON.stringify(bad).slice(0, 40));
    assert.equal(await verifyInNode(pass, NOW), null, JSON.stringify(bad).slice(0, 40));
  }
  for (const good of [{ name: 'x'.repeat(24) }, { exp: hour + 300 }]) {   // the longest name, and a clock a few minutes ahead
    const pass = await signed(good);
    assert.ok(await verifySelfPass(pass, NOW));
    assert.ok(await verifyInNode(pass, NOW));
  }
});

// now = 0 is a kept message's check (watching.js claimsOf), as the web's server-pass check reads it: the pass's
// expiry isn't held against it, either way, but the rest is checked.
test('now = 0 takes a good pass whatever its exp, and still refuses a bad name or signature', async () => {
  const [key, other] = [await newKey(), await newKey()];
  const { pass, claims } = await makeSelfPass(key, 'Ana', NOW);
  const signed = async (changes, by = key) => {
    const body = encode({ ...claims, ...changes });
    return `${body}.${await sign(by.privateKey, body)}`;
  };
  for (const check of [verifySelfPass, verifyInNode]) {
    assert.deepEqual(await check(pass, 0), claims);
    assert.ok(await check(await signed({ exp: 1e15 }), 0));   // not capped either
    assert.equal(await check(await signed({ name: ['x'] }), 0), null);
    assert.equal(await check(await signed({}, other), 0), null);
  }
});
