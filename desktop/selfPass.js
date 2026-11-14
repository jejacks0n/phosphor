// Self-signed passes, checked in Node (the main process and the room service). The same logic as
// src/social/selfPass.js, written without the renderer's modules.
import { Buffer } from 'node:buffer';
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

export async function verifySelfPass(pass, now = Date.now()) {
  try {
    const [body, signature, ...rest] = pass.split('.');
    if (!signature || rest.length) return null;
    const claims = JSON.parse(b64(body).toString('utf8'));
    if (!await verifyProof(claims.key, body, signature)) return null;
    if (claims.sub !== await fingerprint(claims.key)) return null;
    return claims.exp * 1000 > now ? claims : null;
  } catch {
    return null;
  }
}
