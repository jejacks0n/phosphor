// The chat panel (ChatPanel.vue) with the room store as a room leaves it: a new message draws its own row
// only, a deletion draws that row again, the host's Delete buttons say whose message they are for, and the
// host's "N here" counts those connected and lists everyone; Report shows only where a confirmed member may report.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { createTestApp } from '../support/app.js';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
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

const watcher = (peer, name, fields) => ({ peer, sub: `u_${peer}`, name, guest: false, following: true, connected: true, ...fields });

test('only connected watchers count in N here; one still connecting is listed, saying so', async () => {
  const room = await mount('host', 0);
  room.watchers = [watcher('p1', 'tin-lantern-owl'), watcher('p2', 'quiet-amber-fox', { connected: false }), watcher('p3', 'wren', { guest: true, following: false })];
  await nextTick();
  const toggle = host.querySelector('button.here');
  expect(toggle.textContent.replace(/\s+/g, ' ').trim()).toBe('2 here ▾');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');   // folded to begin with
  expect(host.querySelector('.people ul')).toBe(null);

  toggle.click();
  await nextTick();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  const rows = [...host.querySelectorAll('.people li')];
  expect(rows.map((li) => li.querySelector('.name').textContent)).toEqual(['tin-lantern-owl', 'quiet-amber-fox', 'wren']);
  expect(rows.map((li) => li.querySelector('.what').textContent)).toEqual(['following', 'connecting…', 'looking around']);
  expect(rows.map((li) => !!li.querySelector('.tag'))).toEqual([false, false, true]);
  expect(rows.map((li) => !!li.querySelector('button'))).toEqual([true, true, false]);   // a guest has no ⋯
  expect(rows[0].querySelector('.name').style.color).not.toBe('');
  expect(host.querySelector('.swatch')).toBe(null);   // no dots or avatars

  room.close();   // the fold is remembered while the room lasts, not after
  expect(room.peopleOpen).toBe(false);
});

test('a watcher\'s panel has no people list and no room menu; the host\'s has both', async () => {
  await mount('watch', 0);
  expect(host.querySelector('.people')).toBe(null);
  expect(host.querySelector('.room-menu')).toBe(null);
  app.unmount();
  host.remove();
  await mount('host', 0);
  expect(host.querySelector('.people')).not.toBe(null);
  expect(host.querySelector('.room-menu')).not.toBe(null);
});

test('End room asks first: Cancel keeps the room, End room ends it', async () => {
  const room = await mount('host', 0);
  const end = vi.spyOn(room, 'endRoom').mockImplementation(() => {});
  const inMenu = (name) => [...host.querySelectorAll('.dropdown-content button')].find((b) => b.textContent === name);
  const menuItem = async (name) => {
    // Opened again if the page closed it meanwhile (a resize does); polled, so the click comes a while after the menu is drawn
    // (Vue skips a click made in the same millisecond).
    await vi.waitFor(() => {
      if (!host.querySelector('.dropdown-content')) host.querySelector('.room-menu .dropdown-trigger').click();
      expect(inMenu(name)).toBeTruthy();
    });
    inMenu(name).click();
    await nextTick();
  };
  const dialogButton = (name) => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === name);

  await menuItem('End room');
  expect(document.querySelector('[role=dialog] h3').textContent).toBe('End the room?');
  expect(document.querySelector('[role=dialog] .sub').textContent).toBe('Everyone watching leaves, and the chat is gone.');
  expect(document.activeElement).toBe(dialogButton('Cancel'));
  dialogButton('Cancel').click();
  await nextTick();
  expect(document.querySelector('[role=dialog]')).toBe(null);
  expect(end).not.toHaveBeenCalled();

  await menuItem('End room');
  dialogButton('End room').click();
  await nextTick();
  expect(end).toHaveBeenCalledOnce();
  expect(document.querySelector('[role=dialog]')).toBe(null);
});

// Report, on a message: for a confirmed member, on other people's messages that show.
const reports = () => [...host.querySelectorAll('button.report')].map((b) => b.getAttribute('aria-label'));
const claims = (fields) => ({ sub: 'u_me', name: 'me', guest: false, verified: true, key: 'k', exp: 0, ...fields });

test('Report shows on other people\'s messages for a confirmed member; not on your own, a deleted one, a presence line or a folded blocked one', async () => {
  const room = await mount('watch', 0);
  const social = useSocialStore();
  social.claims = claims({});
  social.blocked = [{ id: 'u_4', username: 'name-4', since: 1 }];
  room.chat = [row(0), row(1, { mine: true, sub: 'u_me' }), row(2, { deleted: true, text: '' }), row(3, { text: '', presence: 'joined' }), row(4), row(5)];
  await nextTick();
  expect(reports()).toEqual(['Report message from name-0', 'Report message from name-5']);
  expect(host.querySelector('button.report').textContent).toBe('Report');

  [...host.querySelectorAll('.message button')].find((b) => b.textContent === 'Show').click();
  await nextTick();
  expect(reports()).toEqual(['Report message from name-0', 'Report message from name-4', 'Report message from name-5']);
});

test('no Report for a guest or a member who hasn\'t confirmed their email', async () => {
  await mount('watch', 2);
  const social = useSocialStore();
  for (const fields of [{ guest: true, verified: false }, { verified: false }]) {
    social.claims = claims(fields);
    await nextTick();
    expect(reports()).toEqual([]);
  }
  social.claims = claims({});   // the rows are drawn again when that changes
  await nextTick();
  expect(reports()).toHaveLength(2);
});

test('the report dialog: a report that can\'t go leaves it as it is; with its Report gone, focus goes to "N here" (a host) or the messages (a watcher)', async () => {
  const dialogButton = (name) => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === name);
  for (const [role, back] of [['host', 'button.here'], ['watch', '[role=log]']]) {
    const room = await mount(role, 1);
    useSocialStore().claims = claims({});
    await nextTick();
    const report = vi.spyOn(room, 'report').mockReturnValue(false);
    host.querySelector('button.report').click();
    await nextTick();
    expect(document.querySelector('[role=dialog] h3').textContent).toBe('Report name-0?');
    expect(dialogButton('Report').disabled).toBe(true);
    document.querySelector('[role=dialog] input[value=other]').click();
    await nextTick();
    dialogButton('Report').click();
    await nextTick();
    expect(report).toHaveBeenCalledWith({ sub: 'u_0', messageId: room.chat[0].id, reason: 'other' });
    expect(document.querySelector('[role=dialog]')).not.toBe(null);   // still asking, as it was
    expect(document.body.textContent).not.toContain('Reported.');

    Object.assign(room.chat[0], { deleted: true, text: '' });   // its Report goes
    await nextTick();
    dialogButton('Cancel').click();
    await nextTick();
    expect(document.querySelector('[role=dialog]')).toBe(null);
    expect(document.activeElement).toBe(host.querySelector(back));
    app.unmount();
    host.remove();
    app = null;
  }
});
