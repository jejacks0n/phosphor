// Every export, byte for byte: .ans (CP437) and .utf8ans (UTF-8) in every color mode, with SAUCE.
// Reference drawings are hand-built grids covering each character and color case; the exported bytes
// must equal the committed references (tests/fixtures/reference/export/), every .utf8ans must lay out
// in a terminal exactly as the grid does, and every .ans must be one byte per cell.
import { describe, test, expect } from 'vitest';
import { AnsiFile } from '../../src/lib/AnsiFile.js';
import { buildCell, layoutWide } from '../../src/lib/Cells.js';
import { PALETTES, rgb2hex } from '../../src/lib/ColorUtils.js';
import { terminalGrid } from '../support/terminal.js';
import { readSauce } from '../support/sauce.js';
import { matchReference } from '../support/references.js';

const SAUCE = { title: 'Phosphor tests', author: 'Test Author', group: 'Test Group', date: '20261024', fontName: 'IBM VGA', use9pxFont: false, comments: ['A comment line'] };

// Four colors per mode: palette entries (with their index) for CGA/VGA, indexed colors for the
// count and custom palettes, 24-bit for none.
const plain = (hex, c) => { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; return { r, g, b, hex: rgb2hex({ r, g, b }), c: c ?? [r, g, b] }; };
const COLORS = {
  none: ['#ffee00', '#0044aa', '#aa0044', '#101010'].map((h) => plain(h)),
  count: ['#ffee00', '#0044aa', '#aa0044', '#101010'].map((h, i) => plain(h, i)),
  palette: ['#ffffff', '#aa5601', '#000000', '#55ff55'].map((h, i) => plain(h, i)),
  cga: [14, 1, 4, 0].map((i) => PALETTES.cga[i]),
  vga: [226, 25, 125, 233].map((i) => PALETTES.vga[i]),
};

// rows of [char, fg index, bg index]
const GRIDS = {
  // wide characters, clusters, a combining mark, a wide one in the last column, ﷽, blocks, shades
  unicode: { cols: 8, rows: [
    [['a', 0, 1], ['漢', 0, 1], ['_', 0, 1], ['b', 2, 1], ['é', 0, 3], ['👍🏽', 0, 1], ['_', 0, 1], ['z', 0, 1]],
    [['﷽', 0, 1], ['가', 2, 3], ['_', 2, 3], ['▀', 0, 1], ['▄', 0, 1], ['█', 2, 1], [' ', 0, 1], ['字', 0, 2]],
    [['╬', 0, 3], ['░', 0, 3], ['▒', 0, 3], ['▓', 0, 3], ['🇯🇵', 2, 0], ['_', 2, 0], ['x', 1, 0], ['y', 1, 0]],
  ] },
  // a cell whose colors match is written as a space, a wide one too (its trail then a space)
  hidden: { cols: 4, rows: [
    [['Q', 1, 1], ['漢', 2, 2], ['_', 2, 2], ['R', 0, 1]],
    [['S', 0, 1], ['T', 3, 3], ['U', 0, 1], ['V', 0, 1]],
  ] },
  // color runs: escape codes only where the colors change, and across row ends
  runs: { cols: 6, rows: [
    [['a', 0, 1], ['b', 0, 1], ['c', 0, 1], ['d', 2, 1], ['e', 2, 1], ['f', 2, 3]],
    [['g', 2, 3], ['h', 2, 3], ['i', 0, 1], ['j', 0, 1], ['k', 1, 0], ['l', 1, 0]],
  ] },
};

const build = (grid, mode) => layoutWide(grid.rows.flat().map(([char, fg, bg]) => {
  const cell = buildCell(COLORS[mode][bg], COLORS[mode][fg], char, 'ansi'); // top -> bg, bottom -> fg
  return cell;
}), grid.cols);

const exported = async (grid, cells, mode, utf8, sauce = SAUCE) =>
  new Uint8Array(await new AnsiFile(grid.cols, grid.rows.length, cells).toBlob({ colorMode: mode, utf8, sauce }).arrayBuffer());

for (const [name, grid] of Object.entries(GRIDS)) {
  describe(`the "${name}" drawing`, () => {
    for (const mode of Object.keys(COLORS)) {
      test(`.utf8ans, ${mode}: the reference bytes, laid out in a terminal as the grid is`, async () => {
        const cells = build(grid, mode);
        const bytes = await exported(grid, cells, mode, true);
        await matchReference(`export/${name}.${mode}.utf8ans`, bytes);
        const shown = cells.map((c) => (c.wide === 'trail' ? '' : c.fg.hex === c.bg.hex ? ' ' : c.char));
        const expected = grid.rows.map((_, r) => shown.slice(r * grid.cols, (r + 1) * grid.cols));
        // A lead written as a space (its colors match) is followed by its trail as a space.
        for (const row of expected) row.forEach((c, i) => { if (c === '' && row[i - 1] === ' ') row[i] = ' '; });
        expect(terminalGrid(bytes, grid.cols)).toEqual(expected);
      });
      test(`.ans, ${mode}: the reference bytes, one byte per cell`, async () => {
        const cells = build(grid, mode);
        const bytes = await exported(grid, cells, mode, false);
        await matchReference(`export/${name}.${mode}.ans`, bytes);
        const art = bytes.slice(0, bytes.indexOf(0x1a));
        let text = '';
        for (const b of art) text += String.fromCharCode(b);
        expect(text.replace(/\x1b\[[0-9;]*m/g, '')).toHaveLength(grid.cols * grid.rows.length); // eslint-disable-line no-control-regex
      });
    }
  });
}

test('SAUCE: the fields come back from the record', async () => {
  const grid = GRIDS.runs;
  const bytes = await exported(grid, build(grid, 'none'), 'none', false);
  const sauce = readSauce(bytes);
  expect(sauce).toMatchObject({ title: 'Phosphor tests', author: 'Test Author', group: 'Test Group', date: '20261024', width: 6, height: 2, dataType: 1, fileType: 1, fontName: 'IBM VGA', comments: ['A comment line'], iceColors: true, letterSpacing: 8 });
  expect(sauce.fileSize).toBe(bytes.indexOf(0x1a)); // the art's length, before the EOF marker
  const nine = readSauce(await exported(grid, build(grid, 'none'), 'none', false, { ...SAUCE, use9pxFont: true, comments: [] }));
  expect(nine).toMatchObject({ letterSpacing: 9, comments: [] });
});
