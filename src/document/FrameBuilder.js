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
import Renderer from './Renderer.js';
import { paintImage } from './frames.js';
import { layoutWide } from '../lib/Cells.js';
import { ctx2d } from '../lib/Canvas.js';

const sameColor = (a, b) => a === b || (a.hex === b.hex && (a.c === b.c || typeof a.c !== 'number'));
const sameCell = (a, b) => a === b || (a.char === b.char && a.wide === b.wide && sameColor(a.fg, b.fg) && sameColor(a.bg, b.bg));

export default class FrameBuilder {
  #renderer = new Renderer();
  #scratch = null;

  // The picture through the pipeline, for these settings. stores: the store's base layer and records, which
  // are under every frame.
  async prepare(image, params, { baseLayer, baseRecords }) {
    Object.assign(this.#renderer, { baseLayer, baseRecords });
    this.#scratch = new PaintLayer({ cols: params.cols, rows: params.rows, scale: 1 });
    await this.#renderer.render(image, params, this.#scratch, null);
  }

  // resolved: what the frame shows (frames.js). previous: the frame before's build, to share cells with.
  build(resolved, params, previous = null) {
    const renderer = this.#renderer, { cols, rows } = params;
    this.#scratch.loadGrid(paintImage(resolved, cols, rows));
    renderer.composite(this.#scratch, params);
    const editCells = new Map();
    for (const [key, { cell }] of resolved) if (cell) editCells.set(key, cell);
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
