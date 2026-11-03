// Levels, Posterize and Threshold in the color adjustments' JavaScript twin (PixelTransforms), which
// works out the colors cells keep, the chips and Bake: each at neutral changes nothing, and each does
// what its slider says.
import { test, expect } from 'vitest';
import { applyTransforms, transformsOn } from '../../src/lib/PixelTransforms.js';

const grays = (...values) => new Uint8ClampedArray(values.flatMap((v) => [v, v, v, 255]));
const reds = (data) => [...data].filter((_, i) => i % 4 === 0);
const run = (data, params) => { applyTransforms(data, params); return data; };

test('at neutral nothing changes, and nothing counts as on', () => {
  const data = grays(0, 1, 77, 128, 254, 255);
  const neutral = { levelsBlack: 0, levelsWhite: 255, levelsMid: 1, posterize: 1, threshold: 0 };
  expect([...run(data.slice(), neutral)]).toEqual([...data]);
  expect(transformsOn(neutral)).toBe(false);
  expect(transformsOn({})).toBe(false); // a project from before these were saved
  for (const on of [{ levelsBlack: 10 }, { levelsWhite: 250 }, { levelsMid: 1.2 }, { posterize: 4 }, { threshold: 1 }]) {
    expect(transformsOn(on), JSON.stringify(on)).toBe(true);
  }
});

test('Levels: the black and white points stretch to the ends, and the midtones bend', () => {
  expect(reds(run(grays(0, 50, 75, 150, 200, 255), { levelsBlack: 50, levelsWhite: 150 }))).toEqual([0, 0, 64, 255, 255, 255]);
  const [lifted] = reds(run(grays(128), { levelsMid: 2 }));
  const [deepened] = reds(run(grays(128), { levelsMid: 0.5 }));
  expect(lifted).toBe(Math.round((128 / 255) ** 0.5 * 255));
  expect(deepened).toBe(Math.round((128 / 255) ** 2 * 255));
  expect(reds(run(grays(0, 255), { levelsMid: 2 }))).toEqual([0, 255]); // the ends stay put
});

test('Posterize: each channel to its nearest of the steps', () => {
  expect(reds(run(grays(0, 60, 64, 128, 200, 255), { posterize: 2 }))).toEqual([0, 0, 0, 255, 255, 255]);
  expect(reds(run(grays(0, 60, 100, 128, 200, 255), { posterize: 3 }))).toEqual([0, 0, 128, 128, 255, 255]);
  const data = run(new Uint8ClampedArray([200, 30, 120, 255]), { posterize: 3 });
  expect([...data]).toEqual([255, 0, 128, 255]); // channels apart
});

test('Threshold: light at or above the level, dark under it, in the chosen colors', () => {
  expect(reds(run(grays(0, 127, 128, 255), { threshold: 128 }))).toEqual([0, 0, 255, 255]);
  const data = run(grays(40, 200), { threshold: 128, thresholdDark: '#331100', thresholdLight: '#ffaa00' });
  expect([...data]).toEqual([0x33, 0x11, 0x00, 255, 0xff, 0xaa, 0x00, 255]);
  // Brightness by how bright a color looks: pure green is light, pure blue dark.
  const colors = run(new Uint8ClampedArray([0, 255, 0, 255, 0, 0, 255, 255]), { threshold: 128 });
  expect([...colors]).toEqual([255, 255, 255, 255, 0, 0, 0, 255]);
});

test('they run after the other adjustments, Threshold last, and transparent pixels are left alone', () => {
  expect(reds(run(grays(100), { invert: 100, threshold: 128 }))).toEqual([255]);   // inverted to 155 first
  expect(reds(run(grays(100), { posterize: 2, threshold: 200 }))).toEqual([0]);    // posterized, then cut
  expect([...run(new Uint8ClampedArray([10, 20, 30, 0]), { threshold: 1, posterize: 2 })]).toEqual([10, 20, 30, 0]);
});
