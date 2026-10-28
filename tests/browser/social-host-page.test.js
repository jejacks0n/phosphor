// The host's page (HostRoomPage.vue) with the room store as hosting leaves it: how many are watching,
// Copy link, Room settings' Save, and one status region that's always there.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { createTestApp } from '../support/app.js';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import HostRoomPage from '@/components/social/HostRoomPage.vue';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.restoreAllMocks();
});

async function mount(state) {
  await createTestApp();
  const room = useRoomStore();
  Object.assign(room, {
    role: 'host', id: 'abcdefghij', link: 'http://localhost/?room=abcdefghij', status: 'live',
    room: { name: 'neon harbor', welcome: '', public: true, allowGuests: true, max: 12, count: 0 }, ...state,
  });
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(HostRoomPage).use(getActivePinia());
  app.mount(host);
  await nextTick();
  return { room, region: host.querySelector('[role=status]') };
}

const button = (name) => [...host.querySelectorAll('button')].find((b) => b.textContent === name);
const watcher = (peer, name, fields) => ({ peer, sub: `u_${peer}`, name, guest: false, following: true, connected: true, ...fields });

test('only connected watchers count as watching; who they are is in the chat panel, not here', async () => {
  await mount({ watchers: [watcher('p1', 'tin-lantern-owl'), watcher('p2', 'quiet-amber-fox', { connected: false })] });
  expect(host.querySelector('.count').textContent).toBe('1 watching');
  expect(host.querySelector('li')).toBe(null);
});

test('Copy link that the browser refuses says it couldn\'t copy', async () => {
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  await mount();
  button('Copy link').click();
  await vi.waitFor(() => expect(useSocialStore().notice).toBe('Couldn\'t copy the link'));
  expect(button('Copy link')).toBeTruthy();
});

test('one status region, always there, says Reconnecting…, Copied and Saved', async () => {
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  const { room, region } = await mount({ status: 'reconnecting' });
  expect(host.querySelectorAll('[role=status]')).toHaveLength(1);
  expect(region.textContent).toBe('Reconnecting…');
  expect(region.getBoundingClientRect().width).toBeGreaterThan(1);   // seen, too
  room.status = 'live';
  await nextTick();
  expect(host.querySelector('[role=status]')).toBe(region);
  expect(region.textContent).toBe('');

  button('Copy link').click();
  await vi.waitFor(() => expect(region.textContent).toBe('Copied'));
  expect(host.querySelectorAll('[role=status]')).toHaveLength(1);
  host.querySelector('form').requestSubmit();
  await nextTick();
  expect(button('Saved')).toBeTruthy();
  expect(region.textContent).toBe('Saved');
});
