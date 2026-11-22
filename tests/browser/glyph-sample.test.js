// GlyphSample: a library row's sample, drawn from the 12 glyphs' rows without loading the font.
import { test, expect } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import GlyphSample from '@/components/GlyphSample.vue';

const sampleOf = (height, lit = [[0, 0]]) => {
  const bytes = new Uint8Array(12 * height);
  for (const [glyph, row, bit = 7] of lit) bytes[glyph * height + row] |= 1 << bit;
  return btoa(String.fromCharCode(...bytes));
};
const mount = async (initial) => {
  const props = reactive(initial);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(GlyphSample, props) });
  app.mount(host);
  await nextTick();
  const canvas = host.querySelector('canvas');
  return { canvas, props, unmount: () => { app.unmount(); host.remove(); } };
};
const alphaAt = (canvas, x, y) => canvas.getContext('2d').getImageData(x, y, 1, 1).data[3];

test('draws a glyph\'s lit pixels in the text color, at the font\'s own size even under 12 px', async () => {
  const w = await mount({ sample: sampleOf(16), height: 16 });
  const c = w.canvas;
  expect(c.getAttribute('aria-hidden')).toBe('true');
  expect([c.width, c.height]).toEqual([96, 16]);
  expect(alphaAt(c, 0, 0)).toBe(255);
  expect(alphaAt(c, 1, 0)).toBe(0);
  expect(alphaAt(c, 0, 1)).toBe(0);
  w.unmount();

  // glyph 2, row 1, rightmost pixel -> x = 8 * 2 + 7, 1 px
  const d = await mount({ sample: sampleOf(8, [[2, 1, 0]]), height: 8 });
  const e = d.canvas;
  expect([e.width, e.height]).toEqual([96, 8]);
  expect(alphaAt(e, 23, 1)).toBe(255);
  expect(alphaAt(e, 22, 1)).toBe(0);
  expect(alphaAt(e, 23, 2)).toBe(0);
  expect(getComputedStyle(e).imageRendering).toBe('pixelated');
  d.unmount();
});

test('redraws when the sample and height change on a mounted instance', async () => {
  const w = await mount({ sample: sampleOf(16), height: 16 });
  expect(alphaAt(w.canvas, 0, 0)).toBe(255);
  w.props.sample = sampleOf(8, [[1, 3]]); // glyph 1, row 3, leftmost -> x = 8
  w.props.height = 8;
  await nextTick();
  expect([w.canvas.width, w.canvas.height]).toEqual([96, 8]);
  expect(alphaAt(w.canvas, 8, 3)).toBe(255);
  expect(alphaAt(w.canvas, 0, 0)).toBe(0);
  w.unmount();
});

test('draws width columns a glyph: width 7, height 8 is 84 × 8, and column 7 of glyph 0 is unlit', async () => {
  // glyph 0 has columns 0 and 7 set; a 7-wide font has no column 7, so glyph 1 starts there; glyph 2 column 0 is lit
  const w = await mount({ sample: sampleOf(8, [[0, 0, 7], [0, 0, 0], [2, 0, 7]]), height: 8, width: 7 });
  expect([w.canvas.width, w.canvas.height]).toEqual([84, 8]);
  expect(alphaAt(w.canvas, 0, 0)).toBe(255);
  expect(alphaAt(w.canvas, 7, 0)).toBe(0);
  expect(alphaAt(w.canvas, 14, 0)).toBe(255);
  w.unmount();
});
