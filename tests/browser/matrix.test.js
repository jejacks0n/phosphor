// The review matrix as pictures (tests/matrix/README.md): for each foundation, its setup (tests/fixtures/matrix/
// setup-{foundation}.pho, built by tests/matrix/build-setup.mjs: Layer 1 with paint, a poem, Half-block, Half-column
// detail and Write block glyphs circles; Vector 1 with By shape of its own) taken through each scenario, and the ANSI
// view's picture after every step compared with tests/fixtures/reference/matrix/{foundation}/{step}.png. A reference is
// a claim that the picture is right: npm run test:update writes them, and each one changed is looked at before it's
// committed. A failure writes the picture made and a diff under .vitest/attachments/references/, and names the cells
// that differ.
import { describe, test, expect, afterEach } from 'vitest';
import { createTestApp, settle, cellsKey } from '../support/app.js';
import { matchImage } from '../support/references.js';
import { cellsPng } from '@/lib/PngFile.js';
import { shapeBounds } from '@/document/shapes.js';
import { bitmapOf, setDisplayFont } from '@/lib/displayFonts.js';
import { useBitmapCoverage, setGlyphRasterizer, rasterizeCoverage } from '@/lib/GlyphCoverage.js';
import { blur } from '@/tools/retouch';

afterEach(async () => { // the harness's font again (createTestApp's)
  await setDisplayFont('jetbrains');
  setGlyphRasterizer(rasterizeCoverage);
});

// The foundations with a setup built: a slug of tests/matrix/build-setup.mjs's (from, style, mode, palette, adjustment).
const FOUNDATIONS = ['image-ansi-best-vga-none'];

async function opened(foundation) {
  const app = await createTestApp();
  const bytes = await (await fetch(`/tests/fixtures/matrix/setup-${foundation}.pho`)).arrayBuffer();
  await app.project.loadProject(new File([bytes], `setup-${foundation}.pho`));
  await settle(app.project);
  // Drawn in a bitmap font, whose glyphs are its bits on every machine: a font of outlines is drawn by the system's own
  // rasterizer, which edges a glyph otherwise on macOS than on Linux, so a reference made on one would fail on the other.
  const font = new Uint8Array(await (await fetch('/fonts/library/moebius/ibm/CP437.F16')).arrayBuffer());
  await app.project.setDrawingFont({ name: 'CP437', height: 16, bytes: font });
  const spec = app.workspace.displayFontSpec; // drawn and measured in it, as App.vue has a drawing's font
  await setDisplayFont(spec);
  useBitmapCoverage(bitmapOf(spec));
  app.project.render();
  await settle(app.project);
  const layer = (kind) => app.project.layers.find((l) => l.kind === kind && l.id !== 'base').id;
  return { ...app, L1: layer('cells'), V: layer('vector') };
}

// The ANSI view's cells as Export › PNG draws them, against matrix/{foundation}/{step}.png.
async function picture(project, foundation, step) {
  await settle(project);
  const lines = project.cells.length / project.cols;
  await matchImage(`matrix/${foundation}/${step}.png`, await cellsPng(project.cols, lines, project.cells), { cols: project.cols, lines });
}

// Each cell as it looks: one color where its two are the same, whatever the glyph (a █ and a ▒ of one color look alike).
const shown = (project) => project.cells.map(({ char, fg, bg }) => {
  const f = fg.hex.toLowerCase(), b = bg.hex.toLowerCase();
  return f === b ? f : `${char}${f}${b}`;
});

// The cells of the top row's circles (the third, Half-column detail's, among them), as they show.
const circles = (project) => {
  const out = [];
  for (let row = 21; row < 30; row++) for (let col = 48; col < 72; col++) out.push(cellsKey(project)[row * project.cols + col]);
  return out;
};

describe.each(FOUNDATIONS)('%s', (foundation) => {
  describe('merges in ANSI', () => {
    test('opened, and Vector 1 moved under Layer 1: nothing changes but where Layer 1\'s paint is now over a shape', async () => {
      const { project, L1, V } = await opened(foundation);
      await picture(project, foundation, 'opened');
      const before = shown(project);
      project.moveLayer(V, 1); // under Layer 1, whose paint is then an upper layer's (docs/model.md R7)
      await settle(project);
      // Only where Layer 1's paint lies over a shape (which is now under it) can a cell change.
      const paint = project.paintOf(L1), bounds = [...project.shapes.values()].map((shape) => shapeBounds(shape));
      const underPaint = (col, row) => paint.hasPaintIn({ c0: col, r0: row, c1: col, r1: row })
        && bounds.some(({ x, y, w, h }) => col + 1 > x && col < x + w && 2 * row + 2 > y && 2 * row < y + h);
      const changed = shown(project).map((cell, i) => (cell === before[i] ? null : [i % project.cols, Math.floor(i / project.cols)])).filter(Boolean);
      expect(changed.length).toBeGreaterThan(0); // Layer 1's soft paint over the last circle's edge
      expect(changed.filter(([col, row]) => !underPaint(col, row))).toEqual([]);
      await picture(project, foundation, 'vector-under-layer');
    });

    test('Keep crisp cells: Vector 1 into Layer 1, then Layer 1 into Base', async () => {
      const { project, L1, V } = await opened(foundation);
      const before = cellsKey(project);
      expect(project.mergeDown(V)).toBe(true);
      await picture(project, foundation, 'crisp-1-vector-into-layer');
      expect(project.mergeDown(L1)).toBe(true);
      await picture(project, foundation, 'crisp-2-layer-into-base');
      project.undo();
      project.undo();
      await settle(project);
      expect(cellsKey(project)).toEqual(before);
    });

    // Letters and lines merge exactly; every block goes into the picture, so Blur reaches it (docs/model.md R1, R3).
    test('Blend into source image: Vector 1 into Layer 1, Layer 1 into the picture, then Blur over all of it', async () => {
      const { project, workspace, L1, V } = await opened(foundation);
      expect(project.mergeDown(V)).toBe(true);
      await settle(project);
      await project.mergeIntoPicture(null, L1);
      await picture(project, foundation, 'blend-1-layer-into-picture');
      workspace.pickLayer('base');
      Object.assign(workspace, { retouchSize: 4, retouchStrength: 100, retouchHardness: 50, retouchRange: 'midtones', editorTab: 'output' });
      const ctx = { project, workspace, view: 'output', unit: { x: 1, y: 1 } }, ev = { stopPropagation() {}, preventDefault() {}, shiftKey: false };
      for (let row = 0; row < project.cells.length / project.cols; row++) { // a stroke along every line
        blur.begin(ctx, { x: 0.5, y: 2 * row + 1 }, ev);
        for (let col = 1; col < project.cols; col++) blur.move(ctx, { x: col - 0.5, y: 2 * row + 1 }, { x: col + 0.5, y: 2 * row + 1 });
        blur.end?.(ctx);
      }
      project.commitEdit();
      await picture(project, foundation, 'blend-2-blurred');
    });

    // A vector layer with its own characters goes into the base in one step either way (docs/layers.md).
    test('Vector 1 moved onto Base: Keep crisp cells, and Blend into source image', async () => {
      const { project, V } = await opened(foundation);
      project.moveLayer(V, 1);
      await settle(project);
      const before = cellsKey(project);
      expect(project.mergeDown(V)).toBe(true);
      await picture(project, foundation, 'vector-onto-base-crisp');
      project.undo();
      await settle(project);
      expect(cellsKey(project)).toEqual(before);
      expect(await project.mergeShapesIntoPicture(V)).toBe(true);
      await picture(project, foundation, 'vector-onto-base-blend');
    });
  });

  // docs/model.md R15: Keep crisp cells keeps Half-column detail's ▄ as ▄ in the ASCII styles.
  describe.each(['ascii', 'colorAscii'])('merges in %s', (style) => {
    test('Keep crisp cells: Layer 1 into Base keeps the circles as they show', async () => {
      const { project, L1 } = await opened(foundation);
      project.renderStyle = style;
      project.render();
      await settle(project);
      await picture(project, foundation, `${style}-opened`);
      const before = circles(project);
      expect(project.mergeDown(L1)).toBe(true);
      await picture(project, foundation, `${style}-crisp`);
      expect(circles(project)).toEqual(before);
    });
  });
});
