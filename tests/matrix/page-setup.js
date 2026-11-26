// Runs in the page (served by the dev server at /tests/matrix/page-setup.js): builds a foundation and the two-layer
// setup with the app's own stores and tools, the same instances the app uses. Points are grid pixels: x the column, y
// twice the line (a cell is one pixel wide and two tall). Every item checks that it changed the canvas in its region.
import '/src/tools/index.js'; // puts the tools' refusal guards on their begin, as the app has them
import pencil from '/src/tools/pencil.js';
import brush from '/src/tools/brush.js';
import eraser from '/src/tools/eraser.js';
import shapes from '/src/tools/shapes.js';
import bucket from '/src/tools/bucket.js';
import gradient from '/src/tools/gradient.js';
import { blur, dodge, burn } from '/src/tools/retouch.js';
import { rectShape, ellipseShape, polygonShape, withShape, fillAs } from '/src/document/shapes.js';
import { busyMessage } from '/src/composables/useBusy.js';
import { GRID, LAYER1, VECTOR, OVERLAP } from '/tests/matrix/layout.mjs';

const app = () => window.__app;
const frame = () => new Promise((r) => requestAnimationFrame(r));
export async function settle() {
  const { project } = app();
  const busy = () => project._renderQueued || project._rendering || busyMessage.value;
  await frame();
  for (let i = 0; i < 900 && busy(); i++) await frame();
  if (busy()) throw new Error('never settled');
  await frame();
}

const P = (col, row) => ({ x: col + 0.5, y: 2 * row + 1 }); // a cell's middle
const ev = { stopPropagation() {}, preventDefault() {}, shiftKey: false };
const ctx = (view) => {
  const { project, workspace } = app();
  workspace.editorTab = view;
  return { project, workspace, view, unit: { x: 1, y: 1 } };
};
const opts = (o) => Object.assign(app().workspace, o);
const colors = (fg, bg) => opts({ editFgColor: fg, editFgNone: !fg, editBgColor: bg ?? '#000000', editBgNone: !bg });

// The canvas in a region, as text, to tell whether an item drew anything.
const regionKey = ([c, r, w, h]) => {
  const { project } = app(), out = [];
  for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) {
    const cell = project.cells[y * project.cols + x];
    out.push(`${cell?.char}${cell?.fg?.hex}${cell?.bg?.hex}`);
  }
  return out.join('|');
};
export const log = [];
async function item(name, region, draw) {
  const before = regionKey(region);
  await draw();
  app().project.commitEdit?.();
  await settle();
  const changed = regionKey(region) !== before;
  log.push({ name, changed });
  if (!changed) console.warn(`setup item drew nothing: ${name}`);
}

async function drag(tool, view, points, settings = {}) {
  opts(settings);
  const c = ctx(view);
  tool.begin(c, points[0], ev);
  for (let i = 1; i < points.length; i++) tool.move(c, points[i - 1], points[i]);
  tool.end?.(c);
  await settle();
}
// Shapes and the Pencil lay paint at the Brush's Opacity and Build up (docs/layers.md, Opacity, Build Up, and Flow), so
// each sets them, or item 7's 50% carries over.
const SOLID = { editBrushOpacity: 100, editBrushStack: true };
async function shape(view, from, to, settings, shift = false) {
  opts({ ...SOLID, ...settings });
  app().workspace.isShiftPressed = shift;
  const c = ctx(view);
  shapes.begin(c, from, ev);
  shapes.move(c, from, to);
  shapes.end(c);
  app().workspace.isShiftPressed = false;
  await settle();
}
const curve = ([c, r, w, h], n = 40, amp = 0.4) => Array.from({ length: n + 1 }, (_, i) => ({
  x: c + 0.5 + (i / n) * (w - 1),
  y: 2 * (r + h / 2) + Math.sin((i / n) * Math.PI * 2) * h * amp * 2,
}));
const down = (col, [, r, , h]) => [P(col, r), P(col + 1, r + Math.floor(h / 2)), P(col, r + h - 1)];

// ---- Foundation -------------------------------------------------------------------------------------------------
// { from: 'image'|'blank'|'edit'|'base'|'picture', style: 'ansi'|'colorAscii'|'ascii', mode: 'random'|'best'|'shape'|'weight',
//   palette: 'none'|'vga'|'cga'|'count'|'palette', adjust: null|{ key, value }, file: { name, base64, type } }
export async function foundation(f) {
  const { project, workspace } = app();
  const file = f.file && new File([Uint8Array.from(atob(f.file.base64), (c) => c.charCodeAt(0))], f.file.name, { type: f.file.type });
  if (f.from === 'image') await project.setImageFromFile(file);
  else if (f.from === 'blank') await project.setBlankCanvas({ cols: GRID.cols, rows: GRID.rows * 2 });
  else await project.openArtFile(file, { layer: f.from });
  await settle();
  workspace.pickLayer('base');
  project.aspectLock = false;
  project.cols = GRID.cols;
  project.rows = GRID.rows * 2;
  project.render();
  await settle();
  project.renderStyle = f.style;
  project.quantize = f.palette;
  if (f.palette === 'count') project.colorCount = 16;
  await settle();
  const ascii = f.style !== 'ansi';
  project.setLayerChars('base', {
    [ascii ? 'charChoiceAscii' : 'charChoice']: f.mode,
    ...(!ascii && { chars: '▄░▒▓█' }), // Blocks & shades (src/lib/charsetPresets.js)
    solids: 10,
    ...(f.palette !== 'none' && { ditherStyle: 'floyd', dither: 3 }),
  });
  project.commitLayerChars();
  if (f.adjust) { project.setSlider(f.adjust.key, f.adjust.value); project.commitSliders(f.adjust.key); }
  await settle();
  return { cols: project.cols, lines: project.cells.length / project.cols };
}

// ---- Setup: Layer 1 and the vector layer ----------------------------------------------------------------------------
// A layer's own characters: By shape, from the Hi-res set (src/lib/charsetPresets.js).
const HIRES_BY_SHAPE = { charChoice: 'shape', charChoiceAscii: 'shape', chars: '▖▗▘▝▚▞▙▛▜▟▐▌▁▂▃▄▅▆▇█' };
export async function setup() {
  const { project, workspace } = app();
  const layer1 = project.addLayer('cells', 'base');
  workspace.pickLayer(layer1);
  await settle();
  const L = LAYER1;
  const brushBase = { editBrushSize: 3, editBrushHardness: 0, editBrushOpacity: 100, editBrushFlow: 100, editBrushStack: true, brushDrawWith: 'normal' };

  // 1: the poem; line 1 and 3 with a background, line 2 without. 25: some of line 1's cells swapped.
  await item('1 poem', L.poem, async () => {
    const lines = [
      ['Ink on the old glass screen,', { fg: '#ffffff', bg: '#1a237e' }],
      ['half a block of evening light,', { fg: '#ffeb3b' }],
      ['the cursor blinks on.', { fg: '#000000', bg: '#ff9800' }],
    ];
    lines.forEach(([text, attrs], i) => [...text].forEach((ch, x) => project.typeAt(L.poem[0] + x, L.poem[1] + i, ch, attrs)));
  });
  await item('25 swap cell FG/BG', L.poem, async () => {
    for (let x = 2; x < 9; x++) project.flipCell(x, L.poem[1]);
  });

  // 30: a shape typed by hand in block characters (the Text tool, not a shape): drawing in blocks, so Blend into source
  // image puts it into the picture unpinned, where Blur reaches it, as it does a shape's blocks (the poem stays pinned).
  await item('30 typed block shape', L.typedBlocks, async () => {
    const rows = [['▗▄▄▄▖ ▐█▌ ░▒▓█', '#00e5ff'], ['▐███▌ ▝▀▘ █▓▒░', '#ff9100']];
    rows.forEach(([text, fg], i) => [...text].forEach((ch, x) => ch !== ' ' && project.typeAt(L.typedBlocks[0] + x, L.typedBlocks[1] + i, ch, { fg, bg: '#212121' })));
  });

  // 2-4: the Pencil.
  colors('#ff4081');
  await item('2 pencil curve, Colors only', L.pencilCurve, () => drag(pencil, 'output', curve(L.pencilCurve), { ...SOLID, pencilDrawWith: 'normal' }));
  colors('#80deea');
  await item('3 pencil single line, crossing itself', L.pencilSingle, () => drag(pencil, 'output',
    [P(38, 4), P(38, 1), P(52, 1), P(52, 8), P(38, 8), P(38, 4), P(55, 4)], { ...SOLID, pencilDrawWith: 'single', pencilConnect: true }));
  colors('#ffd54f');
  await item('4 pencil double line, crossing itself and 3', L.pencilDouble, () => drag(pencil, 'output',
    [P(46, 6), P(62, 6), P(62, 12), P(46, 12), P(46, 6), P(46, 9), P(64, 9)], { ...SOLID, pencilDrawWith: 'double', pencilConnect: true }));

  // 10, 11: fills inside them.
  // Tolerance 100: the whole inside of each box, whatever the picture under it; the box's own lines are the walls.
  opts({ ...SOLID, editFillTolerance: 100, editFillContiguous: true, editFillAllLayers: false, bucketFillWith: 'normal', gradientShape: 'linear' });
  colors('#00e676');
  await item('10 paint bucket inside 3', [39, 2, 12, 2], () => bucket.begin(ctx('output'), P(44, 2), ev) || settle());
  colors('#2979ff', '#ff1744');
  await item('11 gradient inside 4', [47, 10, 14, 2], () => drag(gradient, 'output', [P(47, 10), P(61, 11)]));

  // 5-7: brush strokes; 8, 12, 13 across them.
  colors('#ffea00');
  await item('5 brush curve', L.brushColorsOnly, () => drag(brush, 'input', curve(L.brushColorsOnly, 40, 0.3), brushBase));
  colors('#d500f9');
  await item('6 brush curve, Half-block', L.brushHalfBlock, () => drag(brush, 'output', curve(L.brushHalfBlock, 40, 0.3), { ...brushBase, brushDrawWith: 'half' }));
  colors('#00b0ff');
  await item('7 brush, 50% opacity', L.brushHalfOpacity, () => drag(brush, 'input', curve(L.brushHalfOpacity, 40, 0.3), { ...brushBase, editBrushOpacity: 50 }));
  const across = [66, 1, 28, 11];
  await item('8 eraser across 5-7', across, () => drag(eraser, 'input', down(71, across), { editEraserSoft: true, editEraserSize: 3, editEraserFlow: 100 }));
  const retouchBase = { retouchSize: 4, retouchStrength: 100, retouchHardness: 50, retouchRange: 'midtones' };
  await item('12 blur across 5-7', across, () => drag(blur, 'input', down(77, across), retouchBase));
  await item('13 dodge across 5-7', across, () => drag(dodge, 'input', down(83, across), retouchBase));
  await item('13 burn across 5-7', across, () => drag(burn, 'input', down(88, across), retouchBase));

  // 9: a shape in half blocks.
  colors('#ff6d00', '#6200ea');
  await item('9 half-block shape', L.halfBlockShape, () => shape('output', P(2, 13), P(13, 19), { shapeKind: 'ellipse', shapeDrawWith: 'half', shapeAntialias: false, shapeVerticalHalves: false, shapeBlockChars: false }));

  // 14: squares; the two half-block ones a pixel row (half a cell) apart, so one's edges are ▀ and the other's ▄.
  colors('#ffffff');
  const sq = { shapeKind: 'rect', shapeAntialias: false, shapeVerticalHalves: false, shapeBlockChars: true, shapeConnect: true };
  await item('14 square, Single line', [16, 13, 11, 7], () => shape('output', P(16, 13), P(25, 18), { ...sq, shapeDrawWith: 'single' }, true));
  await item('14 square, Double line', [28, 13, 11, 7], () => shape('output', P(28, 13), P(37, 18), { ...sq, shapeDrawWith: 'double' }, true));
  colors('#76ff03');
  await item('14 square, Half-block on top halves', [40, 13, 11, 7], () => shape('output', { x: 40.5, y: 26.5 }, { x: 49.5, y: 35.5 }, { ...sq, shapeDrawWith: 'half' }, true));
  await item('14 square, Half-block on bottom halves', [52, 13, 11, 7], () => shape('output', { x: 52.5, y: 27.5 }, { x: 61.5, y: 36.5 }, { ...sq, shapeDrawWith: 'half' }, true));

  // 19: Single and Double lines crossing.
  colors('#ffffff');
  await item('19 single line', L.crossingLines, () => shape('output', P(64, 16), P(72, 16), { shapeKind: 'line', shapeDrawWith: 'single', shapeConnect: true }));
  await item('19 double line crossing it', L.crossingLines, () => shape('output', P(68, 13), P(68, 19), { shapeKind: 'line', shapeDrawWith: 'double', shapeConnect: true }));

  // 15-18 and 20-24, in Half-block and again in Full-block.
  const circleKinds = [
    ['15 circle, anti-aliased', { shapeAntialias: true, shapeVerticalHalves: false, shapeBlockChars: false }, '#ffeb3b'],
    ['16 circle, not anti-aliased', { shapeAntialias: false, shapeVerticalHalves: false, shapeBlockChars: false }, '#ff5252'],
    ['17 circle, Half-column detail', { shapeAntialias: false, shapeVerticalHalves: true, shapeBlockChars: false }, '#69f0ae'],
    ['18 circle, anti-aliased, Write block glyphs', { shapeAntialias: true, shapeVerticalHalves: false, shapeBlockChars: true }, '#e040fb'],
  ];
  for (const [drawWith, region] of [['half', L.circlesHalf], ['full', L.circlesFull]]) {
    for (const [i, [name, o, fg]] of circleKinds.entries()) {
      colors(fg);
      const c0 = region[0] + i * 23, r0 = region[1];
      await item(`${name} (${drawWith})`, [c0, r0, 20, region[3]], () => shape('output', P(c0, r0), P(c0 + 16, r0 + 8), { shapeKind: 'ellipse', shapeDrawWith: drawWith, ...o }, true));
    }
  }
  const lineKinds = [
    ['20 horizontal-ish, anti-aliased', (c, r) => [P(c, r), P(c + 20, r + 2)], { shapeAntialias: true, shapeVerticalHalves: false, shapeBlockChars: false }, false],
    ['21 horizontal-ish, Half-column detail', (c, r) => [P(c, r + 4), P(c + 20, r + 6)], { shapeAntialias: false, shapeVerticalHalves: true, shapeBlockChars: false }, false],
    ['22 vertical-ish, anti-aliased, Write block glyphs', (c, r) => [P(c + 24, r), P(c + 27, r + 7)], { shapeAntialias: true, shapeVerticalHalves: false, shapeBlockChars: true }, false],
    ['23 vertical-ish, Half-column detail', (c, r) => [P(c + 31, r), P(c + 34, r + 7)], { shapeAntialias: false, shapeVerticalHalves: true, shapeBlockChars: false }, false],
    ['24 45 degrees, anti-aliased', (c, r) => [P(c + 37, r), P(c + 44, r + 7)], { shapeAntialias: true, shapeVerticalHalves: false, shapeBlockChars: false }, true],
  ];
  for (const [drawWith, region] of [['half', L.linesHalf], ['full', L.linesFull]]) {
    for (const [name, ends, o, shift] of lineKinds) {
      colors(drawWith === 'half' ? '#40c4ff' : '#ffab40');
      const [from, to] = ends(region[0], region[1]);
      await item(`${name} (${drawWith})`, region, () => shape('output', from, to, { shapeKind: 'line', shapeDrawWith: drawWith, ...o }, shift));
    }
  }

  // 26: a Pen shape on a new vector layer, a gradient fill and a stroke, merged down into Layer 1.
  await item('26 pen shape merged down', L.pen, async () => {
    const vec = project.addLayer('vector', layer1);
    workspace.pickLayer(vec);
    workspace.vectorStyle = { ...workspace.vectorStyle, fill: '#ff00ff', stroke: '#ffffff', width: 1.5 };
    const key = project.penPoint(75.2, 28);
    for (const [x, y] of [[81, 27], [83.5, 33], [79.5, 39], [76.7, 36.5], [74.5, 32]]) project.penPoint(x, y);
    project.finishPen({ closed: true });
    const s = project.shapes.get(key);
    project.updateShapes([[key, withShape(s, { fill: fillAs(s, 'linear', { from: '#ff00ff', to: '#00e5ff' }) })]]);
    await settle();
    project.mergeDown(vec);
    workspace.pickLayer(layer1);
  });
  // 26b: a polygon on a vector layer with its own characters (By shape, the Hi-res set), merged down into Layer 1.
  await item('26b polygon merged down, its layer By shape, Hi-res', L.penOwnChars, async () => {
    const vec = project.addLayer('vector', layer1);
    workspace.pickLayer(vec);
    project.setLayerChars(vec, HIRES_BY_SHAPE);
    project.commitLayerChars();
    const key = project.addShape(polygonShape(84.5, 27, 93.5, 39, 5, { fill: '#ffea00', stroke: '#ffffff', width: 1.5 }));
    const s = project.shapes.get(key);
    project.updateShapes([[key, withShape(s, { fill: fillAs(s, 'linear', { from: '#ffea00', to: '#d50000' }) })]]);
    await settle();
    if (project.mergeDown(vec) === false) throw new Error('26b: Merge down refused');
    workspace.pickLayer(layer1);
  });

  // The vector layer, above Layer 1: 27 free, 28 on cells, 29 on half cells, and the one overlap.
  const vector = project.addLayer('vector', layer1);
  workspace.pickLayer(vector);
  project.setLayerChars(vector, HIRES_BY_SHAPE); // its own characters
  project.commitLayerChars();
  const style = (fill, stroke) => ({ fill, stroke, width: 1 });
  const line = (x0, y0, x1, y1, stroke) => {
    workspace.vectorStyle = { ...workspace.vectorStyle, fill: null, stroke, width: 1 };
    project.penPoint(x0, y0);
    project.penPoint(x1, y1);
    project.finishPen({ closed: false });
  };
  await item('27 circle, square, line, free', VECTOR.free, () => {
    project.addShape(ellipseShape(97.3, 3.7, 105.3, 11.7, style('#ffeb3b', '#000000')));
    project.addShape(rectShape(107.6, 4.2, 115.6, 12.2, style('#ff5252', '#ffffff')));
    line(97.2, 20.6, 117.7, 27.3, '#ffffff');
  });
  await item('28 circle, square, line, on cells', VECTOR.cells, () => {
    project.addShape(ellipseShape(97, 36, 105, 44, style('#69f0ae', '#000000')));
    const box = project.addShape(rectShape(107, 36, 115, 44, style('#448aff', '#ffffff')));
    const s = project.shapes.get(box); // this one's fill a gradient
    project.updateShapes([[box, withShape(s, { fill: fillAs(s, 'linear', { from: '#448aff', to: '#ff4081' }) })]]);
    line(97, 50, 117, 58, '#ffffff');
  });
  await item('29 circle, square, polygon, on half cells', VECTOR.halfCells, () => {
    project.addShape(ellipseShape(97.5, 67, 105.5, 75, style('#e040fb', '#000000')));
    project.addShape(rectShape(107.5, 67, 115.5, 75, style('#ffab40', '#ffffff')));
    project.addShape(polygonShape(100.5, 79, 110.5, 89, 6, style('#18ffff', '#000000')));
  });
  await item('overlap: a circle over the end of stroke 7', OVERLAP, () => {
    project.addShape(ellipseShape(90, 17, 98, 25, style('#00bcd4', '#ffffff')));
  });
  workspace.pickLayer(layer1);
  await settle();
  return { layer1, vector, log };
}

// The drawing as a .pho, base64.
export async function pho() {
  const blob = await app().project.projectFile();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
