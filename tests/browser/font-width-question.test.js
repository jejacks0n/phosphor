// A font narrower than 8 that becomes the drawing's font by your hand is drawn at its own width and asks, once per
// font, whether to keep that width or draw it 8 wide; the browser's copy of the font remembers the answer.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestApp } from '../support/app.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { useFontActions } from '@/composables/useFontActions.js';
import { askFontWidth } from '@/composables/useFontWidth.js';
import { toastMessage, toastAction, toastSecond, closeToast } from '@/composables/useToast.js';
import { addBitmapFont, loadFonts, removeFont, storedBitmapFont, storeFontPart } from '@/lib/userFonts.js';
import { blocksOf, fontId } from '@/lib/BitmapFont.js';
import { fontWith } from '../support/blockFonts.js';
import { useFontSetup } from '@/composables/useFontSetup.js';
import { effectScope, nextTick } from 'vue';
import { writeXBin } from '@/lib/XBinFile.js';
import { AnsiFile } from '@/lib/AnsiFile.js';
import { forgetLibrary } from '@/lib/fontLibrary.js';

// The fonts kept in a store of this file's own: other files, run beside it in the same browser, empty the shared one.
// refused: the store won't open, as when the browser's storage is full or blocked.
const shared = indexedDB;
let refused = false, scope = null;
beforeEach(() => vi.stubGlobal('indexedDB', {
  open: (name, version) => {
    if (refused && name === 'phosphor-fonts') throw new DOMException('Storage is full.', 'QuotaExceededError');
    return shared.open(name === 'phosphor-fonts' ? 'phosphor-fonts-width-question' : name, version);
  },
  deleteDatabase: (name) => shared.deleteDatabase(name),
}));
afterEach(async () => {
  refused = false;
  scope?.stop();
  scope = null;
  for (const font of await loadFonts()) await removeFont(font.id);
  vi.unstubAllGlobals();
  forgetLibrary();
  closeToast();
});

// Its bit 0 is never lit, so its own width is 7; its full, lower and upper blocks are where CP437 puts them (lower: false,
// none at all).
const rows = (from, to) => (h) => Array.from({ length: h }, (_, r) => (r >= from(h) && r < to(h) ? 0xfe : 0));
const slim = ({ lower = true } = {}) => ({
  ...fontWith({ 219: rows(() => 0, (h) => h), 220: lower ? rows((h) => Math.floor(h / 2), (h) => h) : rows(() => 0, () => 0), 223: rows(() => 0, (h) => Math.floor(h / 2)) }, 7),
  name: 'Slim',
});
const QUESTION = 'Slim is 7 pixels wide.';

async function blank() {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  workspace.userFonts = await loadFonts();
  return { project, workspace };
}
// Slim kept in Yours, unanswered: its id.
async function inYours(workspace) {
  const stored = await addBitmapFont(new File([slim().bytes], 'Slim.F07'));
  workspace.userFonts = await loadFonts();
  return stored.id;
}
// The answer as the browser's copy keeps it and Yours lists it; written after the step, so waited for (a busy machine's
// store can take over a second).
const kept = async (id, width) => {
  await vi.waitFor(async () => expect((await storedBitmapFont(id)).width).toBe(width), { timeout: 5000 });
  await vi.waitFor(() => expect(useWorkspaceStore().userFonts.find((f) => f.id === id).width).toBe(width), { timeout: 5000 });
};
const asked = () => {
  expect(toastMessage.value).toBe(QUESTION);
  expect(toastAction.value.label).toBe('Draw it 7 wide');
  expect(toastSecond.value.label).toBe('Keep it 8 wide');
};
const xbin = (name = 'Slim.xb', font = slim()) => {
  const palette = Array.from({ length: 16 }, (_, i) => '#' + (i * 16 + 8).toString(16).padStart(2, '0').repeat(3));
  const ink = { r: 255, g: 255, b: 255 }, paper = { r: 0, g: 0, b: 0 };
  const cells = Array.from({ length: 4 }, () => ({ char: 'A', fg: ink, bg: paper }));
  return new File([writeXBin({ cols: 2, rows: 2, cells, palette, font })], name);
};

test('choosing a narrow font with no answer draws it narrow and asks; Draw it 7 wide keeps 7 and remembers it', async () => {
  const { project, workspace } = await blank();
  const id = await inYours(workspace), { choose } = useFontActions();
  await choose(id);
  expect(project.fontWidth).toBe('7');
  expect(project.drawingFont.cellWidth).toBe(7);
  asked();
  await toastAction.value.run();
  expect(project.fontWidth).toBe('7');
  await kept(id, 7);
  closeToast();
  await choose(id);
  expect(toastMessage.value).toBe(null);
  expect(project.drawingFont.cellWidth).toBe(7);
});

test('Keep it 8 wide draws at 8 and remembers it; choosing the font again asks nothing', async () => {
  const { project, workspace } = await blank();
  const id = await inYours(workspace), { choose } = useFontActions();
  await choose(id);
  await toastSecond.value.run();
  expect(project.fontWidth).toBe('');
  expect(project.drawingFont.cellWidth).toBe(8);
  await kept(id, 8);
  closeToast();
  await choose('jetbrains');
  await choose(id);
  expect(toastMessage.value).toBe(null);
  expect(project.drawingFont.cellWidth).toBe(8);
});

test('closing the question unanswered asks again next time', async () => {
  const { project, workspace } = await blank();
  const id = await inYours(workspace), { choose } = useFontActions();
  await choose(id);
  asked();
  closeToast();
  expect((await storedBitmapFont(id)).width).toBeUndefined();
  expect(project.drawingFont.cellWidth).toBe(7); // narrow meanwhile
  await choose(id); // the drawing's own font again (Ruling 4)
  asked();
  closeToast();
  await choose('jetbrains');
  await choose(id);
  asked();
});

test('a narrow font not in Yours is added to Yours when answered', async () => {
  const { project, workspace } = await blank();
  await project.openArtFile(xbin());
  asked();
  expect(workspace.userFonts.some((f) => f.id === fontId(slim()))).toBe(false);
  await toastAction.value.run();
  await kept(fontId(slim()), 7);
  expect(project.drawingFont.cellWidth).toBe(7);
});

test('opening an XBin in a narrow font asks; one in a font answered before doesn\'t', async () => {
  const { project, workspace } = await blank();
  await project.openArtFile(xbin());
  expect(project.fontWidth).toBe('7');
  expect(project.drawingFont.cellWidth).toBe(7);
  asked();
  closeToast();
  const id = await inYours(workspace);
  await storeFontPart(id, 'width', 8);
  workspace.userFonts = await loadFonts();
  await project.openArtFile(xbin('Slim again.xb'));
  expect(toastSecond.value).toBe(null); // no question (only what blocks it lacks)
  expect(project.fontWidth).toBe('');
  expect(project.drawingFont.cellWidth).toBe(8);
  await storeFontPart(id, 'width', 7);
  workspace.userFonts = await loadFonts();
  await project.openArtFile(xbin('Slim third.xb'));
  expect(toastSecond.value).toBe(null);
  expect(project.drawingFont.cellWidth).toBe(7);
});

test('opening an .ans whose SAUCE names a narrow library font opens it narrow and asks', async () => {
  const { project } = await blank();
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', async (url, ...rest) => {
    if (!String(url).includes('fonts/library/')) return real(url, ...rest);
    if (String(url).endsWith('sauce.json')) return { ok: true, json: async () => ({ Slim: { file: 'viler/Slim.F07', name: 'Slim', height: 7 } }) };
    return { ok: true, arrayBuffer: async () => slim().bytes.buffer };
  });
  const ink = { r: 255, g: 255, b: 255 }, paper = { r: 0, g: 0, b: 0 };
  const sauce = { title: '', author: '', group: '', date: '', fontName: 'Slim', use9pxFont: false, comments: [] };
  await project.openArtFile(new File([new AnsiFile(1, 1, [{ char: 'A', fg: ink, bg: paper }]).toBlob({ colorMode: 'cga', sauce })], 'art.ans'));
  expect(project.drawingFont.name).toBe('Slim');
  expect(project.drawingFont.cellWidth).toBe(7);
  asked();
});

test('in someone else\'s room nothing is asked', async () => {
  const { project, workspace } = await blank();
  await project.setDrawingFont(slim());
  project.startSharing({ send: () => {}, role: 'artist', me: 'u_5' });
  workspace.roomFont = project.drawingFont; // the host's, as an artist drawing with them takes it
  try {
    askFontWidth(project.drawingFont);
    expect(toastMessage.value).toBe(null);
  } finally {
    project.stopSharing();
  }
});

// Ruling 6: "Set up its blocks" has the one toast; the width is asked once the font has a lower half.
test('a narrow font with no lower half, chosen or opened as an XBin, says to set up its blocks and doesn\'t ask', async () => {
  const { project, workspace } = await blank();
  scope = effectScope();
  scope.run(() => useFontSetup());
  const bare = slim({ lower: false });
  expect(blocksOf(bare)[1]).toBe(null);
  const stored = await addBitmapFont(new File([bare.bytes], 'Slim.F07'));
  workspace.userFonts = await loadFonts();
  await useFontActions().choose(stored.id);
  await nextTick();
  expect(project.drawingFont.cellWidth).toBe(7); // narrow meanwhile, unanswered
  expect(toastMessage.value).toBe('This drawing’s font, Slim, has no lower half block, so it can’t be painted in yet.');
  expect(toastSecond.value).toBe(null);
  closeToast();
  await project.openArtFile(xbin('Slim.xb', bare));
  await nextTick();
  expect(project.drawingFont.cellWidth).toBe(7);
  expect(toastMessage.value).toBe('This drawing’s font, Slim, has no lower half block, so it can’t be painted in yet.');
  expect((await storedBitmapFont(stored.id)).width).toBeUndefined();
});

test('an answer the browser can\'t keep still sets the width, and says it wasn\'t kept', async () => {
  const { project } = await blank();
  await project.openArtFile(xbin()); // not in Yours: the answer adds it
  asked();
  refused = true;
  await toastSecond.value.run();
  expect(project.drawingFont.cellWidth).toBe(8);
  expect(project.canUndo).toBe(true);
  expect(toastMessage.value).toBe('This browser couldn’t keep Slim, so it will ask its width again next time.');
});

test('with no drawing nothing is asked', async () => {
  const { project } = await createTestApp();
  expect(await project.setDrawingFont(slim())).toEqual({ ask: true });
  askFontWidth(slim());
  expect(toastMessage.value).toBe(null);
});

test('an answer given after the drawing\'s font changed does nothing', async () => {
  const { project, workspace } = await blank();
  const id = await inYours(workspace), { choose } = useFontActions();
  await choose(id);
  const { run } = toastAction.value;
  await choose('jetbrains');
  await run();
  expect(project.drawingFont).toBeNull();
  expect((await storedBitmapFont(id)).width).toBeUndefined();
});

// Ruling 5: an undo or redo never writes an answer the person didn't give.
test('choosing an unanswered narrow font and undoing it leaves the copy unanswered', async () => {
  const { project, workspace } = await blank();
  const id = await inYours(workspace), { choose } = useFontActions();
  await choose(id);
  project.undo();
  project.redo();
  project.undo();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect((await storedBitmapFont(id)).width).toBeUndefined();
});

for (const drawn of [false, true]) {
  test(`undoing an answer leaves the copy unanswered, and redo answers again${drawn ? ', with art' : ''}`, async () => {
    const { project, workspace } = await blank();
    const id = await inYours(workspace), { choose } = useFontActions();
    await choose(id);
    if (drawn) project.writeEditCells([{ col: 1, row: 1, attrs: { char: 'A' } }]); // the answer keeps the grid (fontStep), not a refit
    const lines = project.rows;
    await toastSecond.value.run(); // keep 8
    expect(project.rows === lines).toBe(drawn);
    await kept(id, 8);
    project.undo();
    expect(project.drawingFont.cellWidth).toBe(7);
    await kept(id, undefined);
    project.redo();
    await kept(id, 8);
    project.undo();
    await kept(id, undefined);
    await choose(id); // unanswered again: asked again
    asked();
  });
}
