// The drawing's bitmap font as document state: one undo step, saved with the project, gone on a new drawing.
import { test, it, expect, afterEach } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { readProject, writeProject } from '@/document/projectIO.js';
import { fontId, encodeFont } from '@/lib/BitmapFont.js';
import { DISPLAY_FONT, drawGlyph, setDisplayFont } from '@/lib/displayFonts.js';
import { measureAdvance } from '@/lib/CellCanvas.js';
import { registerBitmapFont } from '@/lib/userFonts.js';
import { coverageOf, setGlyphRasterizer, rasterizeCoverage, useBitmapCoverage } from '@/lib/GlyphCoverage.js';

afterEach(async () => {
  await setDisplayFont('jetbrains');
  setGlyphRasterizer(rasterizeCoverage);
});

const font = () => ({ name: 'Topaz', height: 8, bytes: Uint8Array.from({ length: 256 * 8 }, (_, i) => i % 251) });

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

test('a new drawing has no font', async () => {
  const project = await blank();
  project.setDrawingFont(font());
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  expect(project.drawingFont).toBeNull();
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
  project.setDrawingFont(font());
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
  const f = { name: 'Solid space', height: 8, bytes: new Uint8Array(256 * 8) };
  f.bytes.fill(0xff, 32 * 8, 33 * 8);
  useBitmapCoverage(f); // as App.vue installs it
  expect(coverageOf(' ')).toEqual([1, 1]);
  expect(coverageOf('█')).toEqual([0, 0]); // a block too: this font's is blank
  expect(coverageOf('▙')).toEqual([1, 1]); // no slot: measured as the space
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
  expect([...document.fonts].filter((face) => face.family.replace(/"/g, '') === `Phosphor Font ${fontId(f)}`)).toHaveLength(1);
});
