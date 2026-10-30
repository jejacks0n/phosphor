// Passes: the server's signed statement of who this browser is, good for an hour. A pass is
// base64url(JSON claims) + '.' + base64url(signature); the server and hosts check the signature.
import { api } from './api.js';
import { fromBase64url } from './base64url.js';
import { proof } from './keys.js';

const RENEW_EARLY_MS = 5 * 60_000;

// { sub, name, guest, verified, key, exp } (exp in epoch seconds). Read only, not verified; throws on
// a malformed pass.
export function decodePass(pass) {
  return JSON.parse(new TextDecoder().decode(fromBase64url(pass.split('.')[0])));
}

// A pass for this browser's key: { pass, claims }, or { error, until? } with the server's code
// (NEEDS_ONBOARDING, SUSPENDED with until, THROTTLED, NETWORK). A guest renewing passes its previous
// pass, with a proof it's theirs, to keep their id and nickname.
export async function requestPass({ privateKey, publicKey }, previous) {
  const body = { key: publicKey };
  if (previous) Object.assign(body, { previous }, await proof(privateKey, (ts) => `pass-renew:${ts}`));
  const { ok, data, code } = await api('/api/pass', { method: 'POST', body });
  if (ok && data?.pass) return { pass: data.pass, claims: data.claims };
  const error = code ?? 'UNKNOWN';
  return data?.until ? { error, until: data.until } : { error };
}

// When to ask for the next pass: 5 minutes before this one expires, or now if that's passed.
export function renewAt(claims, now = Date.now()) {
  return Math.max(now, claims.exp * 1000 - RENEW_EARLY_MS);
}

let passKeyRequest = null;

// The server's raw Ed25519 public key (base64url) that its passes are signed with: asked once per page,
// and again after a failed ask. Throws when the server can't be reached.
export function passKey() {
  passKeyRequest ??= api('/api/pass-key').then(({ ok, data }) => {
    if (!ok || typeof data?.key !== 'string') throw new Error('No pass key');
    return data.key;
  }).catch((error) => {
    passKeyRequest = null;
    throw error;
  });
  return passKeyRequest;
}

// The claims of a pass signed by the server's key (keyB64, from passKey) and not yet expired, or null for
// anything else, malformed passes included. Hosts use this on a watcher's pass.
export async function verifyPass(pass, keyB64, now = Date.now()) {
  try {
    const [body, signature, ...rest] = pass.split('.');
    if (!signature || rest.length) return null;
    const key = await crypto.subtle.importKey('raw', fromBase64url(keyB64), { name: 'Ed25519' }, false, ['verify']);
    if (!await crypto.subtle.verify('Ed25519', key, fromBase64url(signature), new TextEncoder().encode(body))) return null;
    const claims = decodePass(pass);
    return claims.exp * 1000 > now ? claims : null;
  } catch {
    return null;
  }
}
