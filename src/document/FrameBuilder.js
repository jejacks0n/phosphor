/**
 * Builds a frame's cells for playing, through the same path a still takes: a second Renderer, its own
 * paint layer, the composited output, then the edit cells. Coverage shortcuts (coverCell) differ from that
 * path on solid characters, the ASCII styles and soft paint under a palette, so frames would change look when
 * played. The editing renderer, paint layer and history are never touched.
 *
 * A built frame is { cells, output, editCells }: the cells a still would show, a copy of its output canvas, and
 * its edit cells. Cells that match the frame before are the same objects, so a frame costs an array plus what
 * differs, and what draws them can compare identity.
 */
import PaintLayer from './PaintLayer.js';
import ShapeLayer from './ShapeLayer.js';
import { isShapeKey } from './shapes.js';
import { shownShapes } from './followers.js';
import Renderer from './Renderer.js';
import { paintImage } from './frames.js';
import { getPaletteColors } from '../lib/ImageProcessor.js';
import { layoutWide } from '../lib/Cells.js';
import { ctx2d } from '../lib/Canvas.js';

const sameColor = (a, b) => a === b || (a.hex === b.hex && (a.c === b.c || typeof a.c !== 'number'));
const sameCell = (a, b) => a === b || (a.char === b.char && a.wide === b.wide && sameColor(a.fg, b.fg) && sameColor(a.bg, b.bg));

// What a frame shows with hidden layers left out ({ edit, vector }: whether each is hidden): the edit layer's cells and
// paint, or the shapes (and art layers). others: the drawing has other cells layers, whose keys (layerInfo.js) are left
// out too. ponytail: a frame plays the edit layer alone, until frames are built from the whole stack.
function shownOf(resolved, hidden) {
  if (!hidden.edit && !hidden.vector && !hidden.others) return resolved;
  return new Map([...resolved].filter(([key]) => (isShapeKey(key) ? !hidden.vector : !hidden.edit && !(hidden.others && key.includes(':')))));
}

// A frame's shapes, from its resolved states, as they're drawn: followers on their paths, guides left out.
function shapesOf(resolved) {
  const shapes = new Map();
  for (const [key, { cell }] of resolved) if (cell && isShapeKey(key)) shapes.set(key, cell);
  return shownShapes(shapes);
}

export default class FrameBuilder {
  #renderer = new Renderer();
  #scratch = null;
  #shapes = null; // its own ShapeLayer over the store's base layer: each frame has its own shapes
  #hidden = { base: false, edit: false, vector: false, others: false }; // the layers left out

  // The picture through the pipeline, for these settings. stores: the store's base layer and records, which
  // are under every frame, and hidden: the layers left out ({ base, edit, vector, others }).
  async prepare(image, params, { baseLayer, baseRecords, hidden = this.#hidden }) {
    this.#hidden = hidden;
    this.#shapes = baseLayer ? new ShapeLayer(baseLayer) : null;
    if (this.#shapes) this.#shapes.hideBase = !!hidden.base;
    Object.assign(this.#renderer, { baseLayer, baseRecords, shapes: this.#shapes, hideBase: !!hidden.base });
    this.#scratch = new PaintLayer({ cols: params.cols, rows: params.rows, scale: 1 });
    await this.#renderer.render(image, params, this.#scratch, null);
  }

  // The Number palette for a whole movie: every frame's output, before it's quantized, as one picture. Each
  // frame's unsnapped output is what a still's palette is picked from. resolved: every frame's.
  // ponytail: holds every frame's pixels at once while it picks, so this is what the frame limit protects.
  moviePalette(resolved, params) {
    const renderer = this.#renderer, { cols, rows } = params, size = cols * rows * 4;
    const all = new Uint8ClampedArray(size * resolved.length);
    renderer.usePalette([]); // none to snap to, and none to pick
    resolved.forEach((each, at) => {
      const frame = shownOf(each, this.#hidden);
      this.#scratch.loadGrid(paintImage(frame, cols, rows));
      this.#shapes?.set(shapesOf(frame));
      renderer.composite(this.#scratch, params);
      all.set(ctx2d(renderer.outputCanvas).getImageData(0, 0, cols, rows).data, at * size);
    });
    return getPaletteColors(params, { getImageData: () => all });
  }

  usePalette(palette) {
    this.#renderer.usePalette(palette);
  }

  // resolved: what the frame shows (frames.js). previous: the frame before's build, to share cells with.
  build(all, params, previous = null) {
    const resolved = shownOf(all, this.#hidden), renderer = this.#renderer, { cols, rows } = params;
    this.#scratch.loadGrid(paintImage(resolved, cols, rows));
    this.#shapes?.set(shapesOf(resolved));
    renderer.composite(this.#scratch, params);
    const editCells = new Map();
    for (const [key, { cell }] of resolved) if (cell && !isShapeKey(key)) editCells.set(key, cell);
    const cells = layoutWide(renderer.composeAll(renderer.cellsFromOutput(params), editCells, params), cols);
    if (previous?.cells.length === cells.length) {
      for (let i = 0; i < cells.length; i++) if (sameCell(cells[i], previous.cells[i])) cells[i] = previous.cells[i];
    }
    const output = document.createElement('canvas');
    output.width = cols;
    output.height = rows;
    ctx2d(output).drawImage(renderer.outputCanvas, 0, 0);
    return { cells, output, editCells };
  }
}
