// Self-signed passes, checked in Node (the main process and the room service). The same logic as
// src/social/selfPass.js, written without the renderer's modules.
import { Buffer } from 'node:buffer';

const USERNAME_MAX = 24;    // src/social/names.js's
const MOST_SECONDS = 3900;  // an hour, as makeSelfPass gives, and 5 minutes for a clock ahead of this one's
const b64 = (text) => {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new Error('Not base64url');
  return Buffer.from(text, 'base64url');
};

async function fingerprint(keyB64) {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', b64(keyB64));
  return Buffer.from(hash).subarray(0, 16).toString('base64url');
}

// Whether proofB64 is an Ed25519 signature over the message's UTF-8 bytes by the raw public key keyB64.
export async function verifyProof(keyB64, message, proofB64) {
  try {
    const key = await globalThis.crypto.subtle.importKey('raw', b64(keyB64), { name: 'Ed25519' }, false, ['verify']);
    return await globalThis.crypto.subtle.verify('Ed25519', key, b64(proofB64), new TextEncoder().encode(message));
  } catch {
    return false;
  }
}

// The claims, or null: the pass's own key signs whatever claims it likes, so the name must be a name (a string, not
// blank, at most USERNAME_MAX) and the pass good for no more than about an hour.
export async function verifySelfPass(pass, now = Date.now()) {
  try {
    const [body, signature, ...rest] = pass.split('.');
    if (!signature || rest.length) return null;
    const claims = JSON.parse(b64(body).toString('utf8'));
    if (!await verifyProof(claims.key, body, signature)) return null;
    if (claims.sub !== await fingerprint(claims.key)) return null;
    const named = typeof claims.name === 'string' && claims.name.trim() !== '' && claims.name.length <= USERNAME_MAX;
    // now = 0 is a kept message's check: its expiry isn't held against it (exp > 0, as the web's server-pass check reads it).
    return named && claims.exp * 1000 > now && (now === 0 || claims.exp * 1000 <= now + MOST_SECONDS * 1000) ? claims : null;
  } catch {
    return null;
  }
}
