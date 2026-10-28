// The chat panel (ChatPanel.vue) with the room store as a room leaves it: a new message draws its own row
// only, a deletion draws that row again, the host's Delete buttons say whose message they are for, and the
// watcher's Following is a toggle.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { createTestApp } from '../support/app.js';
import { useRoomStore } from '@/store/RoomStore';
import ChatPanel from '@/components/social/ChatPanel.vue';

let app = null, host = null, formatted = 0;
const formatGetter = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, 'format');
afterEach(() => {
  app?.unmount();
  host?.remove();
  Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', formatGetter);
  vi.restoreAllMocks();
});

const row = (n, fields = {}) => ({ id: String(n).padStart(16, '0'), ts: 1_700_000_000_000 + n * 60_000, text: `m${n}`, sub: `u_${n}`, name: `name-${n}`, host: false, mine: false, deleted: false, ...fields });

async function mount(role, count) {
  await createTestApp();
  const room = useRoomStore();
  Object.assign(room, { role, id: 'abcdefghij', status: 'live', room: { name: 'neon harbor', welcome: '' }, chat: Array.from({ length: count }, (_, n) => row(n)) });
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(ChatPanel).use(getActivePinia());
  app.mount(host);
  await nextTick();
  return room;
}

// Counts the times a time is formatted, which is once for each row drawn.
function countFormats() {
  Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', {
    configurable: true,
    get() {
      const format = formatGetter.get.call(this);
      return (date) => { formatted++; return format(date); };
    },
  });
  formatted = 0;
}

test('a new message draws its own row only; a deletion draws that row again', async () => {
  countFormats();
  const room = await mount('watch', 40);
  expect(formatted).toBe(40);
  room.chat = [...room.chat, row(40)];
  await nextTick();
  expect(formatted).toBe(41);
  expect(host.querySelectorAll('.message')).toHaveLength(41);
  Object.assign(room.chat[3], { deleted: true, text: '' });
  await nextTick();
  expect(formatted).toBe(41);   // a deleted row shows no time
  expect(host.querySelectorAll('.message')[3].textContent).toContain('Message deleted by the host');
});

test('the host\'s Delete buttons each name the sender', async () => {
  await mount('host', 2);
  const buttons = [...host.querySelectorAll('button.delete')];
  expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Delete message from name-0', 'Delete message from name-1']);
  expect(buttons.map((b) => b.textContent)).toEqual(['Delete', 'Delete']);
});

test('Following is a toggle: aria-pressed says whether it\'s on', async () => {
  const white = { hex: '#ffffff', r: 255, g: 255, b: 255 };
  const room = await mount('watch', 0);
  Object.assign(room, { room: { name: 'neon harbor', welcome: '', host: 'ansi-fan' }, art: { cols: 1, lines: 1, font: null, cells: [{ char: 'A', fg: white, bg: white }] } });
  await nextTick();
  const toggle = () => [...host.querySelectorAll('button')].find((b) => b.textContent.startsWith('Follow'));
  expect([toggle().textContent, toggle().getAttribute('aria-pressed')]).toEqual(['Following', 'true']);
  room.following = false;
  await nextTick();
  expect([toggle().textContent, toggle().getAttribute('aria-pressed')]).toEqual(['Follow ansi-fan', 'false']);
});
