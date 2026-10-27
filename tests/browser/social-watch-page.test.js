// The watch page (WatchRoomPage.vue) with the room store in each status: the heading says how joining
// is going until the room's name comes, a status region that's always there says it too (for screen
// readers, shown only once the heading is the name), and old art is dimmed while waiting for the host.
import { test, expect, afterEach } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { createTestApp } from '../support/app.js';
import { useRoomStore } from '@/store/RoomStore';
import WatchRoomPage from '@/components/social/WatchRoomPage.vue';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
});

async function mount(state) {
  await createTestApp();
  const room = useRoomStore();
  Object.assign(room, { role: 'watch', id: 'abcdefghij', ...state });
  host = document.createElement('div');
  host.style.cssText = 'width: 600px; height: 400px';
  document.body.append(host);
  app = createApp(WatchRoomPage).use(getActivePinia());
  app.mount(host);
  await nextTick();
  return { room, heading: host.querySelector('h2'), region: host.querySelector('[role=status]') };
}

const shown = (el) => el.getBoundingClientRect().width > 1;

test('the heading and the status region say how joining is going, and the region follows the status', async () => {
  const { room, heading, region } = await mount({ status: 'joining' });
  expect([heading.textContent, region.textContent]).toEqual(['Joining…', 'Joining…']);
  expect(shown(region)).toBe(false);   // the heading says it

  room.status = 'connecting';
  await nextTick();
  expect([heading.textContent, region.textContent]).toEqual(['Joining…', 'Joining…']);
  Object.assign(room, { status: 'waiting', room: { name: '', welcome: '', host: 'ansi-fan' } });
  await nextTick();
  expect([heading.textContent, region.textContent]).toEqual(['Waiting for the host…', 'Waiting for the host…']);
  room.status = 'failed';
  await nextTick();
  expect([heading.textContent, region.textContent]).toEqual(['Couldn\'t reach this host', 'Couldn\'t reach this host']);

  Object.assign(room, { status: 'waiting', room: { name: 'neon harbor', welcome: '', host: 'ansi-fan' } });
  await nextTick();
  expect([heading.textContent, region.textContent]).toEqual(['neon harbor', 'Waiting for the host…']);
  expect(shown(region)).toBe(true);
  room.status = 'live';
  await nextTick();
  expect(region.textContent).toBe('');
  expect(host.querySelector('[role=status]')).toBe(region);   // the same region all along
});

test('the art is dimmed while waiting for the host, not while live', async () => {
  const white = { hex: '#ffffff', r: 255, g: 255, b: 255 };
  const art = { cols: 2, lines: 1, font: { id: 'vga', size: 16 }, cells: [{ char: 'A', fg: white, bg: white }, { char: 'B', fg: white, bg: white }] };
  const { room } = await mount({ status: 'live', room: { name: 'neon harbor', welcome: '', host: 'ansi-fan' }, art });
  const area = host.querySelector('div.art');
  expect(getComputedStyle(area).opacity).toBe('1');
  room.status = 'waiting';
  await nextTick();
  expect(getComputedStyle(area).opacity).toBe('0.5');
});

test('Following is a toggle: aria-pressed says whether it\'s on', async () => {
  const white = { hex: '#ffffff', r: 255, g: 255, b: 255 };
  const art = { cols: 1, lines: 1, font: null, cells: [{ char: 'A', fg: white, bg: white }] };
  const { room } = await mount({ status: 'live', room: { name: 'neon harbor', welcome: '', host: 'ansi-fan' }, art });
  const toggle = () => [...host.querySelectorAll('button')].find((b) => b.textContent.startsWith('Follow'));
  expect([toggle().textContent, toggle().getAttribute('aria-pressed')]).toEqual(['Following', 'true']);
  room.following = false;
  await nextTick();
  expect([toggle().textContent, toggle().getAttribute('aria-pressed')]).toEqual(['Follow ansi-fan', 'false']);
});
