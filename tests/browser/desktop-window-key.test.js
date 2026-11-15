// A desktop window's key: the computer's for one window at a time, its own for the rest.
import { test, expect } from 'vitest';
import { windowKey, DEVICE_LOCK, WINDOW_KEY } from '@/social/windowKey';
import { makeSelfPass, verifySelfPass } from '@/social/selfPass';
import { sign, verifySignature } from '@/social/keys';
import { toBase64url } from '@/social/base64url';

const fakeLocks = () => {
  const held = new Set();
  return {
    held,
    request: (name, _options, callback) => {
      if (held.has(name)) return Promise.resolve(callback(null));
      held.add(name);
      return Promise.resolve(callback({ name }));
    },
    free: (name) => held.delete(name),
  };
};
const fakeStorage = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
};
const makeDevice = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const device = { privateKey: pair.privateKey, publicKey: toBase64url(raw) };
  return { device, deviceKey: async () => device };
};

test("the first window takes the computer's key and holds its lock", async () => {
  const { device, deviceKey } = await makeDevice();
  const locks = fakeLocks();
  const storage = fakeStorage();
  expect(await windowKey({ deviceKey, locks, storage })).toBe(device);
  expect(locks.held.has(DEVICE_LOCK)).toBe(true);
  expect(storage.getItem(WINDOW_KEY)).toBe('{"device":true}');
});

test('a second window makes a key of its own', async () => {
  const { device, deviceKey } = await makeDevice();
  const locks = fakeLocks();
  await windowKey({ deviceKey, locks, storage: fakeStorage() });
  const own = await windowKey({ deviceKey, locks, storage: fakeStorage() });
  expect(own.publicKey).not.toBe(device.publicKey);
  const { pass } = await makeSelfPass(own, 'ann');
  expect((await verifySelfPass(pass)).key).toBe(own.publicKey);
});

test("a reload keeps the window's own key", async () => {
  const { deviceKey } = await makeDevice();
  const locks = fakeLocks();
  await windowKey({ deviceKey, locks, storage: fakeStorage() });
  const storage = fakeStorage();
  const first = await windowKey({ deviceKey, locks, storage });
  const again = await windowKey({ deviceKey, locks, storage });
  expect(again.publicKey).toBe(first.publicKey);
  expect(await verifySignature(again.publicKey, 'hi', await sign(again.privateKey, 'hi'))).toBe(true);
});

test("a reload keeps the computer's key", async () => {
  const { device, deviceKey } = await makeDevice();
  const locks = fakeLocks();
  const storage = fakeStorage();
  await windowKey({ deviceKey, locks, storage });
  locks.free(DEVICE_LOCK);
  expect(await windowKey({ deviceKey, locks, storage })).toBe(device);
  expect(locks.held.has(DEVICE_LOCK)).toBe(true);
});

test("once the computer's key is free, the next new window takes it", async () => {
  const { device, deviceKey } = await makeDevice();
  const locks = fakeLocks();
  await windowKey({ deviceKey, locks, storage: fakeStorage() });
  locks.free(DEVICE_LOCK);
  expect(await windowKey({ deviceKey, locks, storage: fakeStorage() })).toBe(device);
});

test("no Web Locks: the computer's key", async () => {
  const { device, deviceKey } = await makeDevice();
  expect(await windowKey({ deviceKey, locks: undefined, storage: fakeStorage() })).toBe(device);
});
