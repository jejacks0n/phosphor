// The fonts the art can be drawn in: Phosphor's own, and the current one an id picks.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { DISPLAY_FONTS, DISPLAY_FONT, DEFAULT_FONT_ID, displayFontCss, setDisplayFont } from '../../src/lib/displayFonts.js';

test('Display fonts: IBM VGA first (the default), the 8x16 fonts at 16px with no leading, JetBrains Mono still offered, an unknown id picks the default', async () => {
  assert.deepEqual(DISPLAY_FONTS.map(f => f.id), ['vga', 'jetbrains', 'unscii', 'unifont']);
  assert.equal(DEFAULT_FONT_ID, 'vga');
  assert.equal(DISPLAY_FONT.id, 'vga'); // before anything sets it
  assert.equal(displayFontCss(), '16px "IBM VGA 8x16", "Phosphor Unscii", monospace');
  for (const font of DISPLAY_FONTS.filter(f => f.id !== 'jetbrains')) assert.deepEqual([font.size, font.lineHeight], [16, 1], font.id);
  assert.match(DISPLAY_FONTS[0].family, /^"IBM VGA 8x16", "Phosphor Unscii"/); // VGA, then Unscii on the same grid
  await setDisplayFont('jetbrains');
  assert.equal(displayFontCss(), '17px "JetBrains Mono", monospace');
  await setDisplayFont('gone');
  assert.equal(DISPLAY_FONT.id, 'vga');
});
