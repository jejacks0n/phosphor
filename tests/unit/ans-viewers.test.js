// .ans files as viewers read them: every cell drawn (no byte a viewer acts on instead), rows that
// line up without SAUCE, and SAUCE text in CP437.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { AnsiFile } from '../../src/lib/AnsiFile.js';
import { BUILTIN_PALETTES } from '../../src/lib/charPalettes.js';
import { readSauce } from '../support/sauce.js';

const W = { r: 255, g: 255, b: 255, hex: '#ffffff', c: 15 };
const K = { r: 0, g: 0, b: 0, hex: '#000000', c: 0 };
const cell = (char) => ({ char, fg: W, bg: K });
const bytesOf = async (file, opts = {}) => new Uint8Array(await file.toBlob({ colorMode: 'none', ...opts }).arrayBuffer());

// The art as a classic viewer reads it: up to SAUCE's EOF marker (0x1A), SGR sequences removed.
function artBytes(all) {
  const end = all.indexOf(0x1a);
  const art = [...all.subarray(0, end < 0 ? all.length : end)];
  const out = [];
  for (let i = 0; i < art.length; i++) {
    if (art[i] === 27 && art[i + 1] === 91) { // ESC [ ... m
      let j = i + 2;
      while (j < art.length && art[j] !== 109) j++;
      i = j;
      continue;
    }
    out.push(art[i]);
  }
  return out;
}

test('every glyph in a built-in CP437 palette survives .ans export (no raw control bytes a viewer acts on)', async () => {
  const glyphs = BUILTIN_PALETTES.filter((p) => p.id !== 'quadrants').flatMap((p) => p.glyphs).filter(Boolean);
  const row = ['[', ...glyphs, ']'];
  const all = await bytesOf(new AnsiFile(row.length, 1, row.map(cell)));
  const art = artBytes(all).filter((b, i, a) => !(b === 13 && a[i + 1] === 10) && !(b === 10 && a[i - 1] === 13)); // row ends
  // BEL, BS, TAB, LF, CR, SUB (EOF), ESC: every ANSI viewer acts on these instead of drawing them.
  const controls = art.filter((b) => [7, 8, 9, 10, 13, 26, 27].includes(b));
  assert.deepEqual(controls, [], `control bytes in the art: ${controls.join(',')}`);
  assert.equal(art.length, row.length, 'every cell is in the art before EOF');
  assert.equal(art.at(-1), 0x5d); // ']' is reached
});

// A viewer that ignores SAUCE: 80 columns, wraps at the edge, CR/LF move to the next line.
function viewer80(art) {
  const lines = [[]];
  for (const b of art) {
    if (b === 13) continue;
    if (b === 10) { lines.push([]); continue; }
    if (lines.at(-1).length === 80) lines.push([]);
    lines.at(-1).push(b);
  }
  return lines;
}

test('a 40-column .ans shows as 40-column rows in a viewer that wraps at 80', async () => {
  const cols = 40, rows = 3;
  const cells = Array.from({ length: cols * rows }, (_, i) => cell(String.fromCharCode(65 + Math.floor(i / cols))));
  const all = await bytesOf(new AnsiFile(cols, rows, cells));
  assert.equal(readSauce(all).width, 40);
  const lines = viewer80(artBytes(all)).map((l) => String.fromCharCode(...l).trimEnd());
  assert.deepEqual(lines, ['A'.repeat(40), 'B'.repeat(40), 'C'.repeat(40)]);
});

test('SAUCE title is CP437, and a 35-character non-ASCII title is not cut mid-character', async () => {
  const file = new AnsiFile(1, 1, [cell('a')]);
  const record = (all) => all.subarray(all.length - 128);
  const cafe = record(await bytesOf(file, { sauce: { title: 'Café' } }));
  assert.deepEqual([...cafe.subarray(7, 11)], [0x43, 0x61, 0x66, 0x82]); // 'Caf' + CP437 é (130)
  const long = record(await bytesOf(file, { sauce: { title: 'é'.repeat(35) } }));
  assert.deepEqual([...long.subarray(7, 42)], Array(35).fill(0x82));
});

test('SAUCE comments keep blank lines (the spacer before your own comments)', async () => {
  const all = await bytesOf(new AnsiFile(1, 1, [cell('a')]), { sauce: { comments: ['Created with Phosphor', '', 'my note'] } });
  assert.deepEqual(readSauce(all).comments, ['Created with Phosphor', '', 'my note']);
});

test("→ (Arrows palette) in .ans doesn't end the file: the cells after it are still there before SAUCE's EOF", async () => {
  const row = [...'A→BCD'];
  const all = await bytesOf(new AnsiFile(row.length, 1, row.map(cell)));
  assert.equal(String.fromCharCode(...artBytes(all)), 'A>BCD');
});
