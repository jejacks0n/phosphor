// Passes: the server's signed statement of who this browser is, good for an hour. A pass is
// base64url(JSON claims) + '.' + base64url(signature); the server and hosts check the signature.
import { api } from './api.js';
import { fromBase64url } from './base64url.js';
import { proof } from './keys.js';

const RENEW_EARLY_MS = 5 * 60_000;

// { sub, name, guest, verified, key, exp } (exp in epoch seconds). Read only, not verified.
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
