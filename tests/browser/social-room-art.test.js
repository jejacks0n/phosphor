// A room's art (RoomArt.vue): the host's view held to the grid however big its numbers, scrolled to
// the center while tracking, and a wheel, a key or a press (never its own scroll) is looking around.
// The host's box and its tag (the Track button) are in the host's name color, and the tag stays in
// sight, pointing to the box, when the box is scrolled out of view.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, h, reactive, nextTick } from 'vue';
import { createTestApp } from '../support/app.js';
import RoomArt from '@/components/social/RoomArt.vue';
import CellCanvas from '@/lib/CellCanvas';
import { nameColor, nameGlyph } from '@/social/names';

const COLS = 100, LINES = 50;
const black = { hex: '#000000', r: 0, g: 0, b: 0 }, white = { hex: '#ffffff', r: 255, g: 255, b: 255 };
const art = { cols: COLS, lines: LINES, font: { id: 'vga', size: 16 }, cells: Array.from({ length: COLS * LINES }, () => ({ char: 'A', fg: white, bg: black })) };

let app = null, host = null;
afterEach(() => {
  vi.restoreAllMocks();
  app?.unmount();
  host?.remove();
});

// RoomArt in a 200 x 100 px box; its look-arounds counted.
function mount(props) {
  const state = reactive({ art, hostView: null, tracking: true, host: 'ansi-fan', zoom: 1, ...props }), seen = { lookArounds: 0, tracks: 0, lookingAt: null };
  host = document.createElement('div');
  host.style.cssText = 'width: 200px; height: 100px';
  document.body.append(host);
  app = createApp({ render: () => h(RoomArt, { ...state, onLookAround: () => seen.lookArounds++, onTrack: () => seen.tracks++, onLookingAt: (middle) => { seen.lookingAt = middle; } }) });
  app.mount(host);
  return { state, seen, scroll: host.querySelector('.room-art'), box: host.querySelector('.host-view'), tag: () => host.querySelector('.host-tag') };
}

const frames = async (n = 3) => {
  for (let i = 0; i < n; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
};

test('a host\'s view past the grid is held to its last cell, and tracking scrolls there without looking around', async () => {
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

test('each new view of the host\'s is centered while tracking, and not once looking around', async () => {
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
  state.tracking = false;
  state.hostView = { col: 80, row: 40, cols: 10, rows: 4 };
  await nextTick();
  expect(scroll.scrollLeft + scroll.clientWidth / 2).toBe(15 * 8);
});

test('the middle of what\'s in view, in cells, is told as it changes (a room report\'s picture is centered there)', async () => {
  await createTestApp();
  const { scroll, box, seen } = mount({ hostView: { col: 40, row: 20, cols: 10, rows: 4 } });
  await expect.poll(() => box.style.width).toBe('80px');
  await frames();
  expect(seen.lookingAt).toEqual({ middleCol: 45, middleRow: 22 });   // centered on the host's view
  scroll.scrollLeft = 0;
  scroll.scrollTop = 0;
  await expect.poll(() => seen.lookingAt).toEqual({ middleCol: 100 / 8, middleRow: 50 / 16 });   // the 200 x 100 px box's middle
});

test('at a zoom of 0.5 the cells and the box are half size, and the box is centered', async () => {
  await createTestApp();
  const { state, scroll, box } = mount({ hostView: { col: 40, row: 20, cols: 10, rows: 4 } });
  await expect.poll(() => box.style.width).toBe('80px');   // 8 px cells until the zoom is
  state.zoom = 0.5;
  await expect.poll(() => box.style.width).toBe('40px');
  await frames();
  expect([box.style.left, box.style.top, box.style.height]).toEqual(['160px', '160px', '32px']);
  expect(scroll.querySelector('.sizer').style.width).toBe('400px');
  expect([scroll.scrollLeft + scroll.clientWidth / 2, scroll.scrollTop + scroll.clientHeight / 2]).toEqual([45 * 4, 22 * 8]);
});

test('a new zoom sizes its first window by the new zoom\'s cells, not the old one\'s', async () => {
  await createTestApp();
  const { state, box } = mount({ hostView: { col: 40, row: 20, cols: 10, rows: 4 } });
  await expect.poll(() => box.style.width).toBe('80px');
  await frames();
  const resize = vi.spyOn(CellCanvas.prototype, 'resize');
  state.zoom = 0.5;
  await expect.poll(() => box.style.width).toBe('40px');
  await frames();
  const windows = resize.mock.calls.map(([cols, rows]) => `${cols}x${rows}`);
  expect(new Set(windows).size).toBe(1);   // the window at 0.5 from the first pass
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

const smallArt = (cols, lines) => ({ ...art, cols, lines, cells: art.cells.slice(0, cols * lines) });
const middleOf = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

test('art smaller than the view sits in its middle, and the middle in cells is the art\'s', async () => {
  await createTestApp();
  const { scroll, seen } = mount({ art: smallArt(10, 3), hostView: { col: 0, row: 0, cols: 10, rows: 3 } });
  await expect.poll(() => host.querySelector('.sizer').style.width).toBe('80px');
  await frames();
  const [artX, artY] = middleOf(host.querySelector('.sizer')), [viewX, viewY] = middleOf(scroll);
  expect(Math.abs(artX - viewX)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(artY - viewY)).toBeLessThanOrEqual(0.5);
  expect([scroll.scrollLeft, scroll.scrollTop]).toEqual([0, 0]);
  await expect.poll(() => seen.lookingAt).toEqual({ middleCol: 5, middleRow: 1.5 });
});

test('art narrow and tall centers across and scrolls down from its first line; scrolled from the box, the tag stays in view', async () => {
  await createTestApp();
  const { scroll, tag, state } = mount({ art: smallArt(10, 50), hostView: { col: 0, row: 0, cols: 10, rows: 3 } });
  await expect.poll(() => host.querySelector('.sizer').style.width).toBe('80px');
  await frames();
  const sizer = host.querySelector('.sizer');
  expect(sizer.getBoundingClientRect().left - scroll.getBoundingClientRect().left).toBe(60);
  expect(scroll.scrollTop).toBe(0);   // the first line can be seen
  state.tracking = false;
  scroll.scrollTop = 400;
  await expect.poll(() => tag().textContent).toContain('↑');
  await frames();
  const [view, placed] = [scroll.getBoundingClientRect(), tag().getBoundingClientRect()];
  expect(placed.left).toBeGreaterThanOrEqual(view.left);   // inside the view, measured from where the art starts
  expect(placed.right).toBeLessThanOrEqual(view.left + scroll.clientWidth);
});

test('art bigger than the view starts at its corner: nothing past it to the left or above', async () => {
  await createTestApp();
  const { scroll, state } = mount({ hostView: { col: 0, row: 0, cols: 10, rows: 3 } });
  await expect.poll(() => host.querySelector('.sizer').style.width).toBe('800px');
  await frames();
  state.tracking = false;
  scroll.scrollLeft = scroll.scrollTop = 0;
  await frames();
  const sizer = host.querySelector('.sizer').getBoundingClientRect(), view = scroll.getBoundingClientRect();
  expect([sizer.left, sizer.top]).toEqual([view.left, view.top]);
  expect(scroll.scrollWidth).toBe(800);
});

test('the art is a region named for screen readers', async () => {
  await createTestApp();
  const { scroll } = mount();
  expect([scroll.getAttribute('role'), scroll.getAttribute('aria-label')]).toEqual(['region', 'The room\'s art']);
});

const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

test('the box and its tag are in the host\'s color, with a shadow so they show on any art', async () => {
  await createTestApp();
  const { box, tag } = mount({ hostView: { col: 40, row: 20, cols: 10, rows: 4 }, host: 'wren' });   // a tag that fits the 200 px
  await expect.poll(() => box.style.width).toBe('80px');
  await frames();
  const color = rgb(nameColor('wren'));
  expect(getComputedStyle(box).outlineColor).toBe(color);
  expect(getComputedStyle(box).boxShadow).not.toBe('none');
  expect(getComputedStyle(tag()).backgroundColor).toBe(color);   // tracking: filled
  expect(getComputedStyle(tag()).boxShadow).not.toBe('none');
  expect(tag().textContent).toContain('wren');
  expect(tag().querySelector('.cell').dataset.glyph).toBe(nameGlyph('wren'));   // the host's cell before the name, as everywhere
  const cell = tag().querySelector('.cell').getBoundingClientRect();
  const range = document.createRange();   // the name's own letters
  range.selectNodeContents([...tag().querySelector('.name').childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()));
  const text = range.getBoundingClientRect();
  expect(Math.abs((cell.top + cell.bottom) / 2 - (text.top + text.bottom) / 2)).toBeLessThan(1);   // level with the name
  // at the box's upper left
  const [b, t] = [box.getBoundingClientRect(), tag().getBoundingClientRect()];
  expect([t.left, t.top]).toEqual([b.left, b.top]);
});

test('the tag is the Track button: pressed while tracking, and pressing it while looking around tracks (not looking around)', async () => {
  await createTestApp();
  const { state, tag, seen } = mount({ hostView: { col: 40, row: 20, cols: 10, rows: 4 } });
  await expect.poll(() => tag()?.getAttribute('aria-pressed')).toBe('true');
  expect(tag().getAttribute('aria-label')).toBe('Track ansi-fan');
  state.tracking = false;
  await nextTick();
  expect(tag().getAttribute('aria-pressed')).toBe('false');
  expect(tag().textContent).toContain('Track');
  tag().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  tag().click();
  expect([seen.tracks, seen.lookArounds]).toEqual([1, 0]);
});

test('scrolled away from the box, the tag stays in sight at the edge nearest it, with an arrow toward it', async () => {
  await createTestApp();
  const { state, scroll, tag } = mount({ hostView: { col: 80, row: 40, cols: 10, rows: 4 }, tracking: false });
  await expect.poll(() => tag() !== null).toBe(true);
  scroll.scrollLeft = 0;
  scroll.scrollTop = 0;
  await frames();
  const [s, t] = [scroll.getBoundingClientRect(), tag().getBoundingClientRect()];
  expect(t.left).toBeGreaterThanOrEqual(s.left);
  expect(t.top).toBeGreaterThanOrEqual(s.top);
  expect(t.right).toBeLessThanOrEqual(s.left + scroll.clientWidth);
  expect(t.bottom).toBeLessThanOrEqual(s.top + scroll.clientHeight);
  expect(tag().textContent).toContain('\u2198');   // down and to the right
  state.hostView = { col: 0, row: 40, cols: 10, rows: 4 };
  await frames();
  expect(tag().textContent).toContain('\u2193');   // straight down
});

test('the tag is part of the box: it moves with it in the same frame, and holds to the corner in view when the box is bigger than the view', async () => {
  await createTestApp();
  const { state, box, tag, scroll } = mount({ hostView: { col: 40, row: 20, cols: 10, rows: 4 }, host: 'wren' });
  await expect.poll(() => box.style.width).toBe('80px');
  await frames();
  state.hostView = { col: 10, row: 30, cols: 10, rows: 4 };
  await nextTick();   // no frame between: the box and its tag move together
  let [b, t] = [box.getBoundingClientRect(), tag().getBoundingClientRect()];
  expect([t.left, t.top]).toEqual([b.left, b.top]);

  state.hostView = { col: 10, row: 10, cols: 60, rows: 30 };   // 480 x 480 px, in a 200 x 100 view
  await nextTick();
  const s = scroll.getBoundingClientRect();
  t = tag().getBoundingClientRect();
  expect([t.left, t.top]).toEqual([s.left, s.top]);
  expect(tag().textContent).not.toMatch(/[\u2190-\u2199]/);   // no arrow: the box is right here
});

test('boxed false draws no host\'s box or tag, and still scrolls to the view while tracking', async () => {
  await createTestApp();
  const { scroll, seen } = mount({ hostView: { col: 40, row: 40, cols: 10, rows: 4 }, boxed: false });
  await frames();
  expect(host.querySelector('.host-view')).toBeNull();
  expect(host.querySelector('.host-tag')).toBeNull();
  await expect.poll(() => scroll.scrollTop).toBeGreaterThan(0);
  expect(seen.lookArounds).toBe(0);
});
