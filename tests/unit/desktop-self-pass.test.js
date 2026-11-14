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
