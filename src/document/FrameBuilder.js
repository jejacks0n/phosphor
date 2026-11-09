/**
 * Builds a frame's cells for playing, through the same path a still takes: a second Renderer, its own
 * paint layer, the composited output, then the edit cells. Coverage shortcuts (coverCell) differ from that
 * path on solid characters, the ASCII styles and soft paint under a palette, so frames would change look when
 * played. The editing renderer, paint layer and history are never touched.
 *
 * A frame's keys name their layers (layerInfo.js), and the stack is laid as a still's is: the lower group (lowerGroup)
 * through the pipeline, with a scratch paint layer for its cells layer and a ShapeLayer over the store's base for its
 * vector layers, then each upper layer over the group's cells (Renderer.composeUpper), with a scratch paint layer or an
 * alone ShapeLayer of its own. Hidden layers are left out.
 *
 * A built frame is { cells, output, editCells }: the cells a still would show, a copy of what the PIXEL view shows, and
 * every layer's cells by position (for the overlay). Cells that match the frame before are the same objects, so a
 * frame costs an array plus what differs, and what draws them can compare identity.
 */
import PaintLayer from './PaintLayer.js';
import ShapeLayer from './ShapeLayer.js';
import { isShapeKey } from './shapes.js';
import { shownShapes } from './followers.js';
import { keyLayer, layersFromOld, lowerGroup } from './layerInfo.js';
import Renderer from './Renderer.js';
import { paintImage } from './frames.js';
import { getPaletteColors } from '../lib/ImageProcessor.js';
import { layoutWide } from '../lib/Cells.js';
import { ctx2d } from '../lib/Canvas.js';

const sameColor = (a, b) => a === b || (a.hex === b.hex && (a.c === b.c || typeof a.c !== 'number'));
const sameCell = (a, b) => a === b || (a.char === b.char && a.wide === b.wide && sameColor(a.fg, b.fg) && sameColor(a.bg, b.bg));
const NO_SHAPES = new Map();

// The cells among states (a layer's, bare keys), as a map of entries.
function cellsIn(states) {
  const cells = new Map();
  for (const [key, { cell }] of states) if (cell && !isShapeKey(key)) cells.set(key, cell);
  return cells;
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
  #layers = layersFromOld(null, { hasShapes: false });
  #lower = lowerGroup(this.#layers, {}); // these layers have no chars of their own
  #upper = []; // the layers above the lower group, each with its scratch and params: { id, kind, paint, params } or { id, kind, layer, params }
  #plain = true; // every key a frame holds is the lower group's, as before layers: nothing to split

  // The picture through the pipeline, for these settings. stores: the store's base layer and records, which
  // are under every frame, and layers: the drawing's, bottom first, whose eyes say what's left out. baseChars: the
  // bottom's character settings, and layerParams each layer's params (the store's), when layers have their own.
  async prepare(image, params, { baseLayer, baseRecords, layers = this.#layers, baseChars, layerParams = null }) {
    const shown = layers.filter((layer, at) => !at || !layer.hidden), hideBase = !!layers[0]?.hidden;
    this.#layers = layers;
    this.#lower = lowerGroup(shown, baseChars);
    this.#plain = shown.length === layers.length && !this.#lower.upper.length && (this.#lower.cells ?? 'edit') === 'edit';
    this.#shapes = baseLayer ? new ShapeLayer(baseLayer) : null;
    if (this.#shapes) this.#shapes.hideBase = hideBase;
    Object.assign(this.#renderer, { baseLayer, baseRecords, shapes: this.#shapes, hideBase });
    this.#scratch = new PaintLayer({ cols: params.cols, rows: params.rows, scale: 1 });
    this.#upper = this.#lower.upper.map((id) => {
      const { kind } = layers.find((layer) => layer.id === id), own = layerParams?.get(id) ?? params;
      if (kind === 'cells') return { id, kind, paint: new PaintLayer({ cols: params.cols, rows: params.rows, scale: 1 }), params: own };
      const layer = new ShapeLayer(null);
      layer.grid(params.cols, params.rows, baseLayer?.scale ?? 1);
      return { id, kind, layer, params: own };
    });
    await this.#renderer.render(image, params, this.#scratch, null);
  }

  // A frame's resolved states split by layer: states, the lower group's cells layer's (bare keys); shapes, the group's
  // vector layers' as drawn; upper, each upper layer's (a vector layer's as drawn); every, every cells layer's cells by
  // position. A plain stack hands the frame over as it is, with nothing copied.
  #split(all) {
    if (this.#plain) return { states: all, shapes: shapesOf(all), upper: null, every: null };
    const { cells: lowerId, vectors } = this.#lower, states = new Map(), shapes = new Map(), every = new Map();
    const upper = new Map(this.#upper.map(({ id }) => [id, new Map()]));
    for (const [key, state] of all) {
      if (isShapeKey(key)) {
        if (!state.cell) continue;
        const id = state.cell.layer ?? 'vector';
        if (vectors.includes(id)) shapes.set(key, state.cell);
        else upper.get(id)?.set(key, state.cell);
        continue;
      }
      const { id, key: at } = keyLayer(key);
      if (id === lowerId) states.set(at, state);
      else upper.get(id)?.set(at, state);
      if (state.cell && (id === lowerId || upper.has(id))) every.set(at, state.cell);
    }
    for (const u of this.#upper) if (u.kind === 'vector') upper.set(u.id, shownShapes(upper.get(u.id)));
    return { states, shapes: shownShapes(shapes), upper, every };
  }

  // The lower group's shapes in the layers' order (shapes.js: stacked).
  #rank = (shape) => this.#layers.findIndex((layer) => layer.id === (shape.layer ?? 'vector'));

  // The lower group composited for a frame: its paint and shapes in, the output drawn.
  #compositeLower(states, shapes, params) {
    this.#scratch.loadGrid(paintImage(states, params.cols, params.rows));
    this.#shapes?.set(shapes, this.#rank);
    this.#renderer.composite(this.#scratch, params);
  }

  // The Number palette for a whole movie: every frame's output, before it's quantized, as one picture. Each
  // frame's unsnapped output is what a still's palette is picked from. resolved: every frame's.
  // ponytail: holds every frame's pixels at once while it picks, so this is what the frame limit protects.
  moviePalette(resolved, params) {
    const renderer = this.#renderer, { cols, rows } = params, size = cols * rows * 4;
    const all = new Uint8ClampedArray(size * resolved.length);
    renderer.usePalette([]); // none to snap to, and none to pick
    resolved.forEach((each, at) => {
      const { states, shapes } = this.#split(each);
      this.#compositeLower(states, shapes, params);
      all.set(ctx2d(renderer.outputCanvas).getImageData(0, 0, cols, rows).data, at * size);
    });
    return getPaletteColors(params, { getImageData: () => all });
  }

  usePalette(palette) {
    this.#renderer.usePalette(palette);
  }

  // resolved: what the frame shows (frames.js). previous: the frame before's build, to share cells with.
  build(all, params, previous = null) {
    const { states, shapes, upper, every } = this.#split(all), renderer = this.#renderer, { cols, rows } = params;
    this.#compositeLower(states, shapes, params);
    const editCells = cellsIn(states);
    let cells = renderer.composeAll(renderer.cellsFromOutput(params), editCells, params);
    renderer.upper = this.#upper.map((u) => {
      if (u.kind === 'vector') {
        u.layer.set(upper.get(u.id) ?? NO_SHAPES);
        return { kind: 'vector', layer: u.layer, params: u.params };
      }
      const own = upper.get(u.id) ?? NO_SHAPES;
      u.paint.loadGrid(paintImage(own, cols, rows));
      return { kind: 'cells', cells: cellsIn(own), paint: u.paint, params: u.params };
    });
    if (renderer.upper.length) cells = renderer.composeUpper(cells, null, renderer.palette);
    cells = layoutWide(cells, cols);
    if (previous?.cells.length === cells.length) {
      for (let i = 0; i < cells.length; i++) if (sameCell(cells[i], previous.cells[i])) cells[i] = previous.cells[i];
    }
    const output = document.createElement('canvas');
    output.width = cols;
    output.height = rows;
    ctx2d(output).drawImage(renderer.shownCanvas(), 0, 0);
    return { cells, output, editCells: every ?? editCells };
  }
}
