// Paint in the PIXEL view shows in the palette's colors on every layer: an upper layer's paint and shapes are snapped
// where they cover the output, as the output snaps the lower group's paint, so a swatch's color is the color its paint
// shows there. Cells keep showing as they look, their colors blended by how much of them the character covers.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { paletteChoices } from '@/lib/PixelTransforms.js';
import { rectShape } from '@/document/shapes.js';
import { rgb2hex } from '@/lib/ColorUtils.js';
import { ctx2d } from '@/lib/Canvas.js';

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
