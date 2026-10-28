// The chat panel (ChatPanel.vue) with the room store as a room leaves it: a new message draws its own row
// only, a deletion draws that row again, and the host's Delete buttons say whose message they are for.
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

// The list in order, as read: each line of who came and went, each message's text, and "You joined".
const read = () => [...host.querySelectorAll('.list .presence, .list .joined, .list .message')]
  .map((el) => (el.matches('.message') ? el.querySelector('.text').textContent : el.textContent.replace(/\s+/g, ' ').trim()));

test('who came and went with nothing between is one line, each name in its color; your own isn\'t shown, and "You joined" ends a line', async () => {
  const room = await mount('watch', 0);
  const came = (n, presence, fields) => row(n, { text: '', presence, ...fields });
  room.chat = [came(0, 'joined'), came(1, 'left'), came(2, 'joined', { mine: true }), came(3, 'joined'), row(4), came(5, 'left'), came(6, 'joined')];
  room.joinedAt = row(5).id;
  await nextTick();
  expect(read()).toEqual(['name-0 joined, name-1 left, name-3 joined', 'm4', 'name-5 left', 'You joined', 'name-6 joined']);
  expect(host.querySelector('.presence b').style.color).not.toBe('');

  // Folded, comings and goings aren't counted as new messages.
  host.querySelector('button.fold').click();
  room.chat = [...room.chat, came(7, 'left')];
  await nextTick();
  expect(host.querySelector('span.count')).toBe(null);
  room.chat = [...room.chat, row(8)];
  await nextTick();
  expect(host.querySelector('span.count').textContent).toBe('1');
});

test('the host has no Delete for who came and went', async () => {
  const room = await mount('host', 1);
  room.chat = [...room.chat, row(1, { text: '', presence: 'joined' })];
  await nextTick();
  expect(host.querySelectorAll('button.delete')).toHaveLength(1);
});
