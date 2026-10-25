// The fonts the art can be drawn in: Phosphor's own, and the current one an id picks.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { DISPLAY_FONTS, DISPLAY_FONT, displayFontCss, setDisplayFont } from '../../src/lib/displayFonts.js';

test('Display fonts: JetBrains Mono first (the default), the 8x16 fonts at 16px with no leading, an unknown id picks the default', async () => {
  assert.deepEqual(DISPLAY_FONTS.map(f => f.id), ['jetbrains', 'vga', 'unscii', 'unifont']);
  assert.equal(displayFontCss(), '17px "JetBrains Mono", monospace');
  for (const font of DISPLAY_FONTS.slice(1)) assert.deepEqual([font.size, font.lineHeight], [16, 1], font.id);
  assert.match(DISPLAY_FONTS[1].family, /^"IBM VGA 8x16", "Phosphor Unscii"/); // VGA, then Unscii on the same grid
  await setDisplayFont('vga');
  assert.equal(DISPLAY_FONT.name, 'IBM VGA');
  assert.equal(displayFontCss(), '16px "IBM VGA 8x16", "Phosphor Unscii", monospace');
  await setDisplayFont('gone');
  assert.equal(DISPLAY_FONT.id, 'jetbrains');
});
