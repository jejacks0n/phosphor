// The drawing's bitmap font as document state: one undo step, saved with the project, kept by a new blank canvas.
import { test, it, expect, afterEach, vi } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { readXBin, writeXBin } from '@/lib/XBinFile.js';
import { readProject, writeProject } from '@/document/projectIO.js';
import { fontId, encodeFont, fontChars, findBlocks, CP437_BLOCKS, slotOf, blocksOf, withBlock, fontKey, encodeBlocks } from '@/lib/BitmapFont.js';
import { cp437Font, lowerAt240 } from '../support/blockFonts.js';
import { DISPLAY_FONT, drawGlyph, setDisplayFont } from '@/lib/displayFonts.js';
import { measureAdvance } from '@/lib/CellCanvas.js';
import { registerBitmapFont, addBitmapFont, loadFonts, removeFont, storedBitmapFont, storeFontPart } from '@/lib/userFonts.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { useFontActions } from '@/composables/useFontActions.js';
import { AnsiFile } from '@/lib/AnsiFile.js';
import { Sauce } from '@/lib/Sauce.js';
import { forgetLibrary } from '@/lib/fontLibrary.js';
import { closeToast, toastMessage } from '@/composables/useToast.js';
import { settingsFromStranger } from '@/store/settings.js';
import { encodeSets } from '@/lib/FontLines.js';
import { coverageOf, setGlyphRasterizer, rasterizeCoverage, useBitmapCoverage, vgaBitmapFont } from '@/lib/GlyphCoverage.js';

afterEach(async () => {
  vi.unstubAllGlobals();
  forgetLibrary();
  await setDisplayFont('jetbrains');
  setGlyphRasterizer(rasterizeCoverage);
});

// Test fonts say where their blocks are (CP437's): their glyphs are noise, in which none would be found.
const font = () => ({ name: 'Topaz', height: 8, bytes: Uint8Array.from({ length: 256 * 8 }, (_, i) => i % 251), blocks: [...CP437_BLOCKS] });

async function blank() {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  return project;
}

test('setDrawingFont is one undo step', async () => {
  const project = await blank();
  const f = font();
  project.setDrawingFont(f);
  expect(project.drawingFont.height).toBe(8);
  expect(project.drawingFont.name).toBe('Topaz');
  expect([...project.drawingFont.bytes]).toEqual([...f.bytes]);
  project.undo();
  expect(project.drawingFont).toBeNull();
  expect(project.fontBitmap).toBe('');
  project.redo();
  expect([...project.drawingFont.bytes]).toEqual([...f.bytes]);
  const version = project.history.version;
  project.setDrawingFont(f);
  expect(project.history.version).toBe(version);
});

test('saves and restores the font with the project', async () => {
  const project = await blank();
  const f = font();
  project.setDrawingFont(f);
  const file = new File([await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() })], 'a.phosphor');
  const { project: other } = await createTestApp();
  await other.openParts(await readProject(file), { filename: 'other' });
  expect([...other.drawingFont.bytes]).toEqual([...f.bytes]);
  expect(other.drawingFont.name).toBe('Topaz');
});

test('a font chosen before any drawing is the blank canvas\'s, with nothing to undo', async () => {
  const { project } = await createTestApp();
  const version = project.history.version;
  project.setDrawingFont(font());
  expect(project.drawingFont.name).toBe('Topaz');
  expect(project.history.version).toBe(version);
  expect(project.canUndo).toBe(false);
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  expect(project.drawingFont.name).toBe('Topaz');
});

test('the font in use stays through a new blank canvas, an ANSI file, and a project without a font of its own', async () => {
  const project = await blank();
  project.setDrawingFont(font());
  project.clearImage(); // New
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  expect(project.drawingFont.name).toBe('Topaz');
  await project.openArtFile(new File(['hello'], 'note.ans'));
  expect(project.drawingFont.name).toBe('Topaz');
  const { project: plain } = await createTestApp();
  await plain.setBlankCanvas({ cols: 4, rows: 4 });
  const file = new File([await writeProject({ imageBuffer: plain.imageBuffer, ...await plain.projectParts() })], 'plain.phosphor');
  await project.openParts(await readProject(file), { filename: 'plain' });
  expect(project.drawingFont.name).toBe('Topaz');
});

test('an XBin brings its own font, or IBM VGA when it has none', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  project.setDrawingFont(font());
  const palette = Array.from({ length: 16 }, () => '#000000'), solid = { name: 'Solid', height: 16, bytes: new Uint8Array(16 * 256).fill(255) };
  const cells = [{ char: 'A', fg: { r: 255, g: 255, b: 255 }, bg: { r: 0, g: 0, b: 0 } }];
  await project.openArtFile(new File([writeXBin({ cols: 1, rows: 1, cells, palette, font: solid })], 'own.xb'));
  expect(project.drawingFont.name).toBe('own'); // an XBin's font is named for its file
  // XBIN, 1A, 2 columns, 1 row, height 16, no flags (no palette, no font), then each cell's character and attribute
  await project.openArtFile(new File([Uint8Array.of(0x58, 0x42, 0x49, 0x4e, 0x1a, 2, 0, 1, 0, 16, 0, 65, 7, 66, 7)], 'plain.xb'));
  expect(project.drawingFont).toBeNull();
  expect(workspace.displayFont).toBe('vga');
});

it('draws in the drawing\'s font', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  const f = font();
  project.setDrawingFont(f);
  const spec = workspace.displayFontSpec;
  expect(spec.bitmap).toBe(true);
  expect(spec.size).toBe(8);
  expect(spec.family).toContain(fontId(f));
  await setDisplayFont(spec);
  expect(measureAdvance(DISPLAY_FONT)).toBe(8);
});

it('fitCells swaps what the font lacks', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 10, rows: 10, withLayer: true }); // a layer to type on
  // 16 high, as none is: with frames a font of another height is refused.
  project.setDrawingFont({ ...font(), height: 16, bytes: Uint8Array.from({ length: 256 * 16 }, (_, i) => i % 251) });
  await settle(project);
  project.writeEditCells([{ col: 0, row: 0, attrs: { char: '▙' } }]);
  project.commitEdit();
  await settle(project);
  expect(project.cells[0].char).toBe('▄');
  expect(project.editCellAt(0, 0).char).toBe('▙');
  project.addFrame('duplicate');
  expect((await project.builtFrame(1)).cells[0].char).toBe('▄'); // a frame built for playing, the same
  project.setDrawingFont(null);
  await settle(project);
  expect(project.cells[0].char).toBe('▙');
  expect((await project.builtFrame(1)).cells[0].char).toBe('▙'); // built again for the font gone
});

it('measures coverage from the font\'s pixels', () => {
  const f = { name: 'Solid space', height: 8, bytes: new Uint8Array(256 * 8), blocks: [...CP437_BLOCKS] };
  f.bytes.fill(0xff, 32 * 8, 33 * 8);
  useBitmapCoverage(f); // as App.vue installs it
  expect(coverageOf(' ')).toEqual([1, 1]);
  expect(coverageOf('█')).toEqual([0, 0]); // a block too: this font's is blank
  expect(coverageOf('▙')).toEqual(coverageOf('▄')); // no slot: measured as its stand-in, the ▄ the ANSI view shows
  expect(coverageOf('▄')).toEqual([0, 0]);
  const spec = { id: fontId(f), name: f.name, family: 'monospace', size: 8, lineHeight: 1, bitmap: true, source: encodeFont(f), blocks: encodeBlocks(f.blocks) };
  expect(drawGlyph('▙', 8, 8, 1, '#fff', false, spec)).toEqual(drawGlyph('▄', 8, 8, 1, '#fff', false, spec)); // drawn as it, too
});

it('draws a bitmap glyph exactly, sharp or smooth', () => {
  const f = { name: 'Checks', height: 16, bytes: new Uint8Array(256 * 16) };
  for (let r = 0; r < 16; r++) f.bytes[65 * 16 + r] = r % 2 ? 0x55 : 0xaa;
  const spec = { id: fontId(f), name: f.name, family: 'monospace', size: 16, lineHeight: 1, bitmap: true, source: encodeFont(f) };
  const bit = (x, y) => (f.bytes[65 * 16 + y] >> (7 - x)) & 1;
  for (const [w, h, scale] of [[8, 16, 1], [16, 32, 2]]) {
    for (const smooth of [false, true]) {
      const data = drawGlyph('A', w, h, scale, '#fff', smooth, spec);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4, on = bit(Math.floor(x / scale), Math.floor(y / scale));
          expect([data[i], data[i + 3]], `${w}x${h} ${smooth} at ${x},${y}`).toEqual(on ? [255, 255] : [data[i], 0]);
        }
      }
    }
  }
});

it('a font after a bitmap one draws in its own glyphs, the bitmap\'s gone', async () => {
  const f = { name: 'Solid', height: 16, bytes: new Uint8Array(256 * 16).fill(0xff) };
  const spec = { id: fontId(f), name: f.name, family: 'monospace', size: 16, lineHeight: 1, bitmap: true, source: encodeFont(f) };
  await setDisplayFont(spec);
  const lit = (data) => data.filter((_, i) => i % 4 === 3 && data[i]).length;
  expect(lit(drawGlyph('A', 8, 16))).toBe(8 * 16); // every pixel of the solid glyph
  await setDisplayFont('jetbrains');
  expect(DISPLAY_FONT.bitmap).toBeUndefined();
  expect(DISPLAY_FONT.source).toBeUndefined();
  const n = lit(drawGlyph('A', 8, 16));
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(8 * 16); // JetBrains Mono's A, not a solid block
});

it('registering a font twice at once adds one face', async () => {
  const f = { name: 'Twice', height: 8, bytes: Uint8Array.from({ length: 256 * 8 }, (_, i) => (i * 7) % 256) };
  const [a, b] = await Promise.all([registerBitmapFont(f), registerBitmapFont(f)]);
  expect(a).toBe(b);
  expect([...document.fonts].filter((face) => face.family.replace(/"/g, '') === `Phosphor Font ${fontKey(f)}`)).toHaveLength(1);
});

// A 16-tall font whose only lit glyphs are the full block (219) and an A with its left half lit (65), or, top, its top half.
function halfA({ top = false } = {}) {
  const f = { name: 'Half A', height: 16, bytes: new Uint8Array(256 * 16), blocks: [...CP437_BLOCKS] };
  f.bytes.fill(0xff, 219 * 16, 220 * 16);
  if (top) f.bytes.fill(0xff, 65 * 16, 65 * 16 + 8);
  else f.bytes.fill(0xf0, 65 * 16, 66 * 16);
  return f;
}
async function gradient(settings) {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  Object.assign(project, settings);
  project.setLayerChars('edit', settings);
  await settle(project);
  return project;
}

for (const charChoice of ['best', 'shape']) it(`conversion picks only font glyphs (${charChoice})`, async () => {
  const project = await gradient({ charChoice, chars: '█A▙', quantize: 'cga', solids: 0 });
  const top = charChoice === 'shape'; // a gradient's cell is a shape of two halves, as a half shade Best match's
  project.setDrawingFont(halfA({ top }));
  await settle(project);
  const chars = new Set(project.cells.map((c) => c.char));
  expect([...chars].every((c) => [' ', '█', 'A', '▄'].includes(c)), [...chars].join('')).toBe(true); // ▙ fits to ▄
  expect(chars.has('A')).toBe(true); // half lit in this font
  expect(project.processParams.chars).toBe('█A▄');
  expect(project.layerParams.get('edit').chars).toBe('█A▄');
  const cells = project.cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}`).join();
  project.setDrawingFont(halfA({ top: !top })); // the same characters, another A: measured in the font, it's chosen elsewhere
  await settle(project);
  expect(project.cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}`).join()).not.toBe(cells);
});

it('undo restores candidates', async () => {
  const project = await gradient({ charChoice: 'best', chars: '▙' });
  project.setDrawingFont(halfA());
  await settle(project);
  expect(project.cells.some((c) => c.char === '▙')).toBe(false);
  project.undo();
  await settle(project);
  expect(project.cells.some((c) => c.char === '▙')).toBe(true);
});

it('Random chooses among the fitted characters', async () => {
  const project = await gradient({ charChoice: 'random', chars: '▙▚' });
  project.setDrawingFont(halfA());
  await settle(project);
  const fitted = fontChars('▙▚');
  expect(project.processParams.chars).toBe(fitted); // the string Random draws from (glyphsOf)
  expect(project.lowerCells.every((c) => fitted.includes(c.char))).toBe(true); // as converted, before the screen's fit
});

it('typing fits to the font', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 10, rows: 10, withLayer: true });
  project.setDrawingFont(font());
  await settle(project);
  project.typeAt(0, 0, '—', {});
  project.commitPending();
  expect(project.editCellAt(0, 0).char).toBe('?');
});

const cellKeys = (cells) => cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}`).join();
const erase = (project) => {
  project.beginEdit();
  project.eraseBasePixels([{ x: 4, y: 6 }, { x: 5, y: 7 }]);
  project.commitEdit();
};

it('an edit before the font\'s render leaves no cells matched in the reference font', async () => {
  const settings = { charChoice: 'best', chars: '█A▙', quantize: 'cga', solids: 0, dither: 0 };
  const gap = await gradient(settings);
  gap.setDrawingFont(halfA());
  erase(gap); // composites before the render that brings the font to the renderer
  await settle(gap);
  const clean = await gradient(settings);
  clean.setDrawingFont(halfA());
  await settle(clean);
  erase(clean);
  await settle(clean);
  expect(cellKeys(gap.cells)).toBe(cellKeys(clean.cells));
});

it('a frame built for playing is matched in the font, as the still is', async () => {
  const project = await gradient({ charChoice: 'best', chars: '█A▙', quantize: 'cga', solids: 0, dither: 0 });
  project.setDrawingFont(halfA());
  await settle(project);
  project.addFrame('duplicate');
  const built = (await project.builtFrame(1)).cells;
  expect(built.some((c) => c.char === 'A')).toBe(true);
  expect(cellKeys(built)).toBe(cellKeys(project.cells));
});

const exported = async (project) => {
  let blob;
  await project.exportFile('xb', { deliver: (b) => { blob = b; }, sauce: false });
  return readXBin(new Uint8Array(await blob.arrayBuffer()), 'x.xb');
};

it('exports IBM VGA when the drawing has no font', async () => {
  const project = await blank();
  project.quantize = 'cga';
  await settle(project);
  expect(project.drawingFont).toBeNull();
  const { font } = await exported(project);
  expect(font.height).toBe(16);
  expect([...font.bytes.subarray(219 * 16, 220 * 16)]).toEqual(Array(16).fill(0xff));
});

// The IBM VGA font's own rows (its ROM's, which the font the app draws in copies): glyphs with edges, where Chrome on a
// Mac bleeds a lit pixel's light into its neighbors.
it('IBM VGA as a bitmap font has the font\'s own pixels, edges and all', async () => {
  const { bytes } = await vgaBitmapFont();
  const rows = (slot) => [...bytes.subarray(slot * 16, slot * 16 + 16)];
  expect(rows(65)).toEqual([0, 0, 0x10, 0x38, 0x6c, 0xc6, 0xc6, 0xfe, 0xc6, 0xc6, 0xc6, 0xc6, 0, 0, 0, 0]); // A
  expect(rows(176)).toEqual(Array.from({ length: 16 }, (_, r) => (r % 2 ? 0x44 : 0x11))); // ░
});

it('finds the eight blocks in the app\'s own IBM VGA, uneven shades and all', async () => {
  const vga = await vgaBitmapFont();
  expect(findBlocks(vga)).toEqual([...CP437_BLOCKS]);
  expect(vga.blocks).toEqual([...CP437_BLOCKS]); // CP437 by construction, so not left to be found from rasterized pixels
});

it('exports a character outside CP437 as its substitute, with no font', async () => {
  const project = await blank();
  project.quantize = 'cga';
  project.typeAt(0, 0, '★', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  await settle(project);
  const { cells } = await exported(project);
  expect(cells[0].char).not.toBe('★');
});

it('a Limited count of 8 exports its 8 colors and black after', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/photo.jpg', { cols: 20, rows: 20 });
  project.quantize = 'count';
  project.colorCount = 8;
  project.render();
  await settle(project);
  const active = project.activePalette.map((p) => p.hex.toLowerCase());
  expect(active).toHaveLength(8);
  const { palette } = await exported(project);
  const near = (a, b) => [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) < 4); // the file keeps 6 bits a channel
  expect(palette.slice(0, 8).every((hex, i) => near(hex, active[i]))).toBe(true);
  expect(palette.slice(8)).toEqual(Array(8).fill('#000000'));
});

// A drawing in a font whose lower half is at 240 (lowerAt240): paint's ▄ is drawn from that slot.
async function movedHalf() {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 10, rows: 10, withLayer: true });
  project.setDrawingFont(lowerAt240);
  await settle(project);
  return { project, workspace };
}

it('a drawing in a font whose lower half moved draws paint in that slot, and exports it there', async () => {
  const { project } = await movedHalf();
  project.quantize = 'cga';
  project.paintStroke([{ x: 0, y: 1, alpha: 1 }], '#ff5555', { blockChars: true }); // the lower half of cell 0, as the Brush
  project.commitEdit();
  await settle(project);
  expect(project.cells[0].char).toBe('▄');
  expect(slotOf(project.cells[0].char, project.drawingFont)).toBe(240);
  expect(project.processParams.font).toBe(fontKey(project.drawingFont));
  let blob;
  await project.exportFile('xb', { deliver: (b) => { blob = b; }, sauce: false });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  expect(readXBin(bytes, 'out.xb').cells[0].char).toBe('▄'); // read back through the same found blocks
  expect(bytes[11 + 48 + 256 * 16 + 1]).toBe(240); // the byte in the file: the first run's character, after its count
});

it('a block edit is one undo step, and undo draws in the old map at once', async () => {
  const { project } = await movedHalf();
  expect(project.fontBlocks).toBe('');
  const before = project.drawingFont;
  const version = project.history.version;
  project.setDrawingFont({ ...project.drawingFont, blocks: withBlock(blocksOf(project.drawingFont), 'lower', 220) });
  expect(project.history.version).toBe(version + 1);
  expect(project.fontBlocks).not.toBe('');
  expect(slotOf('▄', project.drawingFont)).toBe(220);
  const family = await registerBitmapFont(project.drawingFont);
  project.undo();
  expect(project.fontBlocks).toBe('');
  expect(slotOf('▄', project.drawingFont)).toBe(240);
  expect(await registerBitmapFont(project.drawingFont)).not.toBe(family);
  expect(await registerBitmapFont(before)).toBe(await registerBitmapFont(project.drawingFont));
});

it('set blocks come back with the project, and a project with a slot past 255 falls back to found ones', async () => {
  const { project } = await movedHalf();
  project.setDrawingFont({ ...project.drawingFont, blocks: withBlock(blocksOf(project.drawingFont), 'lower', 220) });
  const file = new File([await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() })], 'a.phosphor');
  const { project: other } = await createTestApp();
  await other.openParts(await readProject(file), { filename: 'other' });
  expect(other.fontBlocks).toBe(project.fontBlocks);
  expect(slotOf('▄', other.drawingFont)).toBe(220);
  other.fontBlocks = '219.256.223.221.222.176.177.178';
  expect(slotOf('▄', other.drawingFont)).toBe(240); // found again
  other.fontBlocks = '219.219.223.221.222.176.177.178'; // a slot twice is two blocks sharing it
  expect(slotOf('▄', other.drawingFont)).toBe(219);
});

it('the canvas draws a block edit and its undo at once', async () => {
  const { project, workspace } = await movedHalf();
  const litOf = async (spec) => {
    await setDisplayFont(spec); // as App.vue's watch does when the spec changes
    return [...drawGlyph('▄', 8, 16, 1, '#fff', false, spec)].filter((_, i) => i % 4 === 3 && _).length;
  };
  const before = JSON.stringify(workspace.displayFontSpec); // what App.vue watches
  expect(await litOf(workspace.displayFontSpec)).toBe(64); // slot 240's lower half: 8 rows of 8
  project.setDrawingFont({ ...project.drawingFont, blocks: withBlock(blocksOf(project.drawingFont), 'lower', 220) });
  const edited = JSON.stringify(workspace.displayFontSpec);
  expect(edited).not.toBe(before); // so the watch loads the font again, and the canvas drops its atlas
  expect(workspace.displayFontSpec.family).toContain(fontKey(project.drawingFont));
  expect(await litOf(workspace.displayFontSpec)).toBe(24); // slot 220's mark: 6 rows of 4
  project.undo();
  expect(JSON.stringify(workspace.displayFontSpec)).toBe(before);
  expect(await litOf(workspace.displayFontSpec)).toBe(64);
});

it('a layer with its own characters, in a drawing with a bitmap font, renders and fits them to the font', async () => {
  const { project } = await movedHalf();
  project.setLayerChars('edit', { chars: '▙█★' });
  await settle(project);
  const own = project.layerParams.get('edit');
  expect(own.font).toBe(fontKey(project.drawingFont));
  expect(own.chars).toBe(fontChars('▙█★', project.drawingFont));
  expect(project.cells.length).toBeGreaterThan(0);
});

it('set blocks stay through an .ans opened after, and an XBin with no blocks of its own resets them', async () => {
  const { project } = await movedHalf();
  project.setDrawingFont({ ...project.drawingFont, blocks: withBlock(blocksOf(project.drawingFont), 'lower', 220) });
  const blocks = project.fontBlocks;
  await project.openArtFile(new File(['hello'], 'note.ans'));
  expect(project.fontBlocks).toBe(blocks);
  project.clearImage();
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  expect(project.fontBlocks).toBe(blocks);
  const palette = Array.from({ length: 16 }, () => '#000000');
  const cells = [{ char: 'A', fg: { r: 255, g: 255, b: 255 }, bg: { r: 0, g: 0, b: 0 } }];
  await project.openArtFile(new File([writeXBin({ cols: 1, rows: 1, cells, palette, font: cp437Font })], 'own.xb'));
  expect(project.fontBlocks).toBe('');
});

const heavy = { id: 'l1', name: 'Heavy', slots: [219, 219, 219, 219, 219, 219, 219, 219, 219, 219, 219] };

test('a style added to the drawing\'s font is one undo step', async () => {
  const project = await blank();
  project.setDrawingFont(font());
  project.setDrawingFont({ ...project.drawingFont, lines: { hide: [], styles: [heavy] } });
  expect(project.drawingFont.lines.styles[0].name).toBe('Heavy');
  expect(project.fontLines).not.toBe('');
  project.undo();
  expect(project.drawingFont.lines).toBeUndefined();
  expect(project.drawingFont.name).toBe('Topaz');
  project.redo();
  expect(project.drawingFont.lines.styles[0].name).toBe('Heavy');
});

// The drawing's font kept in this browser too: an undo or redo of a change to its blocks, lines or sets puts them in
// the browser's copy as well (the Fonts page wrote the change itself), so an XBin opened later gets what the drawing shows.
test('undo and redo of a change to the drawing\u2019s font\u2019s lines or blocks reach this browser\u2019s copy of it', async () => {
  const project = await blank();
  const workspace = useWorkspaceStore();
  const f = font(), stored = await addBitmapFont(new File([f.bytes], 'Topaz.F08'));
  try {
    workspace.userFonts = await loadFonts();
    project.setDrawingFont(f);
    const lines = { hide: [], styles: [heavy] }, blocks = withBlock(f.blocks, 'lower', 250);
    project.setDrawingFont({ ...project.drawingFont, lines });
    await storeFontPart(stored.id, 'lines', lines); // as the Fonts page does
    project.setDrawingFont({ ...project.drawingFont, blocks });
    await storeFontPart(stored.id, 'blocks', blocks);
    project.undo();
    await vi.waitFor(async () => expect((await storedBitmapFont(stored.id)).blocks).toEqual(f.blocks));
    await vi.waitFor(() => expect(workspace.userFonts.find((e) => e.id === stored.id).blocks).toEqual(f.blocks));
    project.undo();
    await vi.waitFor(async () => expect((await storedBitmapFont(stored.id)).lines).toBeUndefined());
    project.redo();
    await vi.waitFor(async () => expect((await storedBitmapFont(stored.id)).lines).toEqual(lines));
    await vi.waitFor(() => expect(workspace.userFonts.find((e) => e.id === stored.id).lines).toEqual(lines));
  } finally {
    await removeFont(stored.id);
  }
});

// An edit made to the copy since (the font no longer the drawing's, so with no undo) isn't lost to an undo or redo.
test('undo and redo leave this browser\u2019s copy alone once it holds a newer edit than the step\u2019s', async () => {
  const project = await blank();
  const workspace = useWorkspaceStore();
  const f = font(), stored = await addBitmapFont(new File([f.bytes], 'Topaz.F08'));
  const g = { ...font(), name: 'Other', bytes: Uint8Array.from({ length: 256 * 8 }, (_, i) => i % 241) };
  try {
    workspace.userFonts = await loadFonts();
    project.setDrawingFont(f);
    const lines = { hide: [], styles: [heavy] }, newer = { hide: [], styles: [{ ...heavy, name: 'Newer' }] };
    project.setDrawingFont({ ...project.drawingFont, lines }); // step A
    await storeFontPart(stored.id, 'lines', lines);
    project.setDrawingFont(g);
    await storeFontPart(stored.id, 'lines', newer); // the Fonts page, on the copy alone
    project.undo(); // back to the font
    project.undo(); // step A
    expect(project.drawingFont.lines).toBeUndefined();
    project.redo();
    expect((await storedBitmapFont(stored.id)).lines).toEqual(newer); // read after the undo's and redo's writes, which go first
    expect(workspace.userFonts.find((e) => e.id === stored.id).lines).toBeUndefined(); // the redo put no lines in the list either
  } finally {
    await removeFont(stored.id);
  }
});

// Lines and sets don't change the picture, so a step that changes only them, its undo and its redo draw nothing again.
test('a change to only the font\'s lines or sets doesn\'t render', async () => {
  const project = await blank();
  project.setDrawingFont(font());
  const render = vi.spyOn(project, 'render');
  project.setDrawingFont({ ...project.drawingFont, lines: { hide: [], styles: [heavy] } });
  project.setDrawingFont({ ...project.drawingFont, sets: { hideStock: true, sets: [] } });
  project.undo();
  project.redo();
  expect(render).not.toHaveBeenCalled();
  project.setDrawingFont({ ...project.drawingFont, blocks: [...CP437_BLOCKS].reverse() });
  expect(render).toHaveBeenCalled();
});

test('lines and sets are saved with the project', async () => {
  const project = await blank();
  const sets = { hideStock: true, sets: [{ id: 's1', name: 'Mine', slots: [65, 66] }] };
  project.setDrawingFont({ ...font(), lines: { hide: [], styles: [heavy] }, sets });
  const file = new File([await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() })], 'a.phosphor');
  const { project: other } = await createTestApp();
  await other.openParts(await readProject(file), { filename: 'other' });
  expect(other.drawingFont.lines).toEqual({ hide: [], styles: [heavy] });
  expect(other.drawingFont.sets).toEqual(sets);
});

test('settings from a stranger with bad lines keep the good ones', async () => {
  const project = await blank();
  project.setDrawingFont(font());
  const fontLines = JSON.stringify({ hide: ['x'], styles: [heavy, { id: 'l2', slots: [1] }] });
  const got = settingsFromStranger({ fontLines });
  expect(got).not.toBeNull();
  project.$patch(got);
  expect(project.drawingFont.lines.styles).toEqual([heavy]);
  expect(settingsFromStranger({ fontLines: 7 })).toBeNull();
});

test('settings from a stranger take a font with five full character sets', () => {
  const sets = Array.from({ length: 5 }, (_, i) => ({ id: `s${i + 1}`, name: `Set ${i + 1}`, slots: Array.from({ length: 1024 }, (_, j) => j % 256) }));
  const fontSets = encodeSets({ sets });
  expect(fontSets.length).toBeGreaterThan(16 * 1024);
  expect(settingsFromStranger({ fontSets })).not.toBeNull();
});

// A library font that a SAUCE font name stands for: the map and the font are fetched (a stub of the library).
function stubSauceLibrary({ fail = false } = {}) {
  const map = { 'Amiga Topaz 1+': { file: 'moebius/amiga/TopazPlus_a500.F16', name: 'TopazPlus a500', height: 16 } };
  const fetches = [];
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', async (url, ...rest) => {
    if (!String(url).includes('fonts/library/')) return real(url, ...rest);
    fetches.push(String(url));
    if (fail) return { ok: false, status: 404 };
    if (String(url).endsWith('sauce.json')) return { ok: true, json: async () => map };
    return { ok: true, arrayBuffer: async () => new Uint8Array(256 * 16).fill(5).buffer };
  });
  return fetches;
}
const sauceAns = (fontName, name = 'art.ans') => new File([new AnsiFile(2, 1, [{ char: 'A', fg: { r: 255, g: 255, b: 255 }, bg: { r: 0, g: 0, b: 0 } }, { char: 'B', fg: { r: 255, g: 255, b: 255 }, bg: { r: 0, g: 0, b: 0 } }]).toBlob({ colorMode: 'cga', sauce: { title: '', author: '', group: '', date: '', fontName, use9pxFont: false, comments: [] } })], name);

test('using a library font with a SAUCE name sets the SAUCE Font name in the same undo step', async () => {
  const project = await blank();
  const { useLibraryFont } = useFontActions();
  stubSauceLibrary();
  const entry = { fontId: 'bitmap-topaz', name: 'TopazPlus a500', file: 'moebius/amiga/TopazPlus_a500.F16', height: 16, sauce: 'Amiga Topaz 1+' };
  await useLibraryFont(entry);
  expect(project.drawingFont.name).toBe('TopazPlus a500');
  expect(project.sauceFontName).toBe('Amiga Topaz 1+');
  expect(project.sauceFields().fontName).toBe('Amiga Topaz 1+');
  project.undo();
  expect(project.drawingFont).toBeNull();
  expect(project.sauceFontName).toBe('IBM VGA');
  project.redo();
  expect([project.drawingFont.name, project.sauceFontName]).toEqual(['TopazPlus a500', 'Amiga Topaz 1+']);
});

test('opening an .ans whose SAUCE names Amiga Topaz 1+ opens in that font', async () => {
  const project = await blank();
  const workspace = useWorkspaceStore();
  const fetches = stubSauceLibrary();
  await project.openArtFile(sauceAns('Amiga Topaz 1+'));
  expect(project.drawingFont.name).toBe('TopazPlus a500');
  expect(project.drawingFont.height).toBe(16);
  expect(project.sauceFontName).toBe('Amiga Topaz 1+');
  expect(workspace.userFonts.some((f) => f.name === 'TopazPlus a500')).toBe(true);
  expect(project.canUndo).toBe(false);
  expect(fetches).toHaveLength(2);
});

test('a BinaryText whose SAUCE names Amiga Topaz 1+ opens in that font, as an .ans does', async () => {
  const project = await blank();
  stubSauceLibrary();
  const bin = new Sauce({}, { dataType: 5, fileType: 1, width: 0, height: 0, flags: 0, fontName: 'Amiga Topaz 1+' }).appendTo(Uint8Array.of(65, 7, 66, 7));
  await project.openArtFile(new File([bin], 'art.bin'));
  expect(project.drawingFont.name).toBe('TopazPlus a500');
  expect([project.cols, project.rows]).toEqual([2, 2]);
});

test('opening an .ans whose SAUCE says IBM VGA opens as before', async () => {
  const project = await blank();
  const fetches = stubSauceLibrary();
  await project.openArtFile(sauceAns('IBM VGA'));
  expect(project.drawingFont).toBeNull();
  expect(fetches).toEqual([]);
});

test('a SAUCE font that can\'t be fetched leaves the file open in the built-in font and says so', async () => {
  const project = await blank();
  stubSauceLibrary({ fail: true });
  await project.openArtFile(sauceAns('Amiga Topaz 1+'));
  expect(project.drawingFont).toBeNull();
  expect(project.sauceFontName).toBe('Amiga Topaz 1+');
  expect(project.cols).toBe(2);
  expect(toastMessage.value).toContain('Amiga Topaz 1+');
  closeToast();
});

test('opening a .utf8ans whose SAUCE names a mapped font opens as before, with nothing fetched', async () => {
  const project = await blank();
  const fetches = stubSauceLibrary();
  await project.openArtFile(sauceAns('Amiga Topaz 1+', 'art.utf8ans'));
  expect(project.drawingFont).toBeNull();
  expect(fetches).toEqual([]);
});

test('an .ans naming a font already in Yours opens with the lines and sets kept for it', async () => {
  const project = await blank();
  const workspace = useWorkspaceStore();
  stubSauceLibrary();
  const file = new File([new Uint8Array(256 * 16).fill(5)], 'TopazPlus a500.F16');
  const stored = await addBitmapFont(file);
  const lines = { hide: [], styles: [heavy] };
  await storeFontPart(stored.id, 'lines', lines);
  workspace.userFonts = await loadFonts();
  await project.openArtFile(sauceAns('Amiga Topaz 1+'));
  expect(project.drawingFont.name).toBe('TopazPlus a500');
  expect(project.drawingFont.lines.styles[0].name).toBe('Heavy');
  expect(project.canUndo).toBe(false);
});

// Widths: a font narrower than 8 drawn at its own width, 9 for letter spacing.
const narrow = () => ({ name: 'Slim', height: 7, bytes: Uint8Array.from({ length: 256 * 7 }, (_, i) => (i % 251) & 0xfe), blocks: [...CP437_BLOCKS] });

test('a narrow font drawn narrow: the drawing font\u2019s cellWidth is its own width', async () => {
  const project = await blank();
  project.setDrawingFont({ ...narrow(), width: 7 });
  expect(project.fontWidth).toBe('7');
  expect(project.drawingFont.cellWidth).toBe(7);
  expect(project.pixelAspect).toBe(7 / 14);
});

test('fontWidth that isn\u2019t the font\u2019s own width reads as 8', async () => {
  const project = await blank();
  project.setDrawingFont(narrow());
  project.$patch({ fontWidth: '5' });
  expect(project.drawingFont.cellWidth).toBe(8);
});

test('Letter spacing 9px draws an 8-wide font at 9; a narrow font stays narrow', async () => {
  const project = await blank();
  project.setDrawingFont(font());
  project.$patch({ sauceLetterSpacing: '9' });
  expect(project.drawingFont.cellWidth).toBe(9);
  project.$patch({ sauceLetterSpacing: '', sauceUse9pxFont: true });
  expect(project.drawingFont.cellWidth).toBe(9);
  project.setDrawingFont({ ...narrow(), width: 7 });
  expect(project.drawingFont.cellWidth).toBe(7);
});

test('a drawing saved before widths opens at 8, or 9 when its SAUCE says 9px', async () => {
  const project = await blank();
  project.setDrawingFont(font());
  const parts = await project.projectParts();
  delete parts.settings.fontWidth;
  const other = (await createTestApp()).project;
  await other.openParts(await readProject(new File([await writeProject({ imageBuffer: project.imageBuffer, ...parts })], 'a.phosphor')), { filename: 'old' });
  expect(other.drawingFont.cellWidth).toBe(8);
  parts.settings.sauceUse9pxFont = true;
  await other.openParts(await readProject(new File([await writeProject({ imageBuffer: project.imageBuffer, ...parts })], 'a.phosphor')), { filename: 'old' });
  expect(other.drawingFont.cellWidth).toBe(9);
});

test('the canvas view\u2019s cell is the drawn width', async () => {
  const project = await blank();
  const workspace = useWorkspaceStore();
  const cellAt = async () => {
    await setDisplayFont(JSON.parse(JSON.stringify(workspace.displayFontSpec)));   // as App.vue sets it
    return measureAdvance(DISPLAY_FONT);
  };
  project.setDrawingFont({ ...narrow(), width: 7 });
  expect(workspace.displayFontSpec.width).toBe(7);
  expect(await cellAt()).toBe(7);
  project.setDrawingFont({ ...narrow(), width: 8 });
  expect(await cellAt()).toBe(8);
  project.$patch({ sauceLetterSpacing: '9' });
  expect(workspace.displayFontSpec.width).toBe(9);
  expect(await cellAt()).toBe(9);
});

test('with no bitmap font, the cell is the display font\u2019s', async () => {
  const project = await blank();
  project.$patch({ sauceLetterSpacing: '9' });
  expect(project.drawingFont).toBeNull();
  expect(project.pixelAspect).toBe(1);
});

test('undo of a width change keeps the browser\u2019s copy\u2019s width in step', async () => {
  const project = await blank();
  const workspace = useWorkspaceStore();
  const f = narrow(), stored = await addBitmapFont(new File([f.bytes], 'Slim.F07'));
  try {
    workspace.userFonts = await loadFonts();
    project.setDrawingFont({ ...f, width: 8 });
    await storeFontPart(stored.id, 'width', 8);
    project.setDrawingFont({ ...project.drawingFont, width: 7 }); // narrow
    await storeFontPart(stored.id, 'width', 7);
    project.undo(); // back to keeping 8
    await vi.waitFor(async () => expect((await storedBitmapFont(stored.id)).width).toBe(8));
    await vi.waitFor(() => expect(workspace.userFonts.find((e) => e.id === stored.id).width).toBe(8));
    project.redo();
    await vi.waitFor(async () => expect((await storedBitmapFont(stored.id)).width).toBe(7));
  } finally {
    await removeFont(stored.id);
  }
});

test('a width change is one undo step with Letter spacing', async () => {
  const project = await blank();
  await project.setDrawingFont({ ...narrow(), width: 7 });
  const spacing = project.sauceLetterSpacing;
  await project.setDrawingFontWidth(9);
  expect(project.fontWidth).toBe('');
  expect(project.sauceLetterSpacing).toBe('9');
  expect(project.drawingFont.cellWidth).toBe(9);
  expect(project.history.last.gridOp).toBe(true); // nothing drawn: the lines refit, in the rescale's step
  project.undo(); // one undo takes back both
  expect(project.fontWidth).toBe('7');
  expect(project.sauceLetterSpacing).toBe(spacing);
  expect(project.drawingFont.cellWidth).toBe(7);
  project.redo();
  expect(project.drawingFont.cellWidth).toBe(9);
  const redone = project.history.version;
  await project.setDrawingFontWidth(9); // the width it has: no step
  await project.setDrawingFontWidth(5); // not its own width: nothing
  expect(project.history.version).toBe(redone);
  expect(project.drawingFont.cellWidth).toBe(9);
});

test('a font remembered narrow is drawn narrow; one remembered "keep 8" is drawn at 8 (9 with Letter spacing 9px)', async () => {
  const project = await blank();
  expect(await project.setDrawingFont({ ...narrow(), width: 7 })).toBeUndefined();
  expect(project.drawingFont.cellWidth).toBe(7);
  await project.setDrawingFont(font());
  expect(await project.setDrawingFont({ ...narrow(), width: 8 })).toBeUndefined();
  expect(project.drawingFont.cellWidth).toBe(8);
  await project.setDrawingFont(font());
  project.$patch({ sauceLetterSpacing: '9' });
  await project.setDrawingFont({ ...narrow(), width: 8 });
  expect(project.fontWidth).toBe('');
  expect(project.drawingFont.cellWidth).toBe(9);
});

test('a narrow font with no answer draws narrow and asks', async () => {
  const project = await blank();
  expect(await project.setDrawingFont(narrow())).toEqual({ ask: true });
  expect(project.fontWidth).toBe('7');
  expect(project.drawingFont.cellWidth).toBe(7);
  const { project: fresh } = await createTestApp(); // before any drawing: the next one's, asked too
  expect(await fresh.setDrawingFont(narrow())).toEqual({ ask: true });
  expect(fresh.fontWidth).toBe('7');
});

test('the drawing’s own narrow font kept at 8, given lines, stays at 8 and doesn’t ask', async () => {
  const project = await blank();
  await project.setDrawingFont({ ...narrow(), width: 8 });
  expect(await project.setDrawingFont({ ...project.drawingFont, lines: { hide: [], styles: [heavy] } })).toBeUndefined();
  expect(project.fontWidth).toBe('');
  expect(project.drawingFont.cellWidth).toBe(8);
  expect(project.drawingFont.lines.styles[0].name).toBe('Heavy');
});

test('a width change remembers its answer on the browser’s copy, and undo and redo keep it in step', async () => {
  const project = await blank();
  const workspace = useWorkspaceStore();
  const f = narrow(), stored = await addBitmapFont(new File([f.bytes], 'Slim.F07'));
  const kept = async (width) => {
    await vi.waitFor(async () => expect((await storedBitmapFont(stored.id)).width).toBe(width));
    await vi.waitFor(() => expect(workspace.userFonts.find((e) => e.id === stored.id).width).toBe(width));
  };
  try {
    workspace.userFonts = await loadFonts();
    await project.setDrawingFont({ ...f, width: 8 });
    await project.setDrawingFontWidth(7);
    await kept(7);
    await project.setDrawingFontWidth(9);
    await kept(8); // 9 is the drawing's Letter spacing: the font's answer is keep 8
    project.undo();
    await kept(7);
    project.redo();
    await kept(8);
  } finally {
    await removeFont(stored.id);
  }
});

test('a project without a font of its own keeps the narrow drawing’s width', async () => {
  const project = await blank();
  await project.setDrawingFont({ ...narrow(), width: 7 });
  const { project: plain } = await createTestApp();
  await plain.setBlankCanvas({ cols: 4, rows: 4 });
  const file = new File([await writeProject({ imageBuffer: plain.imageBuffer, ...await plain.projectParts() })], 'plain.phosphor');
  await project.openParts(await readProject(file), { filename: 'plain' });
  expect(project.fontWidth).toBe('7');
  expect(project.drawingFont.cellWidth).toBe(7);
});

test('picked again with no answer, the drawing’s own narrow font keeps its width, is no step, and asks again (Ruling 4)', async () => {
  const project = await blank();
  await project.setDrawingFont(narrow());
  const version = project.history.version;
  expect(await project.setDrawingFont(narrow())).toEqual({ ask: true });
  expect(project.fontWidth).toBe('7');
  expect(project.history.version).toBe(version);
});

test('8 or 9 at the width the drawing is drawn at still sets Letter spacing, as one step', async () => {
  const project = await blank();
  await project.setDrawingFont({ ...narrow(), width: 8 });
  await project.setDrawingFontWidth(8); // drawn at 8 with Letter spacing unset: the export would write none
  expect([project.sauceLetterSpacing, project.drawingFont.cellWidth]).toEqual(['8', 8]);
  project.undo();
  expect(project.sauceLetterSpacing).toBe('');
  project.$patch({ sauceUse9pxFont: true }); // drawn at 9 by the SAUCE flag
  await project.setDrawingFontWidth(9);
  expect([project.sauceLetterSpacing, project.drawingFont.cellWidth]).toEqual(['9', 9]);
  const version = project.history.version;
  await project.setDrawingFontWidth(9); // every setting as asked: no step
  expect(project.history.version).toBe(version);
});
