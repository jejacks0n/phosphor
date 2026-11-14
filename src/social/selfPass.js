// Desktop passes: with no server to sign them, a person's own key signs their pass. Same format as
// pass.js; the sub is the key's fingerprint, so nobody can claim another key's sub. desktop/selfPass.js
// is the same check written for Node.
import { toBase64url, fromBase64url } from './base64url.js';
import { sign, verifySignature } from './keys.js';
import { USERNAME_MAX } from './names.js';

const HOUR = 3600;
const DRIFT = 300;   // a clock this many seconds ahead of the host's still has its pass taken

// base64url of the first 16 bytes of SHA-256 over the raw public key: 22 characters.
export async function fingerprint(publicKeyB64) {
  const hash = await crypto.subtle.digest('SHA-256', fromBase64url(publicKeyB64));
  return toBase64url(new Uint8Array(hash).slice(0, 16));
}

// { pass, claims } for this key, good for an hour.
export async function makeSelfPass({ privateKey, publicKey }, name, now = Date.now()) {
  const claims = { sub: await fingerprint(publicKey), name, guest: false, verified: true, key: publicKey, exp: Math.floor(now / 1000) + HOUR };
  const body = toBase64url(new TextEncoder().encode(JSON.stringify(claims)));
  return { pass: `${body}.${await sign(privateKey, body)}`, claims };
}

// The claims of a pass signed by its own key, whose sub is that key's fingerprint, whose name is a name (a string,
// not blank, at most USERNAME_MAX) and which hasn't expired and isn't good for much more than an hour, or null for
// anything else: the key signs whatever claims it likes.
export async function verifySelfPass(pass, now = Date.now()) {
  try {
    const [body, signature, ...rest] = pass.split('.');
    if (!signature || rest.length) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromBase64url(body)));
    if (!await verifySignature(claims.key, body, signature)) return null;
    if (claims.sub !== await fingerprint(claims.key)) return null;
    const named = typeof claims.name === 'string' && claims.name.trim() !== '' && claims.name.length <= USERNAME_MAX;
    return named && claims.exp * 1000 > now && claims.exp * 1000 <= now + (HOUR + DRIFT) * 1000 ? claims : null;
  } catch {
    return null;
  }
}
