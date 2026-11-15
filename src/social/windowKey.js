// A desktop window's identity in rooms. One window at a time holds the computer's key (keys.js); any other
// window makes a key of its own, kept in sessionStorage so it lives through a reload and goes with the window.
import { toBase64url } from './base64url.js';
import { loadKey } from './keys.js';

export const DEVICE_LOCK = 'phosphor-device-key';
export const WINDOW_KEY = 'phosphor-window-key';

const ED25519 = { name: 'Ed25519' };

const kept = (storage) => {
  try {
    return JSON.parse(storage.getItem(WINDOW_KEY));
  } catch {
    return null;
  }
};

const keep = (storage, record) => {
  try {
    storage.setItem(WINDOW_KEY, JSON.stringify(record));
  } catch { /* no storage: the key lasts until the next reload */ }
};

// True if this window now holds the computer's key's lock: held until the window goes.
const takeDeviceLock = (locks) => new Promise((resolve) => {
  locks.request(DEVICE_LOCK, { ifAvailable: true }, (lock) => {
    resolve(Boolean(lock));
    return lock ? new Promise(() => {}) : undefined;
  }).catch(() => resolve(false));
});

async function ownKey(storage) {
  const record = kept(storage);
  if (record?.jwk) {
    try {
      const privateKey = await crypto.subtle.importKey('jwk', record.jwk, ED25519, false, ['sign']);
      return { privateKey, publicKey: record.publicKey };
    } catch { /* what was kept doesn't import: make a new one */ }
  }
  // Extractable, unlike the computer's key, so it can be kept across a reload: it's this window's alone and goes with it.
  const pair = await crypto.subtle.generateKey(ED25519, true, ['sign', 'verify']);
  const publicKey = toBase64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  keep(storage, { jwk, publicKey });
  return { privateKey: pair.privateKey, publicKey };
}

// { privateKey, publicKey } as loadKey gives.
export async function windowKey({ deviceKey = loadKey, locks = navigator.locks, storage = sessionStorage } = {}) {
  if (!locks) return deviceKey();
  if (kept(storage)?.jwk) return ownKey(storage);
  // ponytail: a reload races any window booting at that moment for the computer's key; the loser makes its own key
  if (await takeDeviceLock(locks)) {
    keep(storage, { device: true });
    return deviceKey();
  }
  return ownKey(storage);
}
