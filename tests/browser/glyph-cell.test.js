// .glyph-cell (global.css): how the palette list, the F-key slots and the glyph grid draw a
// character. It's as wide as the character draws, from one column to two, so a two-column emoji or
// a symbol a fallback font draws wider shows whole; wider than that (﷽) is clipped at two.
import { test, expect } from 'vitest';
import { createTestApp } from '../support/app.js';
import '@/assets/global.css';

test('a glyph cell shows a character from one column to two wide, clipped beyond', async () => {
  await createTestApp();
  // Test fonts in the display font's family (tests/fixtures/fonts): 😀 exactly two columns, ﷽ 7.5.
  for (const [file, range] of [['color.ttf', 'U+1F600'], ['wide.ttf', 'U+FDFD']]) {
    document.fonts.add(await new FontFace('JetBrains Mono', `url(/tests/fixtures/fonts/${file})`, { unicodeRange: range }).load());
  }
  const cellOf = (char) => {
    const span = document.createElement('span');
    span.className = 'glyph-cell';
    span.textContent = char;
    document.body.append(span);
    return span;
  };
  const a = cellOf('A'), emoji = cellOf('😀'), wide = cellOf('﷽');
  const column = a.getBoundingClientRect().width;
  expect(column).toBeGreaterThan(5);
  expect(emoji.getBoundingClientRect().width).toBeCloseTo(2 * column, 0);
  expect(emoji.scrollWidth).toBeLessThanOrEqual(emoji.clientWidth); // all of it shows
  expect(wide.getBoundingClientRect().width).toBeCloseTo(2 * column, 0);
  for (const span of [a, emoji, wide]) span.remove();
});
