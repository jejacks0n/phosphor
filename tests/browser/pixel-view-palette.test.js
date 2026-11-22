// Paint in the PIXEL view shows in the palette's colors on every layer: an upper layer's paint and shapes are snapped
// where they cover the output, as the output snaps the lower group's paint, so a swatch's color is the color its paint
// shows there. Cells keep showing as they look, their colors blended by how much of them the character covers.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { paletteChoices } from '@/lib/PixelTransforms.js';
import { rectShape } from '@/document/shapes.js';
import { rgb2hex, sharedIndex } from '@/lib/ColorUtils.js';
import { typeText } from '@/composables/useTextTool.js';
import { ctx2d } from '@/lib/Canvas.js';
import brush from '@/tools/brush';

const COLS = 40, ROWS = 40;

// A bug report's settings: a white, brown and black color list under Saturation 0 (every color a gray before the list).
async function grayedBrown(over = {}) {
  const app = await createTestApp();
  const { project } = app;
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: COLS, rows: ROWS });
  Object.assign(project, { quantize: 'palette', palette: '#FFFFFF #AA5500 #000000', saturation: 0, brightness: 138, levelsMid: 0.53, ...over });
  await settle(project);
  return app;
}

const shownColors = (project) => {
  const data = ctx2d(project.renderer.shownCanvas()).getImageData(0, 0, project.cols, project.rows).data, seen = new Set();
  for (let i = 0; i < data.length; i += 4) seen.add(rgb2hex({ r: data[i], g: data[i + 1], b: data[i + 2] }).toLowerCase());
  return seen;
};
const shownAt = (project, x, y) => {
  const [r, g, b] = ctx2d(project.renderer.shownCanvas()).getImageData(x, y, 1, 1).data;
  return rgb2hex({ r, g, b }).toLowerCase();
};
const brownSwatch = (project) => paletteChoices(project, project.activePalette)[1].toLowerCase();
const square = (x0, y0) => {
  const points = [];
  for (let x = x0; x < x0 + 4; x++) for (let y = y0; y < y0 + 4; y++) points.push({ x, y, alpha: 1 });
  return points;
};

test('paint and a shape in the brown swatch\'s color show brown, on the layer above the base and on layers above that', async () => {
  const { project, workspace } = await grayedBrown();
  const brown = brownSwatch(project);
  workspace.pickLayer('edit');
  project.paintStroke(square(2, 2), brown);
  project.commitEdit();
  const top = project.addLayer('cells', 'edit'); // above the lower group: an upper layer, drawn over the output
  workspace.pickLayer(top);
  project.paintStroke(square(20, 20), brown);
  project.commitEdit();
  const shapes = project.addLayer('vector', top);
  workspace.pickLayer(shapes);
  project.addShape(rectShape(30, 30, 34, 34, { fill: brown }));
  await settle(project);
  expect(shownAt(project, 3, 3)).toBe('#aa5500');
  expect(shownAt(project, 21, 21)).toBe('#aa5500');
  expect(shownAt(project, 31, 31)).toBe('#aa5500');
});

test('Best match\'s cells still show as they look: their glyphs blend their two colors, between the list\'s colors', async () => {
  const { project, workspace } = await grayedBrown({ charChoice: 'best' });
  const top = project.addLayer('cells', 'edit'); // with an upper layer, whose paint is snapped where it is
  workspace.pickLayer(top);
  project.paintStroke(square(20, 20), brownSwatch(project));
  project.commitEdit();
  await settle(project);
  expect([...shownColors(project)].some((hex) => !['#ffffff', '#aa5500', '#000000'].includes(hex))).toBe(true);
  expect(shownAt(project, 21, 21)).toBe('#aa5500');
});

// The report: on a layer with its own character settings (an upper layer), the brown swatch painted dark gray.
test('the reporter\'s drawing: the brown swatch paints brown on Layer 1 in the PIXEL view', async () => {
  const { project, workspace } = await createTestApp();
  const url = '/tests/fixtures/projects/upper-paint-palette.phosphor';
  await project.loadProject(new File([await (await fetch(url)).blob()], 'upper-paint-palette.phosphor'));
  await settle(project);
  workspace.pickLayer('edit');
  project.paintStroke(square(8, 8), brownSwatch(project));
  project.commitEdit();
  await settle(project);
  expect(project.lowerGroup.upper).toContain('edit');
  expect(shownAt(project, 9, 9)).toBe('#aa5500');
});

// A typed cell keeps the index of a color the list holds lower down (sharedIndex), for the export; the list then changed
// so that index holds another color, or is gone.
test('a repeated color moved or taken out of the list leaves what was painted with it showing its color', async () => {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: COLS, rows: ROWS });
  Object.assign(project, { quantize: 'palette', palette: '#ff0000 #00ff00 #ff0000' });
  await settle(project);
  workspace.pickLayer('edit');
  workspace.setColor('fg', '#ff0000', { index: sharedIndex(2, project.activePalette) }); // the third swatch
  workspace.textCursor = { col: 5, row: 5 };
  typeText(project, workspace, 'X');
  await settle(project);
  const shown = () => project.cells[5 * project.cols + 5];
  expect(project.editCellAt(5, 5).fgIndex).toBe(2);
  expect(shown().char).toBe('X');
  expect(shown().fg.hex.toLowerCase()).toBe('#ff0000');
  for (const palette of ['#ff0000 #ff0000 #00ff00', '#00ff00 #ff0000']) {
    project.palette = palette;
    await settle(project);
    expect(shown().fg.hex.toLowerCase()).toBe('#ff0000');
  }
});

// A bug report: a palette with no black chosen, a blank canvas (dark blue, the list's nearest color to black), a white
// stroke with the Brush, and the PIXEL view's background turned black. A stroke on the base, with no layer over it, drew
// the output again from the picture as it is before the list's colors and never snapped it; the cells were right.
const NO_BLACK = '#1a1c2c #5d275d #b13e53 #ef7d57 #ffcd75 #a7f070 #38b764 #257179 #29366f #3b5dc9 #41a6f6 #73eff7 #f4f4f4 #94b0c2 #566c86 #333c57';
const brushed = (app, from, to) => {
  const ctx = { ...app, view: 'input' }, at = (x) => ({ x: x + 0.5, y: 4.5 });
  app.workspace.editFgColor = '#ffffff';
  brush.begin(ctx, at(from), {});
  brush.move(ctx, at(from), at(to));
  return () => brush.end(ctx);
};
// The shown colors that aren't the palette's.
const offPalette = (project) => {
  const palette = new Set(project.activePalette.map((c) => c.hex.toLowerCase()));
  return [...shownColors(project)].filter((hex) => !palette.has(hex));
};

test('a stroke on the base leaves the PIXEL view in the list\'s colors: a blank canvas under a list with no black stays its darkest color', async () => {
  const app = await createTestApp(), { project } = app;
  Object.assign(project, { quantize: 'palette', palette: NO_BLACK });
  await project.setBlankCanvas({ cols: 20, rows: 20 });
  await settle(project);
  expect([...shownColors(project)]).toEqual(['#1a1c2c']);
  const end = brushed(app, 3, 8);
  expect(shownAt(project, 18, 18)).toBe('#1a1c2c');          // while the stroke is open, away from it
  expect(offPalette(project)).toEqual([]);
  end();
  await settle(project);
  expect(shownAt(project, 18, 18)).toBe('#1a1c2c');
  expect(shownAt(project, 5, 4)).toBe('#f4f4f4');            // the stroke, in the list's nearest to white
  expect(offPalette(project)).toEqual([]);
  brushed(app, 10, 14)();                                    // a second stroke redraws only its own part: that too
  await settle(project);
  expect(shownAt(project, 12, 4)).toBe('#f4f4f4');
  expect(offPalette(project)).toEqual([]);
  project.undo();                                            // and what an undo uncovers, down to a base with no pixels
  await settle(project);
  expect(shownAt(project, 12, 4)).toBe('#1a1c2c');
  expect(offPalette(project)).toEqual([]);
  project.undo();
  await settle(project);
  expect([...shownColors(project)]).toEqual(['#1a1c2c']);
});

test('and a picture under a color list stays in the list\'s colors when its base is painted on, as it does under Limited count', async () => {
  for (const settings of [{ quantize: 'palette', palette: NO_BLACK }, { quantize: 'count', colorCount: 6 }]) {
    const app = await createTestApp(), { project } = app;
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: COLS, rows: ROWS, withLayer: false });
    Object.assign(project, settings);
    await settle(project);
    const before = shownColors(project);
    expect(before.size, settings.quantize).toBeLessThanOrEqual(16);
    brushed(app, 3, 8)();
    await settle(project);
    expect(offPalette(project), settings.quantize).toEqual([]);
    project.undo();
    await settle(project);
    expect(offPalette(project), `${settings.quantize}, undone`).toEqual([]);
  }
});
