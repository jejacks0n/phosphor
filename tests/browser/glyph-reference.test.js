// The reference font (IBM VGA): the inks and masks Best match and By shape measure glyphs by, the same
// whatever the display font is.
import { test, expect, afterEach } from 'vitest';
import { createTestApp } from '../support/app.js';
import { DISPLAY_FONTS, setDisplayFont } from '@/lib/displayFonts';
import { loadReferenceFont, referenceInk, referenceMask } from '@/lib/GlyphCoverage';

afterEach(() => setDisplayFont(DISPLAY_FONTS[0].id));

test('reference inks and masks are the same whatever the display font', async () => {
  await createTestApp();
  await loadReferenceFont();
  await setDisplayFont('jetbrains');
  const a = [referenceInk('%'), [...referenceMask('A')]];
  await setDisplayFont('unifont');
  const b = [referenceInk('%'), [...referenceMask('A')]];
  expect(b).toEqual(a);
  expect(loadReferenceFont()).toBe(loadReferenceFont());
});

test('block elements are exact', () => {
  expect(referenceInk('▄')).toEqual([0, 1]);
  expect([...referenceMask('▀')]).toEqual([...Array(16).fill(1), ...Array(16).fill(0)]);
  expect([...referenceMask('▒')]).toEqual(Array(32).fill(0.5));
  expect([...referenceMask('░')]).toEqual(Array(32).fill(0.25));
  expect([...referenceMask('▗')].slice(16, 20)).toEqual([0, 0, 1, 1]);
  expect([...referenceMask('▗')].slice(12, 16)).toEqual([0, 0, 0, 0]);
  expect([...referenceMask('▌', 2, 2)]).toEqual([1, 0, 1, 0]);
});

test('a space has no ink; an @ has some in both halves; a mask is fractional', async () => {
  await createTestApp();
  await loadReferenceFont();
  expect(referenceInk(' ')).toEqual([0, 0]);
  const [top, bottom] = referenceInk('@');
  expect(top).toBeGreaterThan(0.1);
  expect(bottom).toBeGreaterThan(0.1);
  const mask = referenceMask('@');
  expect(mask).toHaveLength(32);
  expect(Math.max(...mask)).toBeGreaterThan(0.5);
  expect(mask.some((v) => v > 0 && v < 1)).toBe(true);
  expect(referenceMask('@')).toBe(mask); // cached
});
