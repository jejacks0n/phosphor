// The host's page (HostRoomPage.vue) with the room store as hosting leaves it: how long it's been live,
// the session's five numbers, Copy link, Room settings and their facts, End room (which asks first),
// who came by, and one status region that's always there.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { createTestApp } from '../support/app.js';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { nameColor, nameGlyph } from '@/social/names';
import { clock } from '@/social/chat';
import HostRoomPage from '@/components/social/HostRoomPage.vue';

const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
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

const tile = (label) => {
  const dt = [...host.querySelectorAll('dt')].find((el) => el.textContent === label);
  return dt?.parentElement.querySelector('dd').textContent;
};
const person = (sub, fields) => ({ sub, name: sub, guest: false, since: null, total: 0, left: null, removed: null, said: 0, ...fields });

test('only connected watchers count as Here now; who they are is in the chat panel, not here', async () => {
  await mount({ watchers: [watcher('p1', 'tin-lantern-owl'), watcher('p2', 'quiet-amber-fox', { connected: false })] });
  expect(tile('Here now')).toBe('1');
  expect(host.querySelector('li')).toBe(null);
});

test('Live for counts up from going live, as H:MM:SS', async () => {
  const { room } = await mount({ session: { liveSince: Date.now() - 3_723_000, most: 0, messages: 0, people: [] } });
  expect(host.querySelector('header').textContent).toContain('Live for 1:02:03');
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'], now: room.session.liveSince + 3_723_000 });
  app.unmount();   // a fresh page, its timer on the fake clock
  app = createApp(HostRoomPage).use(getActivePinia());
  app.mount(host);
  await vi.advanceTimersByTimeAsync(1000);
  expect(host.querySelector('header').textContent).toContain('Live for 1:02:04');
});

test('no Live for until the room is live', async () => {
  await mount({ status: 'connecting' });
  expect(host.querySelector('header').textContent).not.toContain('Live for');
});

test('the five numbers are the session\'s', async () => {
  await mount({
    watchers: [watcher('p1', 'a'), watcher('p2', 'b')],
    session: {
      liveSince: Date.now(), most: 5, messages: 7,
      people: [person('u_p1'), person('u_p2'), person('u_p3', { removed: 1 })],
    },
  });
  const numbers = ['Here now', 'Most at once', 'Came by', 'Messages', 'Removed'];
  expect(numbers.map((label) => [label, tile(label)])).toEqual([
    ['Here now', '2'], ['Most at once', '5'], ['Came by', '3'], ['Messages', '7'], ['Removed', '1'],
  ]);
});

test('settings are the welcome, guests and max watchers; listed or link only and the password are facts', async () => {
  await mount({ hasPassword: true, room: { name: 'just us', welcome: 'hi', public: false, allowGuests: true, max: 12, count: 0 } });
  expect([...host.querySelectorAll('input, textarea')].map((el) => el.type)).toEqual(['textarea', 'checkbox', 'number']);
  expect(host.textContent).toContain('Set when the room started');
  expect(host.textContent).toContain('Only with the link');
  expect(host.textContent).toContain('Password set');
  expect(host.textContent).not.toContain('Listed in the lobby');
});

test('turning off Allow guests offers to kick the guests here too, unticked; saved ticked, each is removed', async () => {
  const { room } = await mount({ watchers: [watcher('p1', 'bob'), watcher('g1', 'wren', { guest: true }), watcher('g2', 'fox', { guest: true, connected: false })] });
  const changed = vi.spyOn(room, 'changeSettings').mockImplementation(() => {});
  const removed = vi.spyOn(room, 'remove').mockImplementation(() => {});
  const label = (text) => [...host.querySelectorAll('label')].find((l) => l.textContent.trim() === text);
  const box = label('Allow guests').querySelector('input');
  const kick = () => label('Kick the 2 guests here too')?.querySelector('input')
    ?? label('Kick the guest here too')?.querySelector('input') ?? null;
  expect(kick()).toBe(null);

  box.click();
  await nextTick();
  expect(kick().checked).toBe(false);   // turning guests off alone kicks nobody
  room.watchers = [watcher('p1', 'bob'), watcher('g1', 'wren', { guest: true })];
  await nextTick();
  expect(label('Kick the guest here too')).toBeTruthy();
  room.watchers = [watcher('p1', 'bob'), watcher('g1', 'wren', { guest: true }), watcher('g2', 'fox', { guest: true })];
  await nextTick();

  // Saved unticked: guests off, nobody removed.
  host.querySelector('form button[type=submit]').click();
  await nextTick();
  expect(changed).toHaveBeenLastCalledWith({ welcome: '', allowGuests: false, max: 12 });
  expect(removed).not.toHaveBeenCalled();

  // Saved ticked: each guest is removed, the members stay, and the box is unticked again.
  kick().click();
  await nextTick();
  host.querySelector('form button[type=submit]').click();
  await nextTick();
  expect(removed.mock.calls).toEqual([['g1'], ['g2']]);
  expect(kick().checked).toBe(false);

  // Allowed again, there's nothing to choose.
  box.click();
  await nextTick();
  expect(kick()).toBe(null);
});

test('a listed room says so', async () => {
  await mount();
  expect(host.textContent).toContain('Listed in the lobby');
  expect(host.textContent).not.toContain('Password set');
  expect(host.textContent).not.toContain('No password');
});

test('End room asks first: Cancel keeps the room, End room ends it', async () => {
  const { room } = await mount();
  const end = vi.spyOn(room, 'endRoom').mockImplementation(() => {});
  button('End room').click();
  await nextTick();
  const ask = document.querySelector('[role=dialog]');
  expect(ask.textContent).toContain('End the room?');
  expect(end).not.toHaveBeenCalled();
  [...ask.querySelectorAll('button')].find((b) => b.textContent === 'Cancel').click();
  await nextTick();
  expect(document.querySelector('[role=dialog]')).toBe(null);
  expect(end).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(button('End room'));

  button('End room').click();
  await nextTick();
  [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === 'End room').click();
  expect(end).toHaveBeenCalledTimes(1);
});

test('there is no art preview', async () => {
  await mount();
  expect(host.querySelector('.preview, canvas, [aria-label="The room\'s art"]')).toBe(null);
});

test('the welcome changed from elsewhere replaces an untouched draft, and leaves what\'s half-typed', async () => {
  const { room } = await mount({ room: { name: 'neon harbor', welcome: 'one', public: true, allowGuests: true, max: 12, count: 0 } });
  const welcome = () => host.querySelector('textarea');
  expect(welcome().value).toBe('one');
  room.room = { ...room.room, welcome: 'two' };
  await nextTick();
  expect(welcome().value).toBe('two');

  welcome().value = 'half typed';
  welcome().dispatchEvent(new Event('input'));
  room.room = { ...room.room, welcome: 'three' };
  await nextTick();
  expect(welcome().value).toBe('half typed');
  room.room = { ...room.room, welcome: 'four' };   // and the next change still doesn't take it
  await nextTick();
  expect(welcome().value).toBe('half typed');
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

const at = (h, m) => new Date(2026, 9, 27, h, m).getTime();
const NOW = at(10, 0);
const rows = () => [...host.querySelectorAll('.came-by tbody tr')];
const cells = (tr) => [...tr.cells].map((td) => td.textContent.replace(/\s+/g, ' ').trim());

test('who came by: a table, a row each, newest last, with time in the room, here, left or removed, and messages', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  await mount({
    session: {
      liveSince: at(8, 0), most: 3, messages: 9,
      people: [
        person('u_a', { name: 'tin-lantern-owl', since: NOW - 98 * 60_000, said: 4 }),
        person('u_b', { name: 'quiet-amber-fox', total: 54 * 60_000, left: at(8, 55), said: 1 }),
        person('u_c', { name: 'loud-teal-wren', total: 20 * 60_000, left: at(9, 30), removed: at(9, 10), said: 0 }),
        person('u_d', { name: 'guest-visitor', guest: true, since: NOW - 30_000, said: 2 }),
      ],
    },
  });
  expect([...host.querySelectorAll('.came-by th')].map((th) => th.textContent)).toEqual(['Name', 'Time', 'Status', 'Messages']);
  const text = rows().map(cells);
  expect(text).toHaveLength(4);
  expect(text[0]).toEqual(['tin-lantern-owl', '1h 38m', 'here', '4']);
  expect(text[1]).toEqual(['quiet-amber-fox', '54m', `left ${clock.format(at(8, 55))}`, '1']);
  expect(text[2]).toEqual(['loud-teal-wren', '20m', `removed ${clock.format(at(9, 10))}`, '0']);   // removed wins over left
  expect(text[3]).toEqual(['guest-visitor guest', 'under a minute', 'here', '2']);
  const name = rows()[0].querySelector('.name');   // in the text color, after its cell
  expect(name.style.color).toBe('');
  expect(name.querySelector('.cell').style.backgroundColor).toBe(rgb(nameColor('tin-lantern-owl')));
  expect(name.querySelector('.cell').dataset.glyph).toBe(nameGlyph('tin-lantern-owl'));
});

test('who came by: the time in the room moves with the page\'s clock', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  await mount({ session: { liveSince: at(8, 0), most: 1, messages: 0, people: [person('u_a', { since: NOW - 59 * 60_000 })] } });
  expect(rows()[0].textContent).toContain('59m');
  Date.now.mockReturnValue(NOW + 60_000);
  await vi.waitFor(() => expect(rows()[0].textContent).toContain('1h 0m'), { timeout: 2500 });
});

test('who came by is always there: before anyone has, it says nobody has stopped by yet', async () => {
  const { room } = await mount();
  expect(host.querySelector('.came-by').textContent).toContain('Nobody has stopped by yet.');
  expect(rows()).toEqual([]);
  room.session.people.push(person('u_a', { since: NOW }));
  await nextTick();
  expect(rows()).toHaveLength(1);
  expect(host.querySelector('.came-by').textContent).not.toContain('Nobody');
});

test('the lobby picture with room settings under it on the left, who came by on the right, at least as tall as they are', async () => {
  await mount();
  host.style.width = '800px';
  await nextTick();
  const [picture, settings, cameBy] = ['.lobby-picture', '.settings', '.came-by'].map((s) => host.querySelector(s).getBoundingClientRect());
  expect(settings.left).toBe(picture.left);
  expect(settings.top).toBeGreaterThan(picture.bottom);
  expect(cameBy.left).toBeGreaterThan(Math.max(picture.right, settings.right));
  expect(cameBy.top).toBe(picture.top);
  expect(cameBy.bottom).toBe(settings.bottom);   // stretched to the left column: it grows past it, never shrinks under it
});

test('who came by: in a narrow column the times, the status and the count stay on one line; a long name is cut short', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  await mount({ session: { liveSince: at(8, 0), most: 1, messages: 0, people: [person('u_a', { name: 'a-very-long-name-for-anybody-at-all', total: 54 * 60_000, left: at(9, 27), said: 12 })] } });
  host.style.width = '400px';
  await nextTick();
  const [name, ...rest] = rows()[0].cells;
  const line = name.getBoundingClientRect().height;
  for (const td of rest) expect(td.getBoundingClientRect().height).toBe(line);
  const label = name.querySelector('.name');
  expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);   // cut short…
  expect(getComputedStyle(label).textOverflow).toBe('ellipsis');   // …with an ellipsis
});

test('past ten, "and N more" opens the rest in place', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  const people = Array.from({ length: 13 }, (_, i) => person(`u_${i}`, { name: `visitor-${i}`, since: NOW }));
  await mount({ session: { liveSince: NOW, most: 13, messages: 0, people } });
  expect(rows()).toHaveLength(10);
  expect(button('and 3 more')).toBeTruthy();
  button('and 3 more').click();
  await nextTick();
  expect(rows()).toHaveLength(13);
  expect(rows()[12].textContent).toContain('visitor-12');
  expect(button('and 3 more')).toBeUndefined();
});

test('ten people show no "and N more"', async () => {
  const people = Array.from({ length: 10 }, (_, i) => person(`u_${i}`, { since: Date.now() }));
  await mount({ session: { liveSince: Date.now(), most: 10, messages: 0, people } });
  expect(rows()).toHaveLength(10);
  expect(host.querySelector('.came-by button')).toBe(null);
});
