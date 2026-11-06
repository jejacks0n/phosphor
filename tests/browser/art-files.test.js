// Opening an .ans, .utf8ans, .asc or .txt file as a document: its art on the base layer, every
// character pinned, its palette and SAUCE in the settings, and nothing to undo or save.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { AnsiFile } from '@/lib/AnsiFile';
import { buildCell, layoutWide } from '@/lib/Cells';
import { PALETTES, rgb2hex } from '@/lib/ColorUtils';

const plain = (hex) => { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; return { r, g, b, hex: rgb2hex({ r, g, b }), c: [r, g, b] }; };
const COLORS = {
  cga: [14, 1, 4, 0, 10, 1].map((i) => PALETTES.cga[i]),
  none: ['#ffee00', '#0044aa', '#aa0044', '#101010', '#12ab34', '#0044aa'].map(plain),
};
const CHARS = { ans: ['a', 'Z', '█', '▀', '░', '╬', ' ', '~'], utf8ans: ['a', '█', '▀', 'é', ' ', '漢', 'ж'] };

// A cols x rows grid of cells as the views show them, wide characters laid out.
const build = (cols, rows, mode, chars) => layoutWide(Array.from({ length: cols * rows }, (_, i) =>
  buildCell(COLORS[mode][(i * 3 + (i >> 3)) % 6], COLORS[mode][(i * 5 + 1) % 6], chars[(i * 7 + (i >> 2)) % chars.length], 'ansi')), cols);

const SAUCE = { title: 'Boat', author: 'Ann', group: 'Crew', date: '20261102', fontName: 'IBM VGA50', use9pxFont: true, comments: ['Rowing out', 'at dawn'] };

const artFile = async (name, cols, rows, cells, opts) => new File([new AnsiFile(cols, rows, cells).toBlob(opts)], name);

// Someone worked on another image first, with the sliders and settings moved and SAUCE filled in.
async function afterAnotherDocument() {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  Object.assign(project, { brightness: 180, contrast: 60, invert: 30, hue: 90, saturation: 20, smoothing: 'low', renderStyle: 'colorAscii', quantize: 'vga', sauceTitle: 'Old', sauceAuthor: 'Someone' });
  await settle(project);
  return project;
}

// The cells show what the file does: each character and its colors; a wide character's lead holds
// it and its trail follows in the same colors. A cell whose colors match was written as a space.
function expectShows(project, cells) {
  expect(project.cells).toHaveLength(cells.length);
  cells.forEach((cell, i) => {
    const shown = project.cells[i], where = `cell ${i} (${JSON.stringify(cell.char)})`;
    expect(shown.fg.hex.toLowerCase(), where).toBe(cell.fg.hex.toLowerCase());
    expect(shown.bg.hex.toLowerCase(), where).toBe(cell.bg.hex.toLowerCase());
    if (cell.wide) expect(shown.wide, where).toBe(cell.wide);
    if (cell.wide === 'trail') expect(shown.char, where).toBe(cells[i - 1].char);
    else expect(shown.char, where).toBe(cell.fg.hex === cell.bg.hex ? ' ' : cell.char);
  });
}

test('a CGA .ans opens as a document: its cells, size, palette and SAUCE, nothing to undo or save', async () => {
  const project = await afterAnotherDocument();
  const cols = 10, rows = 4, cells = build(cols, rows, 'cga', CHARS.ans);
  const before = project.documentId;
  await project.openArtFile(await artFile('boat.ans', cols, rows, cells, { colorMode: 'cga', sauce: SAUCE }));
  await settle(project);

  expect(project.documentId).not.toBe(before);
  expect([project.cols, project.rows]).toEqual([cols, 2 * rows]);
  expect(project.quantize).toBe('cga');
  expect(project.renderStyle).toBe('ansi');
  expect(project.filename).toBe('boat');
  expectShows(project, cells);
  expect({
    sauceTitle: project.sauceTitle, sauceAuthor: project.sauceAuthor, sauceGroup: project.sauceGroup, sauceDate: project.sauceDate,
    sauceUserComments: project.sauceUserComments, sauceFontName: project.sauceFontName, sauceUse9pxFont: project.sauceUse9pxFont,
  }).toEqual({
    sauceTitle: 'Boat', sauceAuthor: 'Ann', sauceGroup: 'Crew', sauceDate: '20261102',
    sauceUserComments: 'Rowing out\nat dawn', sauceFontName: 'IBM VGA50', sauceUse9pxFont: true,
  });
  expect(project.history.canUndo).toBe(false);
  expect(project.isDirty).toBe(false);
  expect(useWorkspaceStore().ansiOverlayAll).toBe(true); // the PIXEL tab shows each cell as it looks, not its two colors as stripes
});

test('a 24-bit .utf8ans opens in full color, wide characters and all', async () => {
  const project = await afterAnotherDocument();
  const cols = 12, rows = 4, cells = build(cols, rows, 'none', CHARS.utf8ans);
  expect(cells.some((c) => c.wide === 'lead')).toBe(true);
  await project.openArtFile(await artFile('wide.utf8ans', cols, rows, cells, { utf8: true, colorMode: 'none', sauce: SAUCE }));
  await settle(project);

  expect([project.cols, project.rows]).toEqual([cols, 2 * rows]);
  expect(project.quantize).toBe('none');
  expectShows(project, cells);
  expect(project.history.canUndo).toBe(false);
  expect(project.isDirty).toBe(false);
});

test('a file with no SAUCE starts the SAUCE tab empty', async () => {
  const project = await afterAnotherDocument();
  await project.openArtFile(new File(['hello\nthere'], 'note.txt'));
  await settle(project);
  expect([project.cols, project.rows]).toEqual([5, 4]);
  expect(project.cells.slice(0, 5).map((c) => c.char).join('')).toBe('hello');
  expect([project.sauceTitle, project.sauceAuthor, project.sauceUserComments, project.sauceFontName, project.sauceUse9pxFont]).toEqual(['', '', '', 'IBM VGA', false]);
});

test('a file over the limits rejects with its message, and the open document stays', async () => {
  const project = await afterAnotherDocument();
  const { documentId, filename } = project, cells = cellsKey(project);
  await expect(project.openArtFile(new File(['x'.repeat(301)], 'wide.txt'))).rejects.toMatchObject({ userMessage: expect.stringContaining('301 × 1') });
  await settle(project);
  expect(project.documentId).toBe(documentId);
  expect(project.filename).toBe(filename);
  expect(cellsKey(project)).toEqual(cells);
  expect(useWorkspaceStore().ansiOverlayAll).toBe(false);
});

test('paint over a file\'s cells covers them as it covers typed ones: a space or block takes the paint on the half it covers', async () => {
  const project = await afterAnotherDocument();
  await project.openArtFile(new File(['ab  \nab  '], 'note.txt'));
  await settle(project);
  project.paintStroke([{ x: 2, y: 0, alpha: 1 }, { x: 3, y: 1, alpha: 1 }, { x: 0, y: 0, alpha: 1 }], '#ffffff'); // top of (2, 0), bottom of (3, 0), top of the a
  await settle(project);
  const shows = () => [0, 2, 3].map((col) => { const { char, fg, bg } = project.cells[col]; return [char, bg.hex.toLowerCase(), fg.hex.toLowerCase()]; });
  const expected = [['a', '#ffffff', '#aaaaaa'], ['▄', '#ffffff', '#000000'], ['▄', '#000000', '#ffffff']]; // a letter keeps its character, tinted
  expect(shows()).toEqual(expected);
  project.render(); // a whole render composes them the same way
  await settle(project);
  expect(shows()).toEqual(expected);
});
