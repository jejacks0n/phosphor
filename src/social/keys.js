// The browser's own Ed25519 key: one pair per browser, kept in IndexedDB. Its private half can't be
// exported, so it never leaves the browser; passes name the public half, and every time a pass is
// presented a fresh signature (a proof) shows it's this browser presenting it.
import { toBase64url } from './base64url.js';

const ED25519 = { name: 'Ed25519' };

// Older browsers (Safari before 17) don't do Ed25519 in WebCrypto: the SOCIAL tab says so instead.
export async function ed25519Supported() {
  try {
    await crypto.subtle.generateKey(ED25519, false, ['sign', 'verify']);
    return true;
  } catch {
    return false;
  }
}

// One IndexedDB request as a promise, answered once its transaction has committed and the database is
// closed, so what it wrote is stored and the database can be deleted (tests, a reset).
// A request that throws as it's made (DataCloneError, a quota) rejects too, rather than never settling.
function withStore(mode, use) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('phosphor-social', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('keys');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const fail = (error) => { db.close(); reject(error); };
      let req;
      let tx;
      try {
        tx = db.transaction('keys', mode);
        req = use(tx.objectStore('keys'));
      } catch (error) {
        return fail(error);
      }
      tx.oncomplete = () => { db.close(); resolve(req.result); };
      tx.onabort = () => fail(tx.error);
      req.onerror = (event) => { event.preventDefault(); fail(req.error); };
    };
  });
}

async function readOrMakeKey() {
  const stored = await withStore('readonly', (keys) => keys.get('device'));
  if (stored) return stored;
  const pair = await crypto.subtle.generateKey(ED25519, false, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const made = { privateKey: pair.privateKey, publicKey: toBase64url(raw) };
  try {
    await withStore('readwrite', (keys) => keys.add(made, 'device'));
    return made;
  } catch (error) {
    // Another tab stored its key first: use that one, so the browser has just the one. Any other
    // failure (a quota, a browser that won't store keys) is loadKey's failure.
    const theirs = await withStore('readonly', (keys) => keys.get('device'));
    if (!theirs) throw error;
    return theirs;
  }
}

let loading = null;

// { privateKey: CryptoKey, publicKey: base64url of the raw 32 bytes }. Read from IndexedDB once, then
// kept; concurrent first calls share the one read (and the one new key).
export function loadKey() {
  loading ??= readOrMakeKey().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

// The next loadKey reads IndexedDB again, as a new page would.
export function forgetKey() {
  loading = null;
}

// base64url Ed25519 signature over the message's UTF-8 bytes.
export async function sign(privateKey, message) {
  const signature = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(message));
  return toBase64url(new Uint8Array(signature));
}

// A proof to go with a pass: proof(key, (ts) => `lobby:${ts}`). The server takes it within 60 s of ts.
export async function proof(privateKey, messageOf, now = Date.now()) {
  return { ts: now, proof: await sign(privateKey, messageOf(now)) };
}
