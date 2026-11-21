// GlyphSample: a library row's sample, drawn from the 12 glyphs' rows without loading the font.
import { test, expect } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import GlyphSample from '@/components/GlyphSample.vue';

const sampleOf = (height, lit = [[0, 0]]) => {
  const bytes = new Uint8Array(12 * height);
  for (const [glyph, row, bit] of lit.map(([g, r, b = 7]) => [g, r, b])) bytes[glyph * height + row] |= 1 << bit;
  return btoa(String.fromCharCode(...bytes));
};
const mount = async (props) => {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(GlyphSample, props) });
  app.mount(host);
  await nextTick();
  const canvas = host.querySelector('canvas');
  return { canvas, unmount: () => { app.unmount(); host.remove(); } };
};
const alphaAt = (canvas, x, y) => canvas.getContext('2d').getImageData(x, y, 1, 1).data[3];

test('draws a glyph\'s lit pixels in the text color, and doubles fonts under 12 px', async () => {
  const w = await mount({ sample: sampleOf(16), height: 16 });
  const c = w.canvas;
  expect(c.getAttribute('aria-hidden')).toBe('true');
  expect([c.width, c.height]).toEqual([96, 16]);
  expect(alphaAt(c, 0, 0)).toBe(255);
  expect(alphaAt(c, 1, 0)).toBe(0);
  expect(alphaAt(c, 0, 1)).toBe(0);
  w.unmount();

  // glyph 2, row 1, rightmost pixel -> x = 8 * 2 + 7; doubled: 2 px wide
  const d = await mount({ sample: sampleOf(8, [[2, 1, 0]]), height: 8 });
  const e = d.canvas;
  expect([e.width, e.height]).toEqual([192, 16]);
  expect(alphaAt(e, 2 * 23, 2)).toBe(255);
  expect(alphaAt(e, 2 * 23 + 1, 3)).toBe(255);
  expect(alphaAt(e, 2 * 22, 2)).toBe(0);
  expect(getComputedStyle(e).imageRendering).toBe('pixelated');
  d.unmount();
});
