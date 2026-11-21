import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import * as Font from '@/lib/BitmapFont.js';
import * as Glyphs from '@/lib/BitmapGlyphs.js';

describe('BitmapGlyphs', () => {
  it('loads under plain Node', () => {
    expect(() =>
      execFileSync('node', ['--input-type=module', '-e', "const m = await import('./src/lib/BitmapGlyphs.js'); if (typeof m.findBlocks !== 'function' || typeof m.fontId !== 'function') process.exit(1)"]),
    ).not.toThrow();
  });

  it('is what BitmapFont re-exports', () => {
    for (const name of ['findBlocks', 'fontId', 'maskOf', 'glyphRows', 'BLOCKS', 'CP437_BLOCKS']) {
      expect(Font[name]).toBe(Glyphs[name]);
    }
  });
});
