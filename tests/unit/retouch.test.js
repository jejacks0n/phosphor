// Retouch's colors (lib/Retouch.js): one full pass of Dodge, Burn and Blur.
import { test, expect } from 'vitest';
import { averaged, burned, dodged, rangeWeight } from '@/lib/Retouch.js';

const GRAY = { r: 128, g: 128, b: 128 }, BLACK = { r: 0, g: 0, b: 0 }, WHITE = { r: 255, g: 255, b: 255 };

test('the range weighs a lightness: Shadows the dark, Highlights the light, Midtones neither end', () => {
  expect([0, 0.5, 1].map((l) => rangeWeight(l, 'shadows'))).toEqual([1, 0.5, 0]);
  expect([0, 0.5, 1].map((l) => rangeWeight(l, 'highlights'))).toEqual([0, 0.5, 1]);
  expect([0, 0.5, 1].map((l) => rangeWeight(l, 'midtones'))).toEqual([0, 1, 0]);
});

test('Dodge lightens and Burn darkens a midtone, keeping it gray; Midtones leaves black and white alone', () => {
  const light = dodged(GRAY, 'midtones'), dark = burned(GRAY, 'midtones');
  expect(light.r).toBeGreaterThan(180);
  expect(dark.r).toBeLessThan(70);
  expect([light.r, dark.r]).toEqual([light.b, dark.b]);
  expect(dodged(BLACK, 'midtones')).toEqual(BLACK);
  expect(burned(WHITE, 'midtones')).toEqual(WHITE);
  expect(dodged(BLACK, 'shadows')).toEqual({ r: 128, g: 128, b: 128 }); // halfway to white
  expect(burned(WHITE, 'highlights')).toEqual({ r: 128, g: 128, b: 128 });
});

test('Dodge keeps a color\'s hue: red gets lighter, not grayer', () => {
  const { r, g, b } = dodged({ r: 200, g: 0, b: 0 }, 'shadows');
  expect(r).toBeGreaterThan(200);
  expect(g).toBe(b);
  expect(r - g).toBeGreaterThan(40);
});

test('Blur evens colors out', () => {
  expect(averaged([BLACK, WHITE])).toEqual({ r: 128, g: 128, b: 128 });
  expect(averaged([{ r: 9, g: 0, b: 3 }, { r: 0, g: 0, b: 0 }, { r: 0, g: 3, b: 0 }])).toEqual({ r: 3, g: 1, b: 1 });
});
