// A room's art (RoomArt.vue): the host's view held to the grid however big its numbers, scrolled to
// the center while following, and a wheel, a key or a press (never its own scroll) is looking around.
import { test, expect, afterEach } from 'vitest';
import { createApp, h, reactive, nextTick } from 'vue';
import { createTestApp } from '../support/app.js';
import RoomArt from '@/components/social/RoomArt.vue';

const COLS = 100, LINES = 50;
const black = { hex: '#000000', r: 0, g: 0, b: 0 }, white = { hex: '#ffffff', r: 255, g: 255, b: 255 };
const art = { cols: COLS, lines: LINES, font: { id: 'vga', size: 16 }, cells: Array.from({ length: COLS * LINES }, () => ({ char: 'A', fg: white, bg: black })) };

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
});

// RoomArt in a 200 x 100 px box; its look-arounds counted.
function mount(props) {
  const state = reactive({ art, hostView: null, following: true, ...props }), seen = { lookArounds: 0 };
  host = document.createElement('div');
  host.style.cssText = 'width: 200px; height: 100px';
  document.body.append(host);
  app = createApp({ render: () => h(RoomArt, { ...state, onLookAround: () => seen.lookArounds++ }) });
  app.mount(host);
  return { state, seen, scroll: host.querySelector('.room-art'), box: host.querySelector('.host-view') };
}

const frames = async (n = 3) => {
  for (let i = 0; i < n; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
};

test('a host\'s view past the grid is held to its last cell, and following scrolls there without looking around', async () => {
  await createTestApp();
  const { scroll, box, seen } = mount({ hostView: { col: 1e300, row: Number.MAX_SAFE_INTEGER, cols: 1e300, rows: 1e300 } });
  // The VGA font at 16 px, once it has loaded (measured in a fallback until then): 8 x 16 cells. The
  // box is the last cell, and the view is scrolled to the end.
  await expect.poll(() => box.style.width).toBe('8px');
  await frames();
  expect([box.style.left, box.style.top, box.style.width, box.style.height]).toEqual(['792px', '784px', '8px', '16px']);
  expect(scroll.scrollLeft).toBe(scroll.scrollWidth - scroll.clientWidth);
  expect(scroll.scrollTop).toBe(scroll.scrollHeight - scroll.clientHeight);
  expect(seen.lookArounds).toBe(0);
});

test('each new view of the host\'s is centered while following, and not once looking around', async () => {
  await createTestApp();
  const { state, scroll, box, seen } = mount({ hostView: { col: 40, row: 20, cols: 10, rows: 4 } });
  await expect.poll(() => box.style.width).toBe('80px'); // in the VGA font, loaded
  await frames();
  expect([scroll.scrollLeft + scroll.clientWidth / 2, scroll.scrollTop + scroll.clientHeight / 2]).toEqual([45 * 8, 22 * 16]);
  state.hostView = { col: 10, row: 10, cols: 10, rows: 4 };
  await nextTick();
  expect([scroll.scrollLeft + scroll.clientWidth / 2, scroll.scrollTop + scroll.clientHeight / 2]).toEqual([15 * 8, 12 * 16]);
  expect(seen.lookArounds).toBe(0);

  for (const event of [new WheelEvent('wheel', { deltaY: 40 }), new KeyboardEvent('keydown', { key: 'ArrowDown' }), new PointerEvent('pointerdown')]) scroll.dispatchEvent(event);
  expect(seen.lookArounds).toBe(3);
  state.following = false;
  state.hostView = { col: 80, row: 40, cols: 10, rows: 4 };
  await nextTick();
  expect(scroll.scrollLeft + scroll.clientWidth / 2).toBe(15 * 8);
});

test('only a key that scrolls is looking around: not Tab, and not a modifier on its own', async () => {
  await createTestApp();
  const { scroll, seen } = mount({ hostView: { col: 40, row: 20, cols: 10, rows: 4 } });
  for (const key of ['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'a']) scroll.dispatchEvent(new KeyboardEvent('keydown', { key }));
  expect(seen.lookArounds).toBe(0);
  const scrolling = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' '];
  for (const key of scrolling) scroll.dispatchEvent(new KeyboardEvent('keydown', { key }));
  expect(seen.lookArounds).toBe(scrolling.length);
});
