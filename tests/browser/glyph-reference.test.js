// The reference font (IBM VGA): the inks and masks Best match and By shape measure glyphs by, the same
// whatever the display font is.
import { test, expect, afterEach } from 'vitest';
import { createTestApp } from '../support/app.js';
import { DISPLAY_FONTS, drawGlyph, setDisplayFont } from '@/lib/displayFonts';
import { loadReferenceFont, rasterizeCoverage, referenceInk, referenceMask } from '@/lib/GlyphCoverage';

afterEach(() => setDisplayFont(DISPLAY_FONTS[0].id));

// First in the file: the module's reference font hasn't loaded yet.
test('before the reference font has loaded nothing is cached', async () => {
  await createTestApp();
  expect(referenceMask('#')).not.toBe(referenceMask('#'));
  expect(referenceInk('#')).not.toBe(referenceInk('#'));
  await loadReferenceFont();
  expect(referenceMask('#')).toBe(referenceMask('#'));
  expect(referenceInk('#')).toBe(referenceInk('#'));
});

const vga = DISPLAY_FONTS.find((font) => font.id === 'vga');
const vgaInk = (char) => {
  const data = drawGlyph(char, 8, 16, 1, '#fff', false, vga);
  let top = 0, bottom = 0;
  for (let i = 0; i < 128; i++) {
    if (data[i * 4 + 3] > 127) {
      if (i < 64) top++;
      else bottom++;
    }
  }
  return [top / 64, bottom / 64];
};

test('reference inks and masks are measured in IBM VGA whatever the display font', async () => {
  await createTestApp();
  await loadReferenceFont();
  // Glyphs first measured with a font that isn't VGA showing, so a cache from before can't answer.
  await setDisplayFont('unifont');
  const unifontInk = rasterizeCoverage('%');
  expect(referenceInk('%')).toEqual(vgaInk('%'));
  const a = [referenceInk('&'), [...referenceMask('A')]];
  await setDisplayFont('jetbrains');
  expect(referenceInk('&')).toEqual(vgaInk('&'));
  expect(referenceInk('@')).toEqual(vgaInk('@'));
  expect([referenceInk('&'), [...referenceMask('A')]]).toEqual(a);
  // The display font measures differently here, so measuring in it would show.
  expect(unifontInk).not.toEqual(vgaInk('%'));
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
