// What a narrow screen says in place of rooms (NarrowRooms.vue): the words, and for a watcher the room's own Exit.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import { useRoomStore } from '@/store/RoomStore';
import NarrowRooms from '@/components/social/NarrowRooms.vue';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
});

async function mount(role) {
  await createTestApp();
  const room = useRoomStore();
  room.role = role;
  room.leave = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(NarrowRooms).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  return room;
}

test('a watcher is told rooms need a wider screen, and Exit is the room\'s own', async () => {
  const room = await mount('watch');
  expect(host.textContent).toContain('Rooms need a wider screen.');
  host.querySelector('button').click();
  expect(room.leave).toHaveBeenCalledOnce();
});

test('a host, or someone with only a link, is told, with no Exit', async () => {
  await mount('host');
  expect(host.textContent).toContain('Rooms need a wider screen.');
  expect(host.querySelector('button')).toBe(null);
});
