// Opening an .ans, .utf8ans, .asc or .txt file as a document: its art on the base layer, every
// character pinned, or on the edit layer over a black base; its palette and SAUCE in the settings,
// and nothing to undo or save.
import { test, expect, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { i18n } from '@/i18n';
import EditWorkspace from '@/components/EditWorkspace.vue';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { AnsiFile } from '@/lib/AnsiFile';
import { buildCell, layoutWide } from '@/lib/Cells';
import { PALETTES, rgb2hex } from '@/lib/ColorUtils';
import { Sauce, readSauce } from '@/lib/Sauce';
import { readXBin, writeXBin } from '@/lib/XBinFile';
import { readArtFile } from '@/lib/ArtFile';
import { CP437_BLOCKS, SLOT_CHARS } from '@/lib/BitmapFont';
import { closeToast, toastMessage } from '@/composables/useToast';
import { slidersAtDefaults } from '@/store/settings';
import { blankScale } from '@/store/project/document';
import { writeProject } from '@/document/projectIO.js';
import { loadReferenceFont } from '@/lib/GlyphCoverage';
import { drawGlyphCell } from '@/lib/glyphPicture';

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

// First in the file: the reference font (IBM VGA) hasn't loaded yet. Open as an image waits for it before drawing the
// cells, so a letter is IBM VGA's glyph, not a fallback font's baked into the picture.
test('opened as an image before the reference font has loaded, a letter is drawn in it', async () => {
  const { project } = await createTestApp(), file = new File(['A'], 'a.txt');
  const [cell] = readArtFile(new Uint8Array(await file.arrayBuffer()), file.name).cells;
  await project.openArtFile(file, { layer: 'picture' });
  await settle(project);
  await loadReferenceFont();
  const { naturalWidth: w, naturalHeight: h } = project.image;
  const ctx = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d');
  ctx.drawImage(project.image, 0, 0);
  const want = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d');
  drawGlyphCell(want, cell, 0, 0, w);
  expect([...ctx.getImageData(0, 0, w, h).data]).toEqual([...want.getImageData(0, 0, w, h).data]);
});

test('a CGA .ans opens as a document: its cells, size, palette and SAUCE, nothing to undo or save', async () => {
  const project = await afterAnotherDocument();
  const cols = 10, rows = 4, cells = build(cols, rows, 'cga', CHARS.ans);
  const before = project.documentId;
  await project.openArtFile(await artFile('boat.ans', cols, rows, cells, { colorMode: 'cga', sauce: { ...SAUCE, fontName: 'Rowboat 8' } }));
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
    sauceUserComments: 'Rowing out\nat dawn', sauceFontName: 'Rowboat 8', sauceUse9pxFont: true,
  });
  expect(project.history.canUndo).toBe(false);
  expect(project.isDirty).toBe(false);
  expect(useWorkspaceStore().ansiOverlayAll).toBe(false); // the PIXEL tab shows each character as it looks without it (docs/model.md R11)
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

test('opened to edit alone, the ledger holds none of it, and an edit after it undoes back to the file', async () => {
  const project = await afterAnotherDocument();
  const cols = 12, rows = 4, cells = build(cols, rows, 'none', CHARS.utf8ans);
  const submit = vi.spyOn(project._ledger, 'submit');
  await project.openArtFile(await artFile('wide.utf8ans', cols, rows, cells, { utf8: true, colorMode: 'none', sauce: SAUCE }), { layer: 'edit' });
  await settle(project);
  expect(submit).not.toHaveBeenCalled(); // opening isn't an edit: clearHistory would only drop it
  const { stacks } = project._ledger.kept();
  expect([stacks.cells.size, stacks.strokes.size, stacks.tiles.size]).toEqual([0, 0, 0]);
  const opened = new Map(project.editCells);

  project.editCell(0, 0, { char: 'X' });
  project.commitEdit();
  await settle(project);
  expect(project.cells[0].char).toBe('X');
  project.undo();
  await settle(project);
  expect(project.editCells).toEqual(opened);
  expectShows(project, cells);
  expect(project.history.canUndo).toBe(false);
});

test('opened to edit by a room\'s host, every cell still goes out numbered', async () => {
  const project = await afterAnotherDocument();
  const sent = [];
  project.startSharing({ send: (message) => sent.push(message), role: 'host', me: 'mine' });
  try {
    const cols = 12, rows = 4, cells = build(cols, rows, 'none', CHARS.utf8ans);
    await project.openArtFile(await artFile('wide.utf8ans', cols, rows, cells, { utf8: true, colorMode: 'none', sauce: SAUCE }), { layer: 'edit' });
    await settle(project);
    const keys = new Set(sent.filter(({ t }) => t === 'numbered').flatMap((message) => message.cells.map(([key]) => key)));
    expect(keys.size).toBe(cols * rows);
    expect(project.history.canUndo).toBe(false);
    expect(project.isDirty).toBe(false);
  } finally {
    project.stopSharing();
  }
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

test('exported without SAUCE, a still or an animated ANSI file ends with its art: no record, no EOF byte', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 4, rows: 4 });
  project.sauceTitle = 'Boat';
  const download = async (run) => {
    const spy = vi.spyOn(URL, 'createObjectURL');
    await run();
    const blob = spy.mock.calls.at(-1)[0];
    spy.mockRestore();
    return new Uint8Array(await blob.arrayBuffer());
  };
  const files = [
    await download(() => project.exportFile('ans', { sauce: false })),
    await download(() => project.exportFile('utf8ans', { sauce: false })),
  ];
  project.animate = true;
  project.addFrame('blank');
  await settle(project);
  files.push(await download(() => project.exportAnimation('ansimation', { sauce: false })));
  for (const bytes of files) {
    expect(readSauce(bytes)).toBeNull();
    expect(bytes.includes(0x1a)).toBe(false);
  }
  expect(readSauce(await download(() => project.exportAnimation('utf8ansimation'))).title).toBe('Boat'); // with it, as before
});

test('a SAUCE field the person changes is the only one that changes, and a resize changes the size', async () => {
  const project = await afterAnotherDocument();
  const original = readSauce(await openFixture(project, 'edit'));
  project.sauceTitle = 'Renamed';
  const renamed = readSauce(await exported(project));
  expect({ ...renamed, artEnd: 0 }).toEqual({ ...original, title: 'Renamed', artEnd: 0 });

  project.setAspectLock(false); // on, the width would follow
  project.updateRows(2 * 4);
  await settle(project);
  const resized = readSauce(await exported(project));
  expect([resized.width, resized.height, resized.flags, resized.fontName]).toEqual([8, 4, 0, '']);
});

test('Date, Font name and Letter spacing change only their own bytes; set back as they came, the record is the same', async () => {
  const project = await afterAnotherDocument();
  const original = await openFixture(project, 'edit');
  const record = (bytes) => [...bytes.subarray(bytes.length - 128)];
  const changed = (bytes) => record(bytes).flatMap((byte, i) => (byte === record(original)[i] || (i >= 90 && i < 94) ? [] : [i])); // file size aside
  expect(project.sauceFields().flags).toBe(0); // the fixture's: no letter spacing set

  project.sauceLetterSpacing = '9';
  expect(changed(await exported(project))).toEqual([105]);
  expect(readSauce(await exported(project)).flags).toBe(4);
  project.sauceLetterSpacing = 'none';
  expect(tail(await exported(project))).toEqual(tail(original));

  project.sauceDate = '19961113';
  project.sauceFontName = 'IBM VGA';
  const read = readSauce(await exported(project));
  expect([read.date, read.fontName]).toEqual(['19961113', 'IBM VGA']);
  expect(changed(await exported(project)).every((i) => (i >= 82 && i < 90) || (i >= 106 && i < 126))).toBe(true);
  project.sauceDate = readSauce(original).date;
  project.sauceFontName = readSauce(original).fontName;
  expect(tail(await exported(project))).toEqual(tail(original));
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

// xterm's 16 and 231 are fixed black and white, 0 and 15 a terminal's own (its theme's): the same colors in Phosphor. A
// file using all four, opened to edit, exports byte for byte as it was (a QA report: 16 came back 0, 231 came back 15),
// apart from a cell changed, and so does its .phosphor saved and opened again.
test('a 256-color file\'s 16 and 231 export as 16 and 231, edited and through a .phosphor', async () => {
  const project = await afterAnotherDocument();
  const blob = await (await fetch('/tests/fixtures/ansi/fixed-black-white.ans')).blob();
  await project.openArtFile(new File([blob], 'fixed-black-white.ans'), { layer: 'edit' });
  await settle(project);
  const artOf = async (bytes) => new TextDecoder('latin1').decode(bytes.subarray(0, bytes.indexOf(0x1a)));
  const original = await artOf(new Uint8Array(await blob.arrayBuffer()));
  expect(await artOf(await exported(project))).toBe(original);

  project.editCell(1, 0, { char: 'Z' });
  await settle(project);
  const edited = original.replace('16mB', '16mZ');
  expect(await artOf(await exported(project))).toBe(edited);

  const spy = vi.spyOn(URL, 'createObjectURL');
  await project.saveProject();
  const saved = spy.mock.calls.at(-1)[0];
  spy.mockRestore();
  await project.loadProject(new File([saved], 'saved.phosphor'));
  await settle(project);
  expect(await artOf(await exported(project))).toBe(edited);
});

// Phosphor's own comment lines: who made it, and the settings it was converted with.
const PHOSPHOR_LINES = /^Created with Phosphor Params: seed=\S+, smoothing=\S+, quantize=\S+ Adjust: .+ Effects: .+$/;

test('a converted image or a blank canvas has Phosphor\'s comment lines, wrapped at a space, then the person\'s', async () => {
  const project = await afterAnotherDocument();
  project.sauceUserComments = '';
  const own = readSauce(await exported(project));
  expect(own.comments.length).toBeGreaterThan(4); // the Effects line is longer than one
  expect(own.comments.every((line) => line.length <= 64 && line === line.trim())).toBe(true);
  expect(own.comments.join(' ')).toMatch(PHOSPHOR_LINES); // each break was a space, so no word is cut
  expect(own.comments.join(' ')).toContain('edges=0 (#000000), thickness=1');

  project.sauceUserComments = 'mine\nalso';
  const sauce = readSauce(await exported(project));
  expect(sauce.comments.slice(own.comments.length)).toEqual(['', 'mine', 'also']);
  expect([sauce.flags, sauce.fontName]).toEqual([3, 'IBM VGA']);
  expect(sauce.date).toMatch(/^\d{8}$/);

  await project.setBlankCanvas({ withLayer: true, cols: 10, rows: 10 });
  await settle(project);
  project.sauceUserComments = '';
  expect(readSauce(await exported(project)).comments.join(' ')).toMatch(PHOSPHOR_LINES);
});

test('an opened file, with SAUCE or without, gets no comment lines of Phosphor\'s', async () => {
  const project = await afterAnotherDocument();
  await project.openArtFile(new File(['hello\nthere'], 'note.txt'));
  await settle(project);
  expect(readSauce(await exported(project)).comments).toEqual([]);
  await openFixture(project, 'edit');
  expect(readSauce(await exported(project)).comments).toHaveLength(2);
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

test('a file that can\'t open is refused before anything is asked: too big, or empty, nothing asks how to open it', async () => {
  const project = await afterAnotherDocument(), workspace = useWorkspaceStore();
  closeToast();
  await workspace.askArt(new File(['x'.repeat(301)], 'wide.txt'));
  expect(workspace.artDrop).toBe(null);
  expect(toastMessage.value).toContain('301 × 1');
  await workspace.askArt(new File([], 'empty.ans'));
  expect(workspace.artDrop).toBe(null);
  expect(toastMessage.value).toBe('There\'s no art in this file.');
  expect(project.filename).not.toBe('empty');
});

test('a file that opens asks with what it read, and opens that without reading the file again', async () => {
  const project = await afterAnotherDocument(), workspace = useWorkspaceStore();
  const file = new File(['ab\ncd'], 'boat.txt');
  await workspace.askArt(file, { at: { col: 1, row: 1 } });
  expect(workspace.artDrop).toMatchObject({ file, at: { col: 1, row: 1 }, art: { cols: 2, rows: 2 } });
  const read = vi.spyOn(file, 'arrayBuffer');
  await project.openArtFile(file, { layer: 'edit', art: workspace.artDrop.art });
  await settle(project);
  expect(read).not.toHaveBeenCalled();
  expect(project.filename).toBe('boat');
  expect(project.cells.map((cell) => cell.char).join('')).toBe('abcd');
});

test('a .utf8ans that isn\'t UTF-8 asks as an .ans would, and says it was read as CP437', async () => {
  const workspace = (await afterAnotherDocument(), useWorkspaceStore());
  closeToast();
  await workspace.askArt(new File([Uint8Array.from([0xb0, 0xdb, 0xb1, 0x41, 0xdb, 0xb2])], 'renamed.utf8ans'));
  const { art } = workspace.artDrop;
  expect([art.cols, art.cells.slice(0, 6).map((cell) => cell.char).join('')]).toEqual([80, '░█▒A█▓']);   // 80 wide, as an .ans
  expect(toastMessage.value).toBe('renamed.utf8ans isn\'t UTF-8, so it was read as CP437, as an .ans file is.');
});

// docs/model.md R2: the file's characters are pins on the base, so a layer's paint over its open ones (the spaces) is
// converted with the layer's characters (here the base's Random), and over a letter it tints the letter.
test('R2: a layer\'s paint over a file\'s cells tints its letters and converts its spaces with the layer\'s characters', async () => {
  const project = await afterAnotherDocument();
  await project.openArtFile(new File(['ab  \nab  '], 'note.txt'));
  await settle(project);
  project.paintStroke([{ x: 2, y: 0, alpha: 1 }, { x: 3, y: 1, alpha: 1 }, { x: 0, y: 0, alpha: 1 }], '#ffffff'); // top of (2, 0), bottom of (3, 0), top of the a
  await settle(project);
  const shows = () => [0, 2, 3].map((col) => { const { char, fg, bg } = project.cells[col]; return [char, bg.hex.toLowerCase(), fg.hex.toLowerCase()]; });
  const first = shows();
  expect(first[0]).toEqual(['a', '#ffffff', '#aaaaaa']); // a letter keeps its character, tinted
  for (const [char, bg, fg] of first.slice(1)) { // a space takes the paint in the layer's characters, over its own two colors
    expect(char).not.toBe(' ');
    expect([bg, fg].sort()).toEqual(['#000000', '#ffffff']);
  }
  project.render(); // a whole render composes them the same way
  await settle(project);
  expect(shows()).toEqual(first);
});

test('a new blank canvas clears all SAUCE fields to their defaults', async () => {
  const project = await afterAnotherDocument();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(project);
  expect([project.sauceTitle, project.sauceAuthor, project.sauceGroup, project.sauceDate, project.sauceUserComments, project.sauceFontName, project.sauceUse9pxFont])
    .toEqual(['', '', '', '', '', 'IBM VGA', false]);
});

// #125: every way to start a new drawing starts with an empty SAUCE tab, whatever the drawing before had in it.
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="5" height="5" fill="red"/></svg>';
for (const [name, start] of [
  ['a picture', async (project) => loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 })],
  ['an SVG', (project) => project.openSvgFile(new File([SVG], 'box.svg', { type: 'image/svg+xml' }))],
]) {
  test(`${name} opened as a new drawing starts with every SAUCE field at its default`, async () => {
    const project = await afterAnotherDocument();
    Object.assign(project, { sauceGroup: 'Crew', sauceDate: '20261102', sauceUserComments: 'Rowing out', sauceFontName: 'IBM VGA50', sauceUse9pxFont: true });
    await start(project);
    await settle(project);
    expect([project.sauceTitle, project.sauceAuthor, project.sauceGroup, project.sauceDate, project.sauceUserComments, project.sauceFontName, project.sauceUse9pxFont])
      .toEqual(['', '', '', '', '', 'IBM VGA', false]);
  });
}

// Maya: every slider back at its default for a new drawing, however it starts, and on the start screen after New
// project, whatever the drawing before had them at (Brightness 101% carried into every picture opened after it).
for (const [name, start] of [
  ['a picture', async (project) => loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 })],
  ['an SVG', (project) => project.openSvgFile(new File([SVG], 'box.svg', { type: 'image/svg+xml' }))],
  ['a blank canvas', (project) => project.setBlankCanvas({ cols: 20, rows: 20 })],
  ['New project', (project) => project.clearImage()],
]) {
  test(`${name} starts with every slider at its default`, async () => {
    const project = await afterAnotherDocument();
    Object.assign(project, { brightness: 101, blur: 3, levelsMid: 1.5, colorizeStrength: 40 });
    await start(project);
    await settle(project);
    expect(slidersAtDefaults(project)).toBe(true);
    expect(project.brightness).toBe(100);
  });
}

// An XBin with a font whose slot 0 is solid, and its own colors.
const xbinFile = (name = 'font.xb') => {
  const bytes = new Uint8Array(16 * 256).fill(0);
  bytes.fill(0xff, 0, 16);
  const palette = Array.from({ length: 16 }, (_, i) => '#' + (i * 16 + 8).toString(16).padStart(2, '0').repeat(3));
  const cells = Array.from({ length: 6 }, (_, i) => ({ char: i % 2 ? 'A' : '█', fg: plain(palette[i + 1]), bg: plain(palette[i]) })); // colors as the store's cells hold them
  const font = { name: 'Solid', height: 16, bytes };
  return { file: new File([writeXBin({ cols: 3, rows: 2, cells, palette, font })], name), font };
};

test('an XBin opens with its font and palette', async () => {
  const project = await afterAnotherDocument(), { file, font } = xbinFile();
  await project.openArtFile(file);
  await settle(project);
  const { palette } = readXBin(new Uint8Array(await file.arrayBuffer()), 'f.xb'); // the file's 6-bit colors
  expect(project.cells.slice(0, 6).map((c) => [c.fg.hex, c.bg.hex])).toEqual(Array.from({ length: 6 }, (_, i) => [palette[i + 1], palette[i]]));
  expect(project.drawingFont.bytes).toEqual(font.bytes);
  expect(project.drawingFont.height).toBe(16);
  expect([project.cols, project.rows]).toEqual([3, 4]);
  expect(project.quantize).toBe('palette');
  expect(project.palette).toBe(palette.join(' '));
});

test('a renamed XBin opens as one', async () => {
  const workspace = (await afterAnotherDocument(), useWorkspaceStore());
  await workspace.askArt(xbinFile('renamed.txt').file);
  expect(workspace.artDrop.art.font.height).toBe(16);
});

test('an XBin of 512 characters is refused with its reason, and the open drawing stays', async () => {
  const project = await afterAnotherDocument(), workspace = useWorkspaceStore();
  const before = project.documentId;
  closeToast();
  const bytes = new Uint8Array(await xbinFile('big.xb').file.arrayBuffer());
  bytes[10] |= 0x10;
  await workspace.askArt(new File([bytes], 'big.xb'));
  expect(toastMessage.value).toMatch(/512 characters/);
  expect(workspace.artDrop).toBeNull();
  expect(project.documentId).toBe(before);
});

// An XBin with no palette and no font: the header, then uncompressed cells.
const bareXBin = () => new File([Uint8Array.from([0x58, 0x42, 0x49, 0x4e, 0x1a, 2, 0, 1, 0, 16, 0, 65, 7, 66, 7])], 'bare.xb');

test('an XBin with no font opens with no drawing font, and no palette opens as CGA', async () => {
  const project = await afterAnotherDocument(), { file } = xbinFile();
  await project.openArtFile(file);
  expect(project.drawingFont).not.toBeNull();
  await project.openArtFile(bareXBin());
  await settle(project);
  expect(project.drawingFont).toBeNull();
  expect(project.quantize).toBe('cga');
});

test('an XBin whose 16 colors are CGA in DOS order opens as CGA; one channel off, as its own list', async () => {
  const project = await afterAnotherDocument();
  const dos = [0, 4, 2, 6, 1, 5, 3, 7, 8, 12, 10, 14, 9, 13, 11, 15].map((i) => PALETTES.cga[i].hex);
  const font = { name: 'F', height: 8, bytes: new Uint8Array(8 * 256) };
  const open = async (palette) => {
    await project.openArtFile(new File([writeXBin({ cols: 1, rows: 1, cells: [{ char: 'A', fg: plain(dos[7]), bg: plain(dos[0]) }], palette, font })], 'p.xb'));
    await settle(project);
  };
  await open(dos);
  expect(project.quantize).toBe('cga');
  await open(dos.map((hex, i) => (i === 3 ? '#aaaa00' : hex)));
  expect(project.quantize).toBe('palette');
});

test('a .xb file without the XBIN signature is refused as broken', async () => {
  const workspace = (await afterAnotherDocument(), useWorkspaceStore());
  closeToast();
  await workspace.askArt(new File(['just text'], 'fake.xb'));
  expect(toastMessage.value).toMatch(/fake\.xb/);
  expect(workspace.artDrop).toBeNull();
});

// BinaryText (.bin): opened as a CP437 .ans is, in the 16 colors, its record's size kept as the grid's.
const binFixture = async (name = 'BINARYTEXT.BIN') => new File([await (await fetch('/tests/fixtures/ansi/binarytext.bin')).blob()], name);

test('a BinaryText opens on CGA with its cells and SAUCE, keeps the font in use, and exports as an .ans 8 wide', async () => {
  const project = await afterAnotherDocument(), workspace = useWorkspaceStore();
  const fontBefore = project.drawingFont;
  closeToast();
  await workspace.askArt(await binFixture());
  expect(toastMessage.value).toBeFalsy(); // its record says what it is
  await project.openArtFile(workspace.artDrop.file, { art: workspace.artDrop.art });
  await settle(project);
  expect([project.cols, project.rows, project.quantize, project.filename, project.sauceTitle]).toEqual([8, 6, 'cga', 'BINARYTEXT', 'Bin']);
  expect(project.cells.slice(0, 16).map((c) => c.char).join('')).toBe('BIN TEXT→█░▒▓▄▀A');
  expect(project.cells[8].bg.hex).toBe(PALETTES.cga[8].hex); // iCE: a bright background
  expect(project.drawingFont).toBe(fontBefore);
  expect(project.history.canUndo).toBe(false);
  let blob;
  await project.exportFile('ans', { deliver: (b) => { blob = b; } });
  const again = readArtFile(new Uint8Array(await blob.arrayBuffer()), 'again.ans');
  expect([again.cols, again.rows]).toEqual([8, 3]); // the record's width 8, not the 0 a BinaryText's record holds there
  expect(again.cells.slice(0, 8).map((c) => c.char).join('')).toBe('BIN TEXT');
});

test('a .bin with no SAUCE opens 160 wide and says so; one that isn\'t BinaryText is refused, and the drawing stays', async () => {
  const project = await afterAnotherDocument(), workspace = useWorkspaceStore();
  const before = project.documentId;
  closeToast();
  const row = Array.from({ length: 320 }, (_, i) => (i % 2 ? 0x1e : 0xdb));
  await workspace.askArt(new File([Uint8Array.from(row)], 'old.bin'));
  expect(toastMessage.value).toBe('old.bin has no SAUCE record, so it was read as BinaryText 160 columns wide.');
  expect([workspace.artDrop.art.cols, workspace.artDrop.art.rows]).toEqual([160, 1]);
  workspace.artDrop = null;
  closeToast();
  await workspace.askArt(new File([new Uint8Array(4096)], 'firmware.bin'));
  expect(toastMessage.value).toBe('firmware.bin isn\'t a BinaryText file.');
  expect(workspace.artDrop).toBeNull();
  expect(project.documentId).toBe(before);
});

test('opens an XBin and exports the same cells', async () => {
  const project = await afterAnotherDocument(), { font } = xbinFile();
  const dos = [0, 4, 2, 6, 1, 5, 3, 7, 8, 12, 10, 14, 9, 13, 11, 15].map((i) => PALETTES.cga[i].hex);
  const cells = [SLOT_CHARS[0], ' ', SLOT_CHARS[255], 'A', SLOT_CHARS[0], ' '].map((char, i) => ({ char, fg: plain(dos[(i + 1) % 16]), bg: plain(dos[i]) }));
  const bytes = writeXBin({ cols: 3, rows: 2, cells, palette: dos, font });
  await project.openArtFile(new File([bytes], 'f.xb'));
  await settle(project);
  expect(project.quantize).toBe('cga');
  let blob;
  await project.exportFile('xb', { deliver: (b) => { blob = b; }, sauce: false });
  const again = readXBin(new Uint8Array(await blob.arrayBuffer()), 'f.xb');
  const first = readXBin(bytes, 'f.xb');
  expect(first.cells.map((c) => [c.fg, c.bg])).toEqual(cells.map((c) => [c.fg.hex, c.bg.hex].map((hex) => hex.toLowerCase()))); // every index as written
  expect(again.cells).toEqual(first.cells);
  expect(again.palette).toEqual(first.palette);
  expect([...again.font.bytes]).toEqual([...first.font.bytes]);
  await project.openArtFile(new File([blob], 'again.xb'));
  await settle(project);
  expect(project.quantize).toBe('cga'); // DOS order out, recognized as CGA again
});

// iCE colors (#205): the drawing's, from what a file says, and every export says it back the same way.
const ICE = '\x1b[?33h';
const latin = (bytes) => new TextDecoder('latin1').decode(bytes);
const artOf = (bytes) => bytes.subarray(0, bytes.indexOf(0x1a));
const withRecord = (text, flags) => new File([new Sauce({ cols: 4, rows: 1 }, { flags, fileType: 1, title: 'Blinks' }).appendTo(Uint8Array.from(text, (c) => c.charCodeAt(0)))], 'blinks.ans');

test('an .ans whose SAUCE leaves iCE colors off opens with it off, and exports its blink cells, its flag and no ESC[?33h as they came', async () => {
  const project = await afterAnotherDocument();
  expect(project.sauceIceColors).toBe(true); // a new drawing's
  const art = '\x1b[0m\x1b[5;37;44mAB\x1b[0;31mCD\x1b[0m';
  await project.openArtFile(withRecord(art, 2));
  await settle(project);
  expect([project.sauceIceColors, project.quantize, project.cells[0].bg.hex]).toEqual([false, 'cga', PALETTES.cga[12].hex]); // stored bright
  const bytes = await exported(project);
  expect(latin(bytes)).not.toContain(ICE);
  expect(readSauce(bytes).flags).toBe(2);
  expect(latin(artOf(bytes))).toContain('\x1b[5;37;44mAB'); // the blink cells as they were written
  const back = readArtFile(bytes, 'again.ans');
  expect([back.iceColors, back.cells[0].bg]).toEqual([false, PALETTES.cga[12].hex]);

  await project.openArtFile(withRecord(art, 3)); // with the flag: on, and said by the code too
  await settle(project);
  expect(project.sauceIceColors).toBe(true);
  const on = await exported(project);
  expect([latin(on).startsWith(ICE), readSauce(on).flags]).toEqual([true, 3]);
});

test('an .ans written blinking, as tests/qa/files.js writes Walt\'s blink.ans, exports untouched byte for byte', async () => {
  const project = await afterAnotherDocument(), cga = PALETTES.cga;
  const cells = ['B', 'L', ' ', 's', 't'].map((char, i) => ({ char, fg: cga[i < 2 ? 15 : 14], bg: cga[i < 2 ? 9 : 4] }));
  const original = new Uint8Array(await new AnsiFile(5, 1, cells).toBlob({ colorMode: 'cga', iceColors: false, sauce: { title: 'QA Blink', flags: 2 } }).arrayBuffer());
  await project.openArtFile(new File([original], 'blink.ans'), { layer: 'edit' });
  await settle(project);
  expect(project.sauceIceColors).toBe(false);
  expect([...await exported(project)]).toEqual([...original]);
});

test('a file that opens blinking, where the system asks for reduced motion, says the ANSI view won\'t blink it; otherwise nothing', async () => {
  const project = await afterAnotherDocument();
  const STEADY = 'Your system asks for reduced motion, so Phosphor shows blinking cells without blinking: dark backgrounds, letters steady. Exported .ans and .xb files still blink.';
  const art = '\x1b[0m\x1b[5;37;44mAB\x1b[0m';
  const reduced = (on) => vi.spyOn(window, 'matchMedia').mockImplementation((query) => (query === '(prefers-reduced-motion: reduce)' ? { matches: on, media: query } : realMatchMedia(query)));
  const realMatchMedia = window.matchMedia.bind(window);
  const said = async (open, on) => {
    const motion = reduced(on);
    try {
      closeToast();
      await open();
      await settle(project);
      return toastMessage.value;
    } finally {
      motion.mockRestore();
    }
  };
  expect(await said(() => project.openArtFile(withRecord(art, 2)), true)).toBe(STEADY);
  expect(await said(() => project.openArtFile(withRecord(art, 2)), false)).toBeFalsy(); // it blinks: nothing to say
  expect(await said(() => project.openArtFile(withRecord(art, 3)), true)).toBeFalsy(); // iCE colors on: nothing blinks
  // A project saved with iCE colors off, opened again
  await project.openArtFile(withRecord(art, 2));
  await settle(project);
  const pho = new File([await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() })], 'blinks.pho');
  expect(await said(() => project.loadProject(pho), true)).toBe(STEADY);
  expect(await said(() => project.loadProject(pho), false)).toBeFalsy();
  closeToast();
});

test('iCE colors turned off in a new CGA drawing: its .ans and animated .ans leave out ESC[?33h and the flag, its XBin NON_BLINK', async () => {
  const project = await afterAnotherDocument();
  project.quantize = 'cga';
  await settle(project);
  project.sauceIceColors = false;
  const bytes = await exported(project);
  expect([latin(bytes).includes(ICE), readSauce(bytes).flags & 1]).toEqual([false, 0]);
  const spy = vi.spyOn(URL, 'createObjectURL');
  await project.exportAnimation('ansimation');
  const animated = new Uint8Array(await spy.mock.calls.at(-1)[0].arrayBuffer());
  spy.mockRestore();
  expect([latin(animated).includes(ICE), readSauce(animated).flags & 1]).toEqual([false, 0]);
  let blob;
  await project.exportFile('xb', { deliver: (b) => { blob = b; }, sauce: false });
  expect(readXBin(new Uint8Array(await blob.arrayBuffer()), 'a.xb').iceColors).toBe(false);
  // Limited count of 16: the setting stays, but nothing blinks there, so its XBin keeps 8 to 15 steady
  project.quantize = 'count';
  await settle(project);
  expect([project.sauceIceColors, project.blinkingBackgrounds]).toEqual([false, null]);
  await project.exportFile('xb', { deliver: (b) => { blob = b; }, sauce: false });
  expect(readXBin(new Uint8Array(await blob.arrayBuffer()), 'a.xb').iceColors).toBe(true);
  project.quantize = 'cga'; // back to 16: it's off again
  expect(project.blinkingBackgrounds?.get(PALETTES.cga[12].hex)).toBe(PALETTES.cga[4]);
});

test('an XBin without NON_BLINK opens with iCE colors off, its own 16 blinking, and exports without it again', async () => {
  const project = await afterAnotherDocument(), { font } = xbinFile();
  const ramp = Array.from({ length: 16 }, (_, i) => `#${(i * 16).toString(16).padStart(2, '0')}0000`); // not CGA: its own list
  const cells = [{ char: 'A', fg: plain(ramp[15]), bg: plain(ramp[9]) }, { char: 'B', fg: plain(ramp[15]), bg: plain(ramp[1]) }];
  const bytes = writeXBin({ cols: 2, rows: 1, cells, palette: ramp, font, iceColors: false }), own = readXBin(bytes, 'own.xb').palette; // in 6 bits a channel
  await project.openArtFile(new File([bytes], 'own.xb'));
  await settle(project);
  expect([project.quantize, project.sauceIceColors]).toEqual(['palette', false]);
  expect(project.blinkingBackgrounds.get(own[9])).toMatchObject({ hex: own[1] });
  let blob;
  await project.exportFile('xb', { deliver: (b) => { blob = b; }, sauce: false });
  const again = readXBin(new Uint8Array(await blob.arrayBuffer()), 'own.xb');
  expect([again.iceColors, again.cells.map((c) => c.bg)]).toEqual([false, [own[9], own[1]]]);
});

test('an XBin with a font, added to a drawing without one, brings its slot 0 in as a space; to a drawing with one, as ␀', async () => {
  const { project } = await createTestApp(), workspace = useWorkspaceStore();
  await project.setBlankCanvas({ cols: 10, rows: 10, withLayer: true });
  const font = { name: 'F', height: 16, bytes: new Uint8Array(16 * 256) };
  const cells = [SLOT_CHARS[0], 'A'].map((char) => ({ char, fg: plain('#aaaaaa'), bg: plain('#000000') }));
  const file = new File([writeXBin({ cols: 2, rows: 1, cells, palette: PALETTES.cga.map((c) => c.hex), font, sauce: false })], 'slot0.xb');
  const host = document.body.appendChild(document.createElement('div'));
  const app = createApp(EditWorkspace).use(i18n);
  app.mount(host);
  const add = async () => {
    await workspace.askArt(file, { at: { col: 0, row: 0 } });
    await nextTick();
    [...document.querySelectorAll('button.choice')].find((b) => b.textContent.includes('Add to this drawing')).click();
    await vi.waitFor(() => expect(workspace.selection).not.toBeNull());
    await settle(project);
  };
  try {
    await add();
    expect(project.cells.slice(0, 2).map((c) => c.char)).toEqual([' ', 'A']);
    workspace.selection = null;
    project.setDrawingFont(font);
    await add();
    expect(project.editCellAt(0, 0).char).toBe(SLOT_CHARS[0]);
  } finally {
    app.unmount();
    host.remove();
  }
});

test('a narrow font in use stays narrow through an .ans with no font of its own', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  const slim = { name: 'Slim', height: 7, bytes: Uint8Array.from({ length: 256 * 7 }, (_, i) => (i % 251) & 0xfe), blocks: [...CP437_BLOCKS] };
  await project.setDrawingFont({ ...slim, width: 7 });
  await project.openArtFile(new File(['hello'], 'note.ans'));
  expect(project.drawingFont.name).toBe('Slim');
  expect(project.fontWidth).toBe('7');
  expect(project.drawingFont.cellWidth).toBe(7);
});

const SLIM = () => ({ name: 'Slim', height: 7, bytes: Uint8Array.from({ length: 256 * 7 }, (_, i) => (i % 251) & 0xfe), blocks: [...CP437_BLOCKS] });
const withSpacing = (spacing) => artFile('s.ans', 4, 2, build(4, 2, 'cga', CHARS.ans), { colorMode: 'cga', sauce: { ...SAUCE, fontName: '', use9pxFont: spacing === 9, ...(spacing === 'none' && { flags: 0 }) } });

test('an .ans whose SAUCE says 9px opens 9 wide; one saying 8px opens a drawing that was at 9 at 8', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  await project.setDrawingFont({ ...SLIM(), width: 8 });
  await project.openArtFile(await withSpacing(9));
  await settle(project);
  expect([project.sauceLetterSpacing, project.drawingFont.cellWidth]).toEqual(['9', 9]);
  await project.openArtFile(await withSpacing(8));
  await settle(project);
  expect([project.sauceLetterSpacing, project.drawingFont.cellWidth]).toEqual(['8', 8]);
});

test('a narrow drawing exports Letter spacing 8px', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  await project.setDrawingFont({ ...SLIM(), width: 7 });
  project.sauceLetterSpacing = '9';
  expect(project.drawingFont.cellWidth).toBe(7);
  expect(readSauce(await exported(project)).flags & 6).toBe(2);
});

test('exported at 9, the .ans opens again at 9', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  await project.setDrawingFont({ ...SLIM(), width: 8 });
  await project.setDrawingFontWidth(9);
  const bytes = await exported(project);
  expect(readSauce(bytes).flags & 6).toBe(4);
  await project.setDrawingFontWidth(8);
  await project.openArtFile(new File([bytes], 'again.ans'));
  await settle(project);
  expect(project.drawingFont.cellWidth).toBe(9);
});

// A render that lands after the grid changed under it: two XBins opened one after the other, the second wider, while
// the first's render was still running. Its cells were one grid's, composed against the next one's columns, and the
// pin the second file put at column 1 read past their end (an unhandled "reading 'fg'"). They're left for the render
// the change queued, which composes the right ones.
test('a render that lands after a file of another size opened composes nothing, and the next one draws the new file', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  await settle(project);
  const real = project.renderer.render.bind(project.renderer);
  let release, held = false;
  const gate = new Promise((resolve) => { release = resolve; });
  project.renderer.render = async (...args) => {
    const out = await real(...args);
    if (!held && args[1].cols === 1) { held = true; await gate; } // the first file's render, held until the second has opened
    return out;
  };
  const errors = [], caught = (event) => { errors.push(String(event.reason)); event.preventDefault(); };
  window.addEventListener('unhandledrejection', caught);
  const cells = [{ char: 'A', fg: { r: 255, g: 255, b: 255 }, bg: { r: 0, g: 0, b: 0 } }];
  const palette = Array.from({ length: 16 }, () => '#000000');
  await project.openArtFile(new File([writeXBin({ cols: 1, rows: 1, cells, palette, font: { name: 'Solid', height: 16, bytes: new Uint8Array(16 * 256).fill(255) } })], 'one.xb'));
  await vi.waitFor(() => expect(held).toBe(true));
  project.renderer.render = real;
  // XBIN, 1A, 2 columns, 1 row, height 16, no flags, then each cell's character and attribute
  await project.openArtFile(new File([Uint8Array.of(0x58, 0x42, 0x49, 0x4e, 0x1a, 2, 0, 1, 0, 16, 0, 65, 7, 66, 7)], 'two.xb'));
  release();
  await settle(project);
  window.removeEventListener('unhandledrejection', caught);
  expect(errors).toEqual([]);
  expect(project.cells.map((c) => c.char)).toEqual(['A', 'B']);
});

// Open as an image: the file's cells drawn into the source image as glyph pixels, nothing pinned and no pixels of the
// base's own, Choose characters on By shape with the file's own characters, so the image filters work on it.
const fileChars = (art) => [...new Set(art.cells.map((cell) => cell.char))].sort().join('');
const sortedChars = (chars) => [...new Set(chars)].sort().join('');
// A cell's look: a space shows its background, a full block or a character in one color its foreground, and ▀ and ▐
// are ▄ and ▌ with their colors swapped, so each of those pairs is one look.
const lookOf = (char, fg, bg) => {
  [fg, bg] = [fg.toLowerCase(), bg.toLowerCase()];
  if (char === ' ') return `solid ${bg}`;
  if (char === '█' || fg === bg) return `solid ${fg}`;
  if (char === '▀' || char === '▐') return `${char === '▀' ? '▄' : '▌'} ${bg} ${fg}`;
  return `${char} ${fg} ${bg}`;
};
// The share of cells that show the file's look.
const sameLooks = (project, art) => art.cells.filter((cell, i) => {
  const shown = project.cells[i];
  return lookOf(shown.char, shown.fg.hex, shown.bg.hex) === lookOf(cell.char, cell.fg, cell.bg);
}).length / art.cells.length;
async function openAsPicture(file, { project = null } = {}) {
  project ??= await afterAnotherDocument();
  const art = readArtFile(new Uint8Array(await file.arrayBuffer()), file.name);
  await project.openArtFile(file, { layer: 'picture' });
  await settle(project);
  return { project, art };
}
// What a picture opened as an image holds, and that Blur changes what it shows.
async function expectPicture(project, art) {
  expect([project.cols, project.rows]).toEqual([art.cols, 2 * art.rows]);
  expect(project.baseRecords.pins.size).toBe(0);
  expect(!!project.baseLayer?.hasPaint).toBe(false);
  expect(project.layers.length).toBe(1); // the base alone, as a picture opens
  expect([project.charChoice, project.charChoiceAscii]).toEqual(['shape', 'shape']);
  expect([sortedChars(project.chars), sortedChars(project.charsAscii)]).toEqual([fileChars(art), fileChars(art)]);
  expect(project.history.canUndo).toBe(false);
  expect(project.isDirty).toBe(false);
  const before = cellsKey(project);
  project.blur = 3;
  await settle(project);
  expect(cellsKey(project)).not.toEqual(before);
}
// The picture's pixels.
function pictureData(project) {
  const { naturalWidth: w, naturalHeight: h } = project.image;
  const ctx = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d');
  ctx.drawImage(project.image, 0, 0);
  return ctx.getImageData(0, 0, w, h);
}
const pastTheEdge = async () => new File([await (await fetch('/tests/fixtures/ansi/past-the-edge.ans')).blob()], 'past-the-edge.ans');
const kanFile = () => new File(['a 漢 b c\n d 漢 ef\n漢 gh  \n'], 'kan.utf8ans');

test('opened as an image, an .ans is a picture of its cells: nothing pinned, By shape with its own characters, filters work', async () => {
  const { project, art } = await openAsPicture(await pastTheEdge());
  expect(project.quantize).toBe('cga');
  expect(project.filename).toBe('past-the-edge');
  await expectPicture(project, art);
});

test('opened as an image, a wide character is drawn across both its cells', async () => {
  const { project, art } = await openAsPicture(kanFile());
  expect(fileChars(art)).toContain('漢');
  const image = pictureData(project), m = image.width / art.cols;
  // the 漢 at column 2 of the first line: its trail (column 3) holds ink, the foreground mixed into black
  let ink = 0;
  for (let y = 0; y < 2 * m; y++) for (let x = 3 * m; x < 4 * m; x++) ink += image.data[(y * image.width + x) * 4];
  expect(ink).toBeGreaterThan(0);
  await expectPicture(project, art);
});

// The plan predicted 9 cells in 10 would come back as the file has them. Measured on past-the-edge.ans, 1,208 of 1,440
// do (0.839), with Solids at 25% or 0: By shape samples a cell 4 by 8, which averages the shades (░ ▒ ▓) into solids,
// and in ANSI its foreground fit pulls a thin character's color toward the background's (■, letters). So it holds what
// By shape can draw exactly, the cells whose ink stops at a grid pixel's edge (a space, █, ▀, ▄), every one; and a floor
// for the whole file just under what was measured. ▌ and ▐ split a grid pixel down the middle, which at this file's
// processing scale (5 pixels a grid pixel) is 2.5 pixels, so they blur at the edge too (21 of their 38 cells differ).
test('opened as an image, the cells By shape draws exactly come back as the file has them, and most of the rest do', async () => {
  const { project, art } = await openAsPicture(await pastTheEdge());
  const looks = art.cells.map((cell, i) => {
    const shown = project.cells[i];
    return { char: cell.char, file: lookOf(cell.char, cell.fg, cell.bg), shown: lookOf(shown.char, shown.fg.hex, shown.bg.hex), at: i };
  });
  const exact = looks.filter(({ char }) => [' ', '█', '▀', '▄'].includes(char));
  expect(exact.length).toBeGreaterThan(1000);
  expect(exact.filter(({ file, shown }) => file !== shown)).toEqual([]);
  expect(sameLooks(project, art)).toBeGreaterThanOrEqual(0.82);
});

// Slot 0 (␀) comes in only with an XBin's own font, which the drawing opens in, so there it's the font's glyph; with no
// font the reader gives byte 0 as CP437's space. (A paste maps ␀ to a space because the drawing may have no font.)
test('opened as an image, an XBin\'s byte 0 is a space with no font, and its font\'s slot 0 with one', async () => {
  // XBIN, 1A, 2 columns, 1 row, height 16, no flags, then byte 0 and A, each white on blue
  const bare = new File([Uint8Array.of(0x58, 0x42, 0x49, 0x4e, 0x1a, 2, 0, 1, 0, 16, 0, 0, 0x1f, 65, 0x1f)], 'zero.xb');
  const { project } = await openAsPicture(bare);
  expect(project.drawingFont).toBeNull();
  expect(sortedChars(project.chars)).toBe(sortedChars(' A'));
  const image = pictureData(project), m = image.width / 2;
  for (let y = 0; y < 2 * m; y++) for (let x = 0; x < m; x++) expect([...image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 3)], `${x}, ${y}`).toEqual([0, 0, 0xaa]);

  const font = solidAFont();
  font.bytes.fill(0xff, 0, 8); // slot 0 drawn solid
  const cells = [SLOT_CHARS[0], 'A'].map((char) => ({ char, fg: plain('#ffffff'), bg: plain('#0000aa') }));
  const withFont = new File([writeXBin({ cols: 2, rows: 1, cells, palette: PALETTES.cga.map((c) => c.hex), font, sauce: false })], 'slot0.xb');
  const { project: opened } = await openAsPicture(withFont);
  expect(opened.chars).toContain(SLOT_CHARS[0]);
  const drawn = pictureData(opened), n = drawn.width / 2;
  for (let y = 0; y < 2 * n; y++) for (let x = 0; x < n; x++) expect(drawn.data[(y * drawn.width + x) * 4], `${x}, ${y}`).toBe(255); // the font's slot 0, solid white
});

// An XBin's own font, 8 high (a cell half as tall as it is wide in grid pixels), with only A of the letters drawn, solid.
function solidAFont() {
  const bytes = new Uint8Array(8 * 256);
  const rows = (slot, fill) => fill.forEach((byte, y) => { bytes[slot * 8 + y] = byte; });
  rows(65, Array(8).fill(0xff));
  rows(219, Array(8).fill(0xff));
  rows(220, [0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff]);
  rows(223, [0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0]);
  rows(221, Array(8).fill(0xf0));
  rows(222, Array(8).fill(0x0f));
  return { name: 'Solid A', height: 8, bytes };
}

test('opened as an image, an XBin is drawn in its own font, and its cells land on the grid\'s in a cell of another shape', async () => {
  const white = plain('#ffffff'), black = plain('#000000');
  const cells = Array.from({ length: 8 }, (_, i) => ({ char: i === 7 ? 'A' : ' ', fg: white, bg: black })); // A at the bottom right
  const file = new File([writeXBin({ cols: 4, rows: 2, cells, palette: PALETTES.cga.map((c) => c.hex), font: solidAFont(), sauce: false })], 'solid.xb');
  const { project } = await openAsPicture(file);
  expect(project.drawingFont?.height).toBe(8); // the file's font (named for the file)
  expect(project.pixelAspect).toBe(0.5);
  const image = pictureData(project), m = image.width / 4;
  for (let y = 2 * m; y < 4 * m; y++) for (let x = 3 * m; x < 4 * m; x++) expect(image.data[(y * image.width + x) * 4], `${x}, ${y}`).toBe(255); // the font's A, solid
  expect(project.cells.map((cell) => lookOf(cell.char, cell.fg.hex, cell.bg.hex) === 'solid #000000')).toEqual([true, true, true, true, true, true, true, false]);
});

test('opened as an image, a full-color .utf8ans opens with By shape and its own characters, not a blank grid', async () => {
  const cols = 12, rows = 4, cells = build(cols, rows, 'none', CHARS.utf8ans);
  const file = await artFile('color.utf8ans', cols, rows, cells, { utf8: true, colorMode: 'none' });
  const { project, art } = await openAsPicture(file);
  expect(project.quantize).toBe('none');
  expect([project.charChoice, project.charChoiceAscii]).toEqual(['shape', 'shape']);
  expect(sortedChars(project.chars)).toBe(fileChars(art));
  expect(project.cells).toHaveLength(cols * rows);
  expect(project.cells.some((cell) => cell.char !== ' ' || cell.bg.hex.toLowerCase() !== '#000000')).toBe(true);
});

test('opened as an image, a file of 5,000 lines opens at one pixel a grid pixel', async () => {
  const file = new File([Array.from({ length: 5000 }, (_, i) => (i % 2 ? 'ab' : 'c ')).join('\n')], 'tall.txt');
  const { project } = await openAsPicture(file);
  expect([project.cols, project.rows]).toEqual([2, 10_000]);
  expect(blankScale(2, 10_000)).toBe(1);
  expect([project.image.naturalWidth, project.image.naturalHeight]).toEqual([2, 10_000]);
  expect(project.charChoice).toBe('shape');
  expect(project.baseRecords.pins.size).toBe(0);
});

test('the art question offers Open as an image: from the start screen beside edit and base, on a drawing after them', async () => {
  const { project } = await createTestApp(), workspace = useWorkspaceStore();
  const host = document.body.appendChild(document.createElement('div'));
  const app = createApp(EditWorkspace).use(i18n);
  app.mount(host);
  const titles = () => [...document.querySelectorAll('button.choice b')].map((b) => b.textContent.trim());
  const file = new File(['ab\ncd'], 'boat.txt');
  try {
    await workspace.askArt(file);
    await nextTick();
    expect(titles()).toEqual(['Edit artwork', 'Draw on top', 'Open as an image']);
    [...document.querySelectorAll('button.choice')].find((b) => b.textContent.includes('Open as an image')).click();
    await vi.waitFor(() => expect(project.filename).toBe('boat'));
    await settle(project);
    expect(project.charChoice).toBe('shape');
    expect(project.baseRecords.pins.size).toBe(0);
    await workspace.askArt(file);
    await nextTick();
    expect(titles()).toEqual(['Add to this drawing', 'Open to edit', 'Open to draw on top', 'Open as an image']);
  } finally {
    app.unmount();
    host.remove();
  }
});
