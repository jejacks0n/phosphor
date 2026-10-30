// The chat panel (ChatPanel.vue) with the room store as a room leaves it: a new message draws its own row
// only, a deletion draws that row again, the host's Delete buttons say whose message they are for, and the
// host's "N here" counts those connected and lists everyone; Report shows only where a confirmed member may report.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { createTestApp } from '../support/app.js';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { nameColor, nameGlyph } from '@/social/names';
import ChatPanel from '@/components/social/ChatPanel.vue';
import ReportDialog from '@/components/social/ReportDialog.vue';

let app = null, host = null, formatted = 0;
const formatGetter = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, 'format');
afterEach(() => {
  app?.unmount();
  host?.remove();
  Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', formatGetter);
  vi.restoreAllMocks();
  vi.useRealTimers();
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

// A name is in the text color, after its cell: its glyph on its color (a color can be hard to read on a theme).
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const swatched = (el, name) => !el.style.color && el.firstElementChild?.matches('.cell') && el.firstElementChild.style.backgroundColor === rgb(nameColor(name)) && el.firstElementChild.dataset.glyph === nameGlyph(name);

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

test('who came and went with nothing between is one line, the names without their cells; your own isn\'t shown, and "You joined" ends a line', async () => {
  const room = await mount('watch', 0);
  const came = (n, presence, fields) => row(n, { text: '', presence, ...fields });
  room.chat = [came(0, 'joined'), came(1, 'left'), came(2, 'joined', { mine: true }), came(3, 'joined'), row(4), came(5, 'left'), came(6, 'joined')];
  room.joinedAt = row(5).id;
  await nextTick();
  expect(read()).toEqual(['name-0 joined, name-1 left, name-3 joined', 'm4', 'name-5 left', 'You joined', 'name-6 joined']);
  expect(host.querySelector('.presence .person').textContent).toBe('name-0');
  expect(host.querySelector('.presence .cell')).toBe(null);
  expect(swatched(host.querySelector('.message .name'), 'name-4')).toBe(true);

  // Folded, comings and goings aren't counted as new messages.
  host.querySelector('button.fold').click();
  room.chat = [...room.chat, came(7, 'left')];
  await nextTick();
  expect(host.querySelector('span.count')).toBe(null);
  room.chat = [...room.chat, row(8)];
  await nextTick();
  expect(host.querySelector('span.count').textContent).toBe('1');
});

test('someone who comes and goes more than once in a line is named once, by how it ended up', async () => {
  const room = await mount('host', 0);
  const of = (n, sub, presence) => row(n, { text: '', presence, sub: `u_${sub}`, name: `name-${sub}` });
  room.chat = [of(0, 1, 'joined'), of(1, 2, 'joined'), of(2, 1, 'left'), of(3, 1, 'joined'), of(4, 3, 'joined'), of(5, 3, 'left'),
    of(6, 4, 'left'), of(7, 4, 'joined'), of(8, 5, 'left'), of(9, 5, 'joined'), of(10, 5, 'left'), row(11)];
  await nextTick();
  expect(read()).toEqual(['name-1 joined, name-2 joined, name-3 came and went, name-4 came back, name-5 left', 'm11']);

  // A later event for someone already in the line changes their words, not the line's length.
  room.chat = [...room.chat.slice(0, 2), of(12, 2, 'left')];
  await nextTick();
  expect(read()).toEqual(['name-1 joined, name-2 came and went']);
});

test('the host has no Delete for who came and went', async () => {
  const room = await mount('host', 1);
  room.chat = [...room.chat, row(1, { text: '', presence: 'joined' })];
  await nextTick();
  expect(host.querySelectorAll('button.delete')).toHaveLength(1);
});

const watcher = (peer, name, fields) => ({ peer, sub: `u_${peer}`, name, guest: false, tracking: true, connected: true, ...fields });

test('only connected watchers count in N here; one still connecting is listed, saying so', async () => {
  const room = await mount('host', 0);
  room.watchers = [watcher('p1', 'tin-lantern-owl'), watcher('p2', 'quiet-amber-fox', { connected: false }), watcher('p3', 'wren', { guest: true, tracking: false })];
  await nextTick();
  const toggle = host.querySelector('button.here');
  expect(toggle.textContent.replace(/\s+/g, ' ').trim()).toBe('2 here');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');   // folded to begin with
  expect(host.querySelector('.people ul')).toBe(null);
  // A chevron at the button's right edge, pointing down while folded and up once open.
  const chevron = toggle.querySelector('svg.chevron');
  const right = () => toggle.getBoundingClientRect().right - chevron.getBoundingClientRect().right;
  expect(right()).toBeGreaterThan(8);
  expect(right()).toBeLessThan(16);
  expect(getComputedStyle(chevron).transform).toBe('none');

  toggle.click();
  await nextTick();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  await expect.poll(() => getComputedStyle(chevron).transform).toBe('matrix(-1, 0, 0, -1, 0, 0)');
  const rows = [...host.querySelectorAll('.people li')];
  expect(rows.map((li) => li.querySelector('.name').textContent)).toEqual(['tin-lantern-owl', 'quiet-amber-fox', 'wren']);
  expect(rows.map((li) => li.querySelector('.what').textContent)).toEqual(['tracking', 'connecting…', 'looking around']);
  expect(rows.map((li) => !!li.querySelector('.tag'))).toEqual([false, false, true]);
  expect(rows.map((li) => !!li.querySelector('button'))).toEqual([true, true, false]);   // a guest has no ⋯ while guests are allowed
  expect(swatched(rows[0].querySelector('.name'), 'tin-lantern-owl')).toBe(true);

  room.close();   // the fold is remembered while the room lasts, not after
  expect(room.peopleOpen).toBe(false);
});

test('a guest\'s ⋯ appears once guests are off, with only Kick, which kicks them', async () => {
  const room = await mount('host', 0);
  room.room = { ...room.room, allowGuests: true };
  room.watchers = [watcher('p1', 'tin-lantern-owl'), watcher('g1', 'wren', { guest: true })];
  room.peopleOpen = true;
  const removed = vi.spyOn(room, 'remove').mockImplementation(() => {});
  await nextTick();
  const guestRow = () => [...host.querySelectorAll('.people li')][1];
  expect(guestRow().querySelector('button')).toBe(null);   // they'd only come back as a new guest

  room.room = { ...room.room, allowGuests: false };
  await nextTick();
  const trigger = guestRow().querySelector('button.dropdown-trigger');
  expect(trigger.title).toBe('More for wren');
  trigger.click();
  await nextTick();
  const items = [...guestRow().querySelectorAll('.dropdown-content button')]
    .filter((b) => b !== trigger).map((b) => b.textContent.trim());
  expect(items).toEqual(['Kick']);
  [...guestRow().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Kick').click();
  expect(removed).toHaveBeenCalledWith('g1');
});

test('a member\'s ⋯ has Mute, then Unmute; they\'re tagged muted, and their messages say only you and they see them', async () => {
  const room = await mount('host', 0);
  room.watchers = [watcher('p1', 'tin-lantern-owl')];
  room.peopleOpen = true;
  room.chat = [row(1, { sub: 'u_p1', muted: true }), row(2, { sub: 'u_p1' })];
  const mute = vi.spyOn(room, 'mute').mockImplementation(() => {});
  await nextTick();
  const li = () => host.querySelector('.people li');
  const item = (text) => [...li().querySelectorAll('.dropdown-content button')].find((b) => b.textContent.trim() === text);
  // Vue skips a click in the same millisecond as the menu opened (a person is never that fast).
  const open = async () => { li().querySelector('button.dropdown-trigger').click(); await nextTick(); await new Promise((r) => setTimeout(r, 2)); };
  await open();
  expect(item('Mute – for everyone but you').title).toBe('Their messages stop reaching anyone else. They aren\'t told.');
  item('Mute – for everyone but you').click();
  expect(mute).toHaveBeenCalledWith('u_p1', true);
  expect(li().querySelector('.tag')).toBe(null);

  room.muted = ['u_p1'];
  await nextTick();
  expect(li().querySelector('.tag').textContent).toBe('muted');
  await open();
  expect(item('Mute – for everyone but you')).toBe(undefined);
  item('Unmute').click();
  expect(mute).toHaveBeenLastCalledWith('u_p1', false);
  const marks = [...host.querySelectorAll('.list .message')].map((m) => m.querySelector('.muted')?.textContent ?? null);
  expect(marks).toEqual(['Muted: only you and they see this', null]);
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

test('the room menu has no End room: that\'s on the SOCIAL tab', async () => {
  await mount('host', 0);
  host.querySelector('.room-menu .dropdown-trigger').click();
  await vi.waitFor(() => expect(host.querySelector('.dropdown-content')).not.toBe(null));
  expect([...host.querySelectorAll('.dropdown-content button')].map((b) => b.textContent)).toEqual(['Copy link', 'Edit welcome', 'Settings and stats']);
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

test('once a report of someone goes, Report is gone from their messages and stays on other people\'s; focus goes to the messages', async () => {
  const room = await mount('watch', 0);
  useSocialStore().claims = claims({});
  room._connection = { send: () => true, close() {} };   // the room's socket, taking the report
  room.chat = [row(0), row(1), row(2, { sub: 'u_0', name: 'name-0' })];
  await nextTick();
  expect(reports()).toEqual(['Report message from name-0', 'Report message from name-1', 'Report message from name-0']);
  host.querySelector('button.report').click();
  await nextTick();
  document.querySelector('[role=dialog] input[value=spam]').click();
  await nextTick();
  [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === 'Report').click();
  await nextTick();
  await nextTick();
  expect(room.reported).toEqual(['u_0']);
  expect(reports()).toEqual(['Report message from name-1']);
  expect(document.activeElement).toBe(host.querySelector('[role=log]'));
});

test('the report dialog, sent: "Reported" in the status line that was there from the start, then done after 4 s; unmounted sooner, its timer goes with it', async () => {
  await createTestApp();
  const room = useRoomStore();
  useSocialStore().claims = claims({});
  vi.spyOn(room, 'report').mockReturnValue(true);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const done = vi.fn();
  const props = { name: 'wren', sub: 'u_2', onDone: done };   // (a variable: the lint takes `name` in createApp's second argument for a component's)
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(ReportDialog, props).use(getActivePinia());
  app.mount(host);
  await nextTick();
  const status = document.querySelector('p.reported[role=status]');
  expect(status.textContent).toBe('');   // in the page before anything is said

  document.querySelector('[role=dialog] input[value=spam]').click();
  await nextTick();
  [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === 'Report').click();
  await nextTick();
  expect(room.report).toHaveBeenCalledWith({ sub: 'u_2', messageId: null, reason: 'spam' });
  expect(document.querySelector('[role=dialog]')).toBe(null);
  expect(document.querySelector('p.reported[role=status]')).toBe(status);   // the same live region, now with words
  expect(status.textContent).toBe('Reported. Thank you.');
  vi.advanceTimersByTime(3999);
  expect(done).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(done).toHaveBeenCalledOnce();

  app.unmount();   // again, unmounted while "Reported" shows
  host.remove();
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(ReportDialog, props).use(getActivePinia());
  app.mount(host);
  await nextTick();
  document.querySelector('[role=dialog] input[value=spam]').click();
  await nextTick();
  [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === 'Report').click();
  await nextTick();
  expect(vi.getTimerCount()).toBe(1);
  app.unmount();
  app = null;
  expect(vi.getTimerCount()).toBe(0);
});

test('Report again on the same message while "Reported" shows opens the dialog again', async () => {
  const room = await mount('watch', 1);
  useSocialStore().claims = claims({});
  await nextTick();
  vi.spyOn(room, 'report').mockReturnValue(true);
  for (let i = 0; i < 2; i++) {
    host.querySelector('button.report').click();
    await nextTick();
    expect(document.querySelector('[role=dialog] h3').textContent).toBe('Report name-0?');
    document.querySelector('[role=dialog] input[value=other]').click();
    await nextTick();
    [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === 'Report').click();
    await nextTick();
    expect(document.querySelector('[role=dialog]')).toBe(null);
    expect(document.querySelector('p.reported').textContent).toBe('Reported. Thank you.');
  }
  expect(room.report).toHaveBeenCalledTimes(2);
});

// Report room: a confirmed watcher's, under Exit, until they've reported the room.
const reportRoomButton = () => [...host.querySelectorAll('header button')].find((b) => b.textContent === 'Report' && b.getAttribute('aria-label') === 'Report room');

test('a confirmed watcher has Report room under Exit; the host, a guest and an unconfirmed member don\'t', async () => {
  const room = await mount('watch', 0);
  const social = useSocialStore();
  social.claims = claims({});
  await nextTick();
  expect(reportRoomButton()).toBeTruthy();
  expect(reportRoomButton().previousElementSibling).toBe(host.querySelector('button.exit'));
  for (const fields of [{ guest: true, verified: false }, { verified: false }]) {
    social.claims = claims(fields);
    await nextTick();
    expect(reportRoomButton()).toBeUndefined();
  }
  social.claims = claims({});
  room.reported = ['*room'];   // reported already
  await nextTick();
  expect(reportRoomButton()).toBeUndefined();
  room.reported = [];
  room.room = { ...room.room, hostSub: 'u_me' };   // your own room, watched from a second tab
  await nextTick();
  expect(reportRoomButton()).toBeUndefined();
  room.room = { ...room.room, hostSub: 'u_9' };
  room.role = 'host';
  await nextTick();
  expect(reportRoomButton()).toBeUndefined();
});

test('Report room asks "Report this room?" with the inside sub, and Report sends reportRoom with the reason', async () => {
  const room = await mount('watch', 0);
  useSocialStore().claims = claims({});
  await nextTick();
  const reportRoom = vi.spyOn(room, 'reportRoom').mockResolvedValue(true);
  const trigger = reportRoomButton();
  trigger.click();
  await nextTick();
  const dialog = document.querySelector('[role=dialog]');
  expect(dialog.querySelector('h3').textContent).toBe('Report this room?');
  expect(dialog.querySelector('p.sub').textContent).toBe('Phosphor\'s moderators see the room\'s last lobby pictures and a picture of what you see now.');
  dialog.querySelector('input[value=sexual]').click();
  await nextTick();
  [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Report').click();
  await vi.waitFor(() => expect(document.querySelector('p.reported').textContent).toBe('Reported. Thank you.'));
  expect(reportRoom).toHaveBeenCalledWith('sexual');
  expect(document.querySelector('[role=dialog]')).toBe(null);
});

test('while Report room makes its picture, the dialog\'s buttons are off and Cancel, Escape and the backdrop wait', async () => {
  const room = await mount('watch', 0);
  useSocialStore().claims = claims({});
  await nextTick();
  let finish;
  vi.spyOn(room, 'reportRoom').mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  reportRoomButton().click();
  await nextTick();
  const dialog = document.querySelector('[role=dialog]');
  dialog.querySelector('input[value=spam]').click();
  await nextTick();
  const button = (label) => [...dialog.querySelectorAll('button')].find((b) => b.textContent === label);
  button('Report').click();
  await nextTick();
  expect(button('Report')).toBeUndefined();   // it says it's busy
  expect([button('Reporting…').disabled, button('Cancel').disabled]).toEqual([true, true]);
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.querySelector('.modal-backdrop').click();
  await nextTick();
  expect(document.querySelector('[role=dialog]')).toBe(dialog);
  finish(true);
  await vi.waitFor(() => expect(document.querySelector('p.reported').textContent).toBe('Reported. Thank you.'));
});
