// The screen kept on while you're in a room or an animation plays, with the browser's Screen Wake Lock standing in.
import { test, expect, vi, afterEach } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createTestApp } from '../support/app.js';
import { useRoomStore } from '@/store/RoomStore';
import { useScreenAwake } from '@/composables/useScreenAwake';

let app = null, restore = null;
afterEach(() => {
  app?.unmount();
  restore?.();
  app = restore = null;
  vi.restoreAllMocks();
});

// navigator.wakeLock, whose request gives a lock that says when it's let go.
function fakeWakeLock(request = async (type) => Object.assign(new EventTarget(), { type, release: vi.fn(async () => {}) })) {
  const had = Object.getOwnPropertyDescriptor(navigator, 'wakeLock');
  const wakeLock = { request: vi.fn(request) };
  Object.defineProperty(navigator, 'wakeLock', { value: wakeLock, configurable: true });
  restore = () => (had ? Object.defineProperty(navigator, 'wakeLock', had) : delete navigator.wakeLock);
  return wakeLock;
}

async function mounted() {
  const stores = await createTestApp();
  app = createApp({ setup() { useScreenAwake(); return () => null; } }).use(stores.pinia);
  app.mount(document.createElement('div'));
  return { ...stores, room: useRoomStore(stores.pinia) };
}

const held = async (wakeLock, n) => {
  await vi.waitUntil(() => wakeLock.request.mock.calls.length === n, { interval: 5 });
  return wakeLock.request.mock.results[n - 1].value;
};

test('playing keeps the screen on and stopping lets it go; so does being in a room, hosting or watching', async () => {
  const wakeLock = fakeWakeLock();
  const { workspace, room } = await mounted();
  await nextTick();
  expect(wakeLock.request).not.toHaveBeenCalled();

  workspace.playing = true;
  const playing = await held(wakeLock, 1);
  expect(wakeLock.request).toHaveBeenCalledWith('screen');
  workspace.playing = false;
  await vi.waitUntil(() => playing.release.mock.calls.length, { interval: 5 });

  for (const [role, n] of [['host', 2], ['watch', 3]]) {
    room.role = role;
    const lock = await held(wakeLock, n);
    workspace.playing = true; // still on: nothing asked again
    await nextTick();
    workspace.playing = false;
    await nextTick();
    expect(lock.release).not.toHaveBeenCalled();
    room.role = null;
    await vi.waitUntil(() => lock.release.mock.calls.length, { interval: 5 });
  }
  expect(wakeLock.request).toHaveBeenCalledTimes(3);
});

test('a browser that refuses leaves the screen to sleep, with only a warning', async () => {
  const wakeLock = fakeWakeLock(async () => { throw new DOMException('Battery saver is on.', 'NotAllowedError'); });
  const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { workspace } = await mounted();
  workspace.playing = true;
  await vi.waitUntil(() => warned.mock.calls.length, { interval: 5 });
  expect(wakeLock.request).toHaveBeenCalledTimes(1);
  expect(warned.mock.calls[0][0]).toBe('Could not keep the screen on');
});
