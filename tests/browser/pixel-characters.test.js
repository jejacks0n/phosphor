// The PIXEL view shows a character of someone's own on the base (a pin, an art layer's) as it looks at half-cell scale:
// per half, its background blended toward its foreground by how much of that half the glyph inks (docs/model.md R11).
// Nothing stored changes: the pixels under it are still the cell's two colors, which the drawing tools and the Eyedropper
// read (the fills and the Wand read the look: look-read.test.js).
import { test, expect, vi } from 'vitest';
import { settle } from '../support/app.js';
import { mountPixelView } from '../support/pixelView.js';
import { ctx2d } from '@/lib/Canvas.js';
import { halfColors, mix } from '@/lib/Cells.js';
import { rectShape } from '@/document/shapes.js';

const WHITE = [255, 255, 255], BLACK = [0, 0, 0], RED = [255, 0, 0];
const gray = (ink) => Array(3).fill(Math.round(255 * ink));
const rgb = ({ r, g, b }) => [r, g, b];
// A cell's two grid pixels as the view shows them, and as the output holds them (what the drawing tools and the Eyedropper read).
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
  project.eraseBasePixels([{ x: 4, y: 7 }]); // its foreground black: both its pixels black, so the pin is a black space (R11)
  project.commitEdit();
  await settle(project);
  expect(shown(seen, 4, 3)).toEqual([BLACK, BLACK]);
  expect(project.baseRecords.pins.get('4,3')).toBe(' ');
  project.undo();
  project.undo();
  project.undo();
  await settle(project);
  expect(shown(seen, 4, 3)).toEqual(before);
  done();
});

// Paint over a character tints it, as in the ANSI view (R2), and the look is of that cell: over a solid block the paint
// shows in the half it's in (the block becomes a ▄ of its two halves); over a shade it's in the shade's background or
// foreground, and shows through the whole cell by the ink.
test('R11: paint on a layer over a character on the base shows as the ANSI view tints it, on the layer above the base and on one above that', async () => {
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
  expect(shown(seen, 6, 3)).toEqual([[255, 128, 128], [255, 128, 128]]); // ▒ white on red now: half and half
  for (const col of [4, 6, 10, 12]) expect(shown(seen, col, 3), `column ${col}`).toEqual(look(project, col, 3));
  expect(shown(seen, 10, 3)).toEqual(shown(seen, 4, 3));
  expect(shown(seen, 12, 3)).toEqual(shown(seen, 6, 3));
  done();
});

// On a palette the paint goes into the character's two colors, each snapped as paint is, and they blend by the ink
// again. A soft stroke's faint edge then leaves a shade as it was, where snapping the blend itself would turn it to a
// palette color at the first trace of paint: a hard ring round every stroke over an ANSI file's shades.
test('R11: on a palette, faint paint over a shade leaves its look as it was, and one paint over the whole cell shows as the ANSI view has it', async () => {
  const { project, workspace, seen, done } = await mountPixelView(null, { overlay: 0 });
  project.quantize = 'cga';
  await settle(project);
  for (const col of [4, 6, 8]) pin(project, col, 3, '▒');
  project.commitEdit();
  workspace.pickLayer('edit');
  project.paintEditPixels([red(4, 6, 0.03), red(4, 7, 0.03), red(6, 6, 0.6), red(6, 7, 0.6), red(8, 6, 1), red(8, 7, 1)]);
  project.commitEdit();
  await settle(project);
  expect(project.renderer.paintAt(4, 6)).toBeTruthy();
  expect(shown(seen, 4, 3)).toEqual([gray(0.5), gray(0.5)]);
  expect(shown(seen, 6, 3)).not.toEqual([gray(0.5), gray(0.5)]);
  for (const col of [4, 6, 8]) expect(shown(seen, col, 3), `column ${col}`).toEqual(look(project, col, 3));
  done();
});

// An opened ANSI file is all characters on the base. It used to turn All cells on, so the Overlay drew each cell as it
// looks. They show that way on their own now, soft paint over them too: to the pixel what All cells shows, so leaving
// it off adds no banding to a stroke.
test('R11: an opened ANSI file shows every cell as it looks with All cells left off, the same as with it on, under soft strokes too', async () => {
  const { project, workspace, seen, done } = await mountPixelView('/tests/fixtures/ansi/past-the-edge.ans');
  expect(workspace.ansiOverlayAll).toBe(false);
  const lines = project.rows / 2, every = () => {
    const cells = [];
    for (let row = 0; row < lines; row++) for (let col = 0; col < project.cols; col++) cells.push(shown(seen, col, row));
    return cells;
  };
  const off = every();
  expect(off).toEqual(Array.from({ length: lines * project.cols }, (_, i) => look(project, i % project.cols, Math.floor(i / project.cols))));
  expect(new Set(off.flat().map(String)).size).toBeGreaterThan(4); // the file's art, not a blank canvas
  workspace.ansiOverlayAll = true;
  await settle(project);
  expect(every()).toEqual(off);

  // Three soft strokes across the art on Layer 1, as the Brush lays them, each fading down the canvas and crossing the last.
  workspace.ansiOverlayAll = false;
  workspace.pickLayer('edit');
  const stroke = (hex, opacity, from, slope) => {
    const pixels = [];
    for (let x = 4; x < project.cols - 4; x++) for (let d = -5; d <= 5; d++) pixels.push({ x, y: Math.round(from + slope * x) + d, alpha: 1 - Math.abs(d) / 6 });
    project.paintStroke(pixels, hex, { blockChars: 'plain', opacity });
    project.commitEdit();
  };
  stroke('#ffffff', 70, 6, 0.3);
  stroke('#ff2020', 60, 30, -0.3);
  stroke('#000000', 25, 18, 0);
  await settle(project);
  const painted = every();
  expect(painted).not.toEqual(off);
  expect(painted).toEqual(Array.from({ length: lines * project.cols }, (_, i) => look(project, i % project.cols, Math.floor(i / project.cols))));
  workspace.ansiOverlayAll = true;
  await settle(project);
  expect(every()).toEqual(painted);
  done();
});

// A Half-block's ▄ over a character takes its place (blockOver): a textured character's background in both halves, with
// the block's paint over it. The view shows that block, not the character under it.
test('R11: a Half-block ▄ over a character on the base shows as the block, on the layer above the base and on one above that', async () => {
  const { project, workspace, seen, done } = await mountPixelView(null, { overlay: 0 });
  for (const col of [4, 10]) pin(project, col, 3, 'A', '#ffffff', '#0000ff');
  project.commitEdit();
  const block = (col) => {
    project.writeEditCells([{ col, row: 3, attrs: { char: '▄' } }]);
    project.paintEditPixels([red(col, 6, 1)]);
    project.commitEdit();
  };
  workspace.pickLayer('edit');
  block(4);
  workspace.pickLayer(project.addLayer('cells', 'edit'));
  block(10);
  await settle(project);
  for (const col of [4, 10]) {
    expect(project.cells[3 * project.cols + col].char, `column ${col}`).toBe('▄');
    expect(shown(seen, col, 3), `column ${col}`).toEqual([RED, [0, 0, 255]]);
    expect(shown(seen, col, 3)).toEqual(look(project, col, 3));
  }
  done();
});

// A layer with characters of its own converts its paint over a character with no ink to tint (R2), a █ among them: the
// cell is a rendering of the pixels then, and it's that cell that shows, as the ANSI view has it, not the two pixels
// (black over white under the paint: a stripe).
test('R11: paint from a layer with its own characters over a █ on the base shows the character it converts to', async () => {
  const { project, workspace, seen, done } = await mountPixelView(null, { overlay: 0 });
  pin(project, 4, 3, '█');
  pin(project, 10, 3, '▒');
  project.commitEdit();
  const top = project.addLayer('cells', 'edit');
  project.setLayerChars(top, { seed: 'a-seed-of-its-own', chars: '░▒▓' });
  workspace.pickLayer(top);
  project.paintEditPixels([red(4, 6, 0.5), red(4, 7, 0.5), red(10, 6, 0.5), red(10, 7, 0.5)]);
  project.commitEdit();
  await settle(project);
  expect(project.cells[3 * project.cols + 4].char).not.toBe('█');
  expect(stored(project, 4, 3)[0]).not.toEqual(stored(project, 4, 3)[1]); // half red over its black background, and over its white
  expect(shown(seen, 4, 3)).toEqual(look(project, 4, 3));
  expect(project.cells[3 * project.cols + 10].char).toBe('▒'); // ink to tint: the shade stays, and its look with it
  expect(shown(seen, 10, 3)).toEqual(look(project, 10, 3));
  done();
});

// The report: soft paint in the ANSI view over an opened file's spaces (two colors, no ink), then the PIXEL view showed
// horizontal stripes. Where the paint isn't a tint but is converted (R2: a character with no ink, in the ASCII styles,
// and in ANSI under a layer with characters of its own), the view showed the cell's two pixels, its background over its
// foreground under the paint; the ANSI view shows the character it converts to.
for (const [style, ownChars] of [['colorAscii', false], ['ascii', false], ['ansi', true]]) {
  test(`R11: soft paint over spaces with no ink shows in PIXEL as the ANSI view shows it, with no stripes (${style}${ownChars ? ', under a layer of its own characters' : ''})`, async () => {
    const { project, workspace, seen, done } = await mountPixelView(null, { overlay: 0 });
    for (const col of [4, 5, 6]) pin(project, col, 3, ' ', '#ff0000', '#0000ff');
    project.commitEdit();
    project.renderStyle = style;
    if (ownChars) {
      project.setLayerChars('edit', { seed: 'a-seed-of-its-own', chars: '░▒▓' });
      workspace.pickLayer(project.addLayer('cells', 'edit'));
    } else workspace.pickLayer('edit');
    project.paintEditPixels([4, 5, 6].flatMap((x) => [{ x, y: 6, r: 255, g: 128, b: 32, alpha: 0.4 }, { x, y: 7, r: 255, g: 128, b: 32, alpha: 0.4 }]));
    project.commitEdit();
    await settle(project);
    for (const col of [4, 5, 6]) {
      const [top, bottom] = stored(project, col, 3);
      expect(top, `column ${col}`).not.toEqual(bottom); // the stripe under it: blue over red, with the paint over each
      expect(shown(seen, col, 3), `column ${col}`).toEqual(look(project, col, 3));
    }
    done();
  });
}

// A shape over a pinned character takes the cell: the converter picks a character for the shape over the pixels under it
// (docs/model.md R7), so those are what shows: the character's look with the shape over it (the white █'s top stays
// white), on a vector layer right on the base or above it.
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
  for (const col of [4, 10]) expect(shown(seen, col, 3), `column ${col}`).toEqual([WHITE, RED]);
  expect(shown(seen, 4, 3)).toEqual(stored(project, 4, 3)); // the pin gives way: the pixels show
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
test('R11: on a Blank frame, paint inherited over a character on the base shows solid over the character\'s look', async () => {
  const { project, workspace, seen, done } = await mountPixelView(null, { overlay: 0 });
  project.setAnimate(true);
  pin(project, 4, 3, '█');
  project.commitEdit();
  workspace.pickLayer('edit');
  project.paintEditPixels([red(4, 6, 1)]);
  project.commitEdit();
  project.addFrame('blank');
  await settle(project);
  expect(project.shownCells).toBe(project.cells); // inherited: the frame's own, not a ghost
  const [top, bottom] = shown(seen, 4, 3);
  expect(top).toEqual(RED);
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
