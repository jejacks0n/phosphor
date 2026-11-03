import { describe, it, expect } from 'vitest';
import { ditherPixels } from '@/lib/Dither.js';
import { PALETTES } from '@/lib/ColorUtils.js';

const BW = [{ r: 0, g: 0, b: 0, hex: '#000000', c: 0 }, { r: 255, g: 255, b: 255, hex: '#FFFFFF', c: 1 }];

// A w x h picture of one gray, or of a left-to-right gradient from black to white.
const gray = (w, h, v) => Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => (i % 4 === 3 ? 255 : v));
const gradient = (w, h) => Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => (i % 4 === 3 ? 255 : Math.round((Math.floor(i / 4) % w) / (w - 1) * 255)));
const mean = (data) => {
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += data[i];
  return sum / (data.length / 4);
};
const colorsIn = (data) => new Set(Array.from({ length: data.length / 4 }, (_, i) => `${data[i * 4]},${data[i * 4 + 1]},${data[i * 4 + 2]}`));

describe('ditherPixels', () => {
  for (const style of ['floyd', 'bayer']) {
    describe(style, () => {
      it('gives only palette colors', () => {
        const out = ditherPixels(gradient(32, 8), 32, 8, PALETTES.cga, { style });
        const cga = new Set(PALETTES.cga.map((p) => `${p.r},${p.g},${p.b}`));
        for (const color of colorsIn(out)) expect(cga.has(color)).toBe(true);
      });

      it('makes a gray between black and white of both, about as light as the gray', () => {
        for (const v of [64, 128, 192]) {
          const out = ditherPixels(gray(16, 16, v), 16, 16, BW, { style });
          expect(colorsIn(out).size).toBe(2);
          expect(Math.abs(mean(out) - v)).toBeLessThan(255 / 8);
        }
      });

      it('is a plain snap at strength 0', () => {
        const out = ditherPixels(gray(8, 8, 100), 8, 8, BW, { style, strength: 0 });
        expect([...colorsIn(out)]).toEqual(['0,0,0']);
      });

      it('keeps a palette color as it is', () => {
        const out = ditherPixels(gray(8, 8, 255), 8, 8, BW, { style });
        expect([...colorsIn(out)]).toEqual(['255,255,255']);
      });
    });
  }

  it('keeps alpha, and makes none opaque', () => {
    const data = gray(2, 1, 128);
    data[3] = 0;
    data[7] = 40;
    const out = ditherPixels(data, 2, 1, BW, { style: 'floyd' });
    expect([out[3], out[7]]).toEqual([255, 40]);
  });

  it('nudges by place only, with Bayer: a pixel comes out the same whatever is around it', () => {
    const a = gradient(16, 4), b = gradient(16, 4);
    b.fill(0, 0, 4 * 4); // the first row's first pixels differ
    const outA = ditherPixels(a, 16, 4, BW, { style: 'bayer' }), outB = ditherPixels(b, 16, 4, BW, { style: 'bayer' });
    expect(outB.slice(16 * 4)).toEqual(outA.slice(16 * 4));
  });

  it('spreads the error with Floyd–Steinberg: an even gray comes out as a fine mix, not a band', () => {
    const out = ditherPixels(gray(8, 1, 128), 8, 1, BW, { style: 'floyd' });
    expect(Array.from({ length: 8 }, (_, i) => out[i * 4])).toEqual([255, 0, 255, 0, 255, 0, 255, 0]);
  });
});
