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
import { readSauce } from '@/lib/Sauce';
import { readXBin, writeXBin } from '@/lib/XBinFile';
import { SLOT_CHARS } from '@/lib/BitmapFont';
import { closeToast, toastMessage } from '@/composables/useToast';
import { slidersAtDefaults } from '@/store/settings';

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
  const cells = Array.from({ length: 6 }, (_, i) => ({ char: i % 2 ? 'A' : ' ', fg: palette[1], bg: palette[0] }));
  const font = { name: 'Solid', height: 16, bytes };
  return { file: new File([writeXBin({ cols: 3, rows: 2, cells, palette, font })], name), font };
};

test('an XBin opens with its font and palette', async () => {
  const project = await afterAnotherDocument(), { file, font } = xbinFile();
  await project.openArtFile(file);
  await settle(project);
  expect(project.drawingFont.bytes).toEqual(font.bytes);
  expect(project.drawingFont.height).toBe(16);
  expect([project.cols, project.rows]).toEqual([3, 4]);
  expect(project.quantize).toBe('palette');
  expect(project.palette).toBe(readXBin(new Uint8Array(await file.arrayBuffer()), 'f.xb').palette.join(' ')); // the file's 6-bit colors
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
    await project.openArtFile(new File([writeXBin({ cols: 1, rows: 1, cells: [{ char: 'A', fg: dos[7], bg: dos[0] }], palette, font })], 'p.xb'));
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

test('opens an XBin and exports the same cells', async () => {
  const project = await afterAnotherDocument(), { font } = xbinFile();
  const dos = [0, 4, 2, 6, 1, 5, 3, 7, 8, 12, 10, 14, 9, 13, 11, 15].map((i) => PALETTES.cga[i].hex);
  const cells = [SLOT_CHARS[0], ' ', SLOT_CHARS[255], 'A', SLOT_CHARS[0], ' '].map((char, i) => ({ char, fg: dos[(i + 1) % 16], bg: dos[i] }));
  const bytes = writeXBin({ cols: 3, rows: 2, cells, palette: dos, font });
  await project.openArtFile(new File([bytes], 'f.xb'));
  await settle(project);
  expect(project.quantize).toBe('cga');
  let blob;
  await project.exportFile('xb', { deliver: (b) => { blob = b; }, sauce: false });
  const again = readXBin(new Uint8Array(await blob.arrayBuffer()), 'f.xb');
  const first = readXBin(bytes, 'f.xb');
  expect(again.cells).toEqual(first.cells);
  expect(again.palette).toEqual(first.palette);
  expect([...again.font.bytes]).toEqual([...first.font.bytes]);
  await project.openArtFile(new File([blob], 'again.xb'));
  await settle(project);
  expect(project.quantize).toBe('cga'); // DOS order out, recognized as CGA again
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
