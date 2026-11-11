// Opening an .ans, .utf8ans, .asc or .txt file as a document: its art on the base layer, every
// character pinned, or on the edit layer over a black base; its palette and SAUCE in the settings,
// and nothing to undo or save.
import { test, expect, vi } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { AnsiFile } from '@/lib/AnsiFile';
import { buildCell, layoutWide } from '@/lib/Cells';
import { PALETTES, rgb2hex } from '@/lib/ColorUtils';
import { readSauce } from '@/lib/Sauce';

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

test('opened to edit, the art is edit cells over a black base, as the file shows it, with nothing to undo or save', async () => {
  const project = await afterAnotherDocument();
  const cols = 12, rows = 4, cells = build(cols, rows, 'none', CHARS.utf8ans);
  await project.openArtFile(await artFile('wide.utf8ans', cols, rows, cells, { utf8: true, colorMode: 'none', sauce: SAUCE }), { layer: 'edit' });
  await settle(project);

  expect([project.cols, project.rows]).toEqual([cols, 2 * rows]);
  expect(project.quantize).toBe('none');
  expect(project.sauceTitle).toBe('Boat');
  expectShows(project, cells);
  expect(project.editCells.size).toBe(cols * rows);
  for (let i = 0; i < cells.length; i++) {
    const col = i % cols, row = Math.floor(i / cols), where = `cell ${i}`;
    expect(project.editCellAt(col, row)?.char, where).toBeDefined();
    const { fg, bg } = project.baseCellAt(col, row);
    expect({ fg, bg }, where).toEqual({ fg: '#000000', bg: '#000000' }); // a blank canvas's, nothing pinned
    expect(project.renderer.pinAt(col, row), where).toBeUndefined();
  }
  expect(project.history.canUndo).toBe(false);
  expect(project.isDirty).toBe(false);
});

// The .ans file exportFile downloads, as bytes.
async function exported(project) {
  const spy = vi.spyOn(URL, 'createObjectURL');
  await project.exportFile('ans');
  const blob = spy.mock.calls.at(-1)[0];
  spy.mockRestore();
  return new Uint8Array(await blob.arrayBuffer());
}

// A file made by hand the way RA-FIFTY.ANS is: 256-color codes, flags 0, no font name, a height (5) past its lines (3),
// and two comments.
const OPENED = '/tests/fixtures/ansi/256-colors.ans';
const openFixture = async (project, layer) => {
  const blob = await (await fetch(OPENED)).blob();
  await project.openArtFile(new File([blob], '256-colors.ans'), { layer });
  await settle(project);
  return new Uint8Array(await blob.arrayBuffer());
};
// The comment block and record: from COMNT to the end, the file size (bytes 90 to 93 of the record) left out.
const tail = (bytes) => {
  const at = bytes.length - 128 - 5 - 64 * bytes[bytes.length - 128 + 104];
  const block = [...bytes.subarray(at)];
  block.splice(block.length - 128 + 90, 4);
  return block;
};

test('an opened file exports with its SAUCE record as it went in, and Phosphor adds no comments of its own', async () => {
  for (const layer of ['base', 'edit']) {
    const project = await afterAnotherDocument();
    const original = await openFixture(project, layer);
    const bytes = await exported(project);
    expect(tail(bytes), layer).toEqual(tail(original));
    expect(readSauce(bytes).comments, layer).toEqual(readSauce(original).comments);
  }
});

test('a SAUCE field the person changes is the only one that changes, and a resize changes the size', async () => {
  const project = await afterAnotherDocument();
  const original = readSauce(await openFixture(project, 'edit'));
  project.sauceTitle = 'Renamed';
  const renamed = readSauce(await exported(project));
  expect({ ...renamed, artEnd: 0 }).toEqual({ ...original, title: 'Renamed', artEnd: 0 });

  project.updateRows(2 * 4);
  await settle(project);
  const resized = readSauce(await exported(project));
  expect([resized.width, resized.height, resized.flags, resized.fontName]).toEqual([8, 4, 0, '']);
});

test('a 256-color file opens on VGA and exports 256-color codes, not 24-bit ones', async () => {
  for (const layer of ['base', 'edit']) {
    const project = await afterAnotherDocument();
    await openFixture(project, layer);
    expect(project.quantize, layer).toBe('vga');
    const art = new TextDecoder('latin1').decode(await exported(project));
    expect(art, layer).toMatch(/\[38;5;\d+m/);
    expect(art, layer).not.toMatch(/[34]8;2;/);
  }
});

test('a converted image or a blank canvas has no comments but the person\'s', async () => {
  const project = await afterAnotherDocument();
  project.sauceUserComments = '';
  expect(readSauce(await exported(project)).comments).toEqual([]);
  project.sauceUserComments = 'mine\nalso';
  const sauce = readSauce(await exported(project));
  expect([sauce.comments, sauce.flags, sauce.fontName]).toEqual([['mine', 'also'], 3, 'IBM VGA']);
  expect(sauce.date).toMatch(/^\d{8}$/);
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
