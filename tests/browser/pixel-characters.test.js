// The PIXEL view shows a character of someone's own on the base (a pin, an art layer's) as it looks at half-cell scale:
// per half, its background blended toward its foreground by how much of that half the glyph inks (docs/model.md R11).
// Nothing stored changes: the pixels under it are still the cell's two colors, which the tools read.
import { test, expect, vi } from 'vitest';
import { settle } from '../support/app.js';
import { mountPixelView } from '../support/pixelView.js';
import { ctx2d } from '@/lib/Canvas.js';
import { halfColors, mix } from '@/lib/Cells.js';
import { rectShape } from '@/document/shapes.js';

const WHITE = [255, 255, 255], BLACK = [0, 0, 0], RED = [255, 0, 0];
const gray = (ink) => Array(3).fill(Math.round(255 * ink));
const rgb = ({ r, g, b }) => [r, g, b];
// A cell's two grid pixels as the view shows them, and as the output holds them (what the tools read).
const shown = (seen, col, row) => [seen(col, 2 * row), seen(col, 2 * row + 1)];
const storedAt = (project, x, y) => [...ctx2d(project.renderer.shownCanvas()).getImageData(x, y, 1, 1).data].slice(0, 3);
const stored = (project, col, row) => [storedAt(project, col, 2 * row), storedAt(project, col, 2 * row + 1)];
// A cell as the ANSI view shows it, at pixel scale.
const look = (project, col, row) => halfColors(project.cells[row * project.cols + col]).map(rgb);
const pin = (project, col, row, char, fg = '#ffffff', bg = '#000000') => project.writeBaseCells([{ col, row, char, fg, bg }]);
const red = (x, y, alpha) => ({ x, y, r: 255, g: 0, b: 0, alpha });

// The report (projects/base-character-lines.phosphor): three diagonal lines drawn on the base with the Shape tool. The
// Full-block line of █ ░ ▒ ▓ and the Half-column one of ▐ ▌ █ showed as rows of dashes, each cell its background over
// its foreground whatever its character; the Half-block line, plain paint, looked right.
test('R11: the report: lines of █ ░ ▒ ▓ and ▐ ▌ █ on the base show as they look, not as their two stored colors', async () => {
  const { project, seen, done } = await mountPixelView('/tests/fixtures/projects/base-character-lines.phosphor', { overlay: 0 });
  expect(shown(seen, 11, 2)).toEqual([WHITE, WHITE]);           // █ is solid
  expect(shown(seen, 10, 3)).toEqual([gray(0.25), gray(0.25)]); // ░
  expect(shown(seen, 10, 4)).toEqual([gray(0.5), gray(0.5)]);   // ▒
  expect(shown(seen, 11, 3)).toEqual([gray(0.75), gray(0.75)]); // ▓
  expect(shown(seen, 16, 4)).toEqual([gray(0.5), gray(0.5)]);   // ▐: a grid pixel is a column wide, so half of it
  expect(shown(seen, 17, 4)).toEqual([gray(0.5), gray(0.5)]);   // ▌
  expect(shown(seen, 17, 2)).toEqual([WHITE, WHITE]);

  // Everything that isn't a character (the Half-block line's paint, the canvas) shows as its pixels are.
  const pins = project.baseRecords.pins;
  let painted = 0;
  for (let y = 0; y < project.rows; y++) {
    for (let x = 0; x < project.cols; x++) {
      if (pins.has(`${x},${y >> 1}`)) continue;
      const pixel = storedAt(project, x, y);
      expect(seen(x, y), `${x},${y}`).toEqual(pixel);
      if (pixel.some(Boolean)) painted++;
    }
  }
  expect(painted).toBeGreaterThan(20);
  // Nothing stored changed: the pixels are the cell's background over its foreground, and the cell is what it was.
  expect(stored(project, 11, 2)).toEqual([BLACK, WHITE]);
  expect(project.cells[2 * project.cols + 11]).toMatchObject({ char: '█', fg: { hex: '#ffffff' }, bg: { hex: '#000000' } });
  done();
});

test('R11: a character written on the base shows its look at once, another written over it shows its own, and undo the pixels again', async () => {
  const { project, seen, done } = await mountPixelView(null, { overlay: 0 });
  const before = shown(seen, 4, 3);
  pin(project, 4, 3, '█');
  project.commitEdit();
  await settle(project);
  expect(shown(seen, 4, 3)).toEqual([WHITE, WHITE]);
  pin(project, 4, 3, '░'); // the same two pixels, another character
  project.commitEdit();
  await settle(project);
  expect(shown(seen, 4, 3)).toEqual([gray(0.25), gray(0.25)]);
  project.eraseBasePixels([{ x: 4, y: 7 }]); // the PIXEL view's Eraser: its foreground black, the character kept
  project.commitEdit();
  await settle(project);
  expect(shown(seen, 4, 3)).toEqual([BLACK, BLACK]);
  project.undo();
  project.undo();
  project.undo();
  await settle(project);
  expect(shown(seen, 4, 3)).toEqual(before);
  done();
});

test('R11: paint on a layer over a character on the base lays over its look, on the layer above the base and on one above that', async () => {
  const { project, workspace, seen, done } = await mountPixelView(null, { overlay: 0 });
  for (const col of [4, 10]) pin(project, col, 3, '█');
  for (const col of [6, 12]) pin(project, col, 3, '▒');
  project.commitEdit();
  workspace.pickLayer('edit');
  project.paintEditPixels([red(4, 6, 0.5), red(6, 6, 1)]);
  project.commitEdit();
  const top = project.addLayer('cells', 'edit'); // above the lower group: an upper layer
  workspace.pickLayer(top);
  project.paintEditPixels([red(10, 6, 0.5), red(12, 6, 1)]);
  project.commitEdit();
  await settle(project);
  expect(project.lowerGroup.upper).toContain(top);
  const soft = project.renderer.paintAt(4, 6);
  expect(soft.a).toBeGreaterThan(0.4);
  expect(soft.a).toBeLessThan(0.6);
  expect(shown(seen, 4, 3)).toEqual([rgb(mix({ r: 255, g: 255, b: 255 }, soft, soft.a)), WHITE]); // half red over the block's white, not over its black background
  expect(shown(seen, 6, 3)).toEqual([RED, gray(0.5)]); // the paint where it is, the shade where it isn't
  expect(shown(seen, 10, 3)).toEqual(shown(seen, 4, 3));
  expect(shown(seen, 12, 3)).toEqual(shown(seen, 6, 3));
  done();
});

// A shape over a pinned character takes the cell: the converter picks a character for the shape over the cell's two
// pixels (docs/model.md R7), so those are what shows.
test('R11: a character a shape reaches over gives way to it, under the layer above the base and over it', async () => {
  const { project, workspace, seen, done } = await mountPixelView(null, { overlay: 0 });
  pin(project, 4, 3, '█');
  pin(project, 10, 3, '█');
  project.commitEdit();
  workspace.pickLayer(project.addLayer('vector', 'base')); // right on the base: the lower group's
  project.addShape(rectShape(4, 7, 5, 8, { fill: '#ff0000' })); // the cell's lower pixel
  const over = project.addLayer('vector', 'edit');
  workspace.pickLayer(over);
  project.addShape(rectShape(10, 7, 11, 8, { fill: '#ff0000' }));
  await settle(project);
  expect(project.lowerGroup.upper).toContain(over);
  for (const col of [4, 10]) {
    expect(shown(seen, col, 3)).toEqual([BLACK, RED]);
    expect(shown(seen, col, 3)).toEqual(stored(project, col, 3));
  }
  done();
});

test('R11: a hidden base shows no characters of its own', async () => {
  const { project, seen, done } = await mountPixelView(null, { overlay: 0 });
  pin(project, 4, 3, '█');
  project.commitEdit();
  project.setLayerHidden('base', true);
  await settle(project);
  expect(shown(seen, 4, 3)).toEqual([BLACK, BLACK]);
  project.setLayerHidden('base', false);
  await settle(project);
  expect(shown(seen, 4, 3)).toEqual([WHITE, WHITE]);
  done();
});

// The look is the cell's as the art style shows it: in Color ASCII a character keeps a background its two pixels give it
// (R8) and is ink on black when they're one color; in Monochrome ASCII it's white on black.
for (const [style, shade, block] of [['colorAscii', [128, 128, 255], RED], ['ascii', gray(0.5), WHITE]]) {
  test(`R11: in ${style} a character on the base shows as that style shows it`, async () => {
    const { project, seen, done } = await mountPixelView(null, { overlay: 0 });
    pin(project, 4, 3, '▒', '#ffffff', '#0000ff');
    pin(project, 6, 3, '█', '#ff0000', '#ff0000');
    pin(project, 8, 3, '░', '#ff0000', '#ff0000');
    project.commitEdit();
    project.renderStyle = style;
    await settle(project);
    expect(shown(seen, 4, 3)).toEqual([shade, shade]);
    expect(shown(seen, 6, 3)).toEqual([block, block]);
    for (const col of [4, 6, 8]) expect(shown(seen, col, 3)).toEqual(look(project, col, 3));
    expect(shown(seen, 8, 3)).not.toEqual([RED, RED]); // a quarter ink on black, not its two red pixels
    done();
  });
}

test('R11: with a palette and Best match, a character on the base keeps its blend between the palette\'s colors', async () => {
  const { project, seen, done } = await mountPixelView(null, { overlay: 0 });
  Object.assign(project, { quantize: 'cga', charChoice: 'best' });
  await settle(project);
  pin(project, 4, 3, '▒');
  project.commitEdit();
  await settle(project);
  expect(shown(seen, 4, 3)).toEqual([gray(0.5), gray(0.5)]);
  expect(stored(project, 4, 3)).toEqual([BLACK, WHITE]);
  done();
});

test('R11: an art layer\'s characters show their look, above the layers and right on the base', async () => {
  const { project, workspace, seen, done } = await mountPixelView(null, { overlay: 0 });
  project.typeAt(4, 3, '▒', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  workspace.selection = { c0: 4, r0: 3, c1: 4, r1: 3 };
  project.makeArtLayer();
  await settle(project);
  expect(project.editCells.size).toBe(0);
  expect(project.cells[3 * project.cols + 4].char).toBe('▒');
  expect(project.lowerGroup.upper.length).toBe(1); // the art's vector layer, over Layer 1
  expect(shown(seen, 4, 3)).toEqual([gray(0.5), gray(0.5)]);
  project.deleteLayer('edit'); // the vector layer is right on the base now: the lower group's
  await settle(project);
  expect(project.lowerGroup.upper.length).toBe(0);
  expect(project.cells[3 * project.cols + 4].char).toBe('▒');
  expect(shown(seen, 4, 3)).toEqual([gray(0.5), gray(0.5)]);
  done();
});

test('R11: a frame built for playing shows the look too', async () => {
  const { project, done } = await mountPixelView(null, { overlay: 0 });
  pin(project, 4, 3, '▒');
  project.commitEdit();
  project.addFrame('duplicate');
  await settle(project);
  const built = await project.builtFrame(0);
  const at = (y) => [...built.output.getContext('2d').getImageData(4, y, 1, 1).data].slice(0, 3);
  expect([at(6), at(7)]).toEqual([gray(0.5), gray(0.5)]);
  done();
});

// A Blank frame dims what it inherits toward the base under it (the ghost): toward a character there as it looks.
test('R11: on a Blank frame, paint inherited over a character on the base dims toward the character\'s look', async () => {
  const { project, workspace, seen, done } = await mountPixelView(null, { overlay: 0 });
  project.setAnimate(true);
  pin(project, 4, 3, '█');
  project.commitEdit();
  workspace.pickLayer('edit');
  project.paintEditPixels([red(4, 6, 1)]);
  project.commitEdit();
  project.addFrame('blank');
  await settle(project);
  expect(project.shownCells[3 * project.cols + 4]).not.toBe(project.cells[3 * project.cols + 4]); // inherited: dimmed
  const [top, bottom] = shown(seen, 4, 3), faded = Math.round(255 * (1 - project.ghostStrength));
  expect(top[0]).toBe(255); // red toward the block's white, not toward its black background
  expect(Math.abs(top[1] - faded)).toBeLessThanOrEqual(2);
  expect(bottom).toEqual(WHITE);
  done();
});

test('R11: the Overlay still draws a layer\'s character over the look under it', async () => {
  const { project, workspace, seen, done } = await mountPixelView();
  pin(project, 4, 3, '█');
  project.commitEdit();
  workspace.pickLayer('edit');
  project.typeAt(4, 3, 'A', { fg: '#ff0000', bg: '#ff0000' });
  project.commitEdit();
  await settle(project);
  expect(shown(seen, 4, 3)).toEqual([RED, RED]);
  workspace.ansiOverlay = 0;
  await settle(project);
  expect(shown(seen, 4, 3)).toEqual([WHITE, WHITE]);
  done();
});

// The looks are kept as an image and drawn with it: a redraw (a scroll, a zoom) asks nothing of any cell.
test('R11: a redraw with nothing changed works out no cell again', async () => {
  const { project, workspace, seen, done } = await mountPixelView('/tests/fixtures/projects/base-character-lines.phosphor', { overlay: 0 });
  const asked = vi.spyOn(project.renderer, 'pinAt');
  workspace.setEditZoom(4);
  await settle(project);
  expect(asked).not.toHaveBeenCalled();
  expect(shown(seen, 11, 2)).toEqual([WHITE, WHITE]);
  pin(project, 30, 5, '█'); // an edit asks about its own cells, not the grid's
  project.commitEdit();
  await settle(project);
  expect(shown(seen, 30, 5)).toEqual([WHITE, WHITE]);
  expect(asked.mock.calls.length).toBeLessThan(10);
  done();
});
