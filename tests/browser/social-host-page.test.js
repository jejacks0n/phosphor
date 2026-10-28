// The host's page (HostRoomPage.vue) with the room store as hosting leaves it: how long it's been live,
// the session's five numbers, Copy link, Room settings and their facts, End room (which asks first),
// and one status region that's always there.
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
  vi.useRealTimers();
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

test('settings are the welcome, guests and most watchers; listed or link only and the password are facts', async () => {
  await mount({ hasPassword: true, room: { name: 'just us', welcome: 'hi', public: false, allowGuests: true, max: 12, count: 0 } });
  expect([...host.querySelectorAll('input, textarea')].map((el) => el.type)).toEqual(['textarea', 'checkbox', 'number']);
  expect(host.textContent).toContain('Set when the room started');
  expect(host.textContent).toContain('Only with the link');
  expect(host.textContent).toContain('Password set');
  expect(host.textContent).not.toContain('Listed in the lobby');
});

test('a listed room says so', async () => {
  await mount();
  expect(host.textContent).toContain('Listed in the lobby');
  expect(host.textContent).not.toContain('Password set');
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
