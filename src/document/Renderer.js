/**
 * Turns the image + settings + base pixels + paint layer into cells. Owns the two canvases the
 * editors read: pipelineCanvas (processed image at cols x rows, nothing over it) and outputCanvas
 * (pipeline + base pixels + paint, quantized), which generated cells are built from; under Best
 * match and By shape (ANSI, with a palette) it shows the cells they chose instead (#showResolved).
 *
 * The base layer is the image through the pipeline with the base's own pixels over it (baseLayer,
 * a grid-resolution PaintLayer set by the store: erased, flipped, moved and merged-down pixels,
 * exact, and never put through the pipeline's resampling or effects). Edit cells (editCells, see
 * editCells.js) compose over the base, and paint draws over them: base -> edit cells -> paint. The
 * base layer's pins (baseRecords.js, set by the store) keep their characters.
 *
 * While there are shapes (the vector layer, shapes.js), the base layer is read through shapes, a
 * ShapeLayer: the base's pixels with the shapes drawn over them, at the same scale, so they convert
 * with the picture. A pin under a shape gives way to the conversion (pinAt).
 *
 * All of that is the lower group (layerInfo.js: lowerGroup): the bottom, the vector layers right on it and the next
 * cells layer. Every layer above it (upper) is laid over the group's cells one cell at a time (composeUpper), with no
 * error carried between cells but by a layer's own Floyd–Steinberg; an old document is the lower group alone, so
 * nothing it shows changes.
 *
 * The base layer is at the pipeline's processing scale (m x m pixels per grid pixel), so a block of
 * the picture moved into it keeps every processed pixel (processed: the picture with its effects,
 * before the color adjustments and the palette), and it's drawn the way the pipeline draws the
 * picture: adjusted, snapped to CGA/VGA, then averaged down to the grid. It looks the same wherever
 * it goes. (Sharpen is the exception: the shader sharpens after the adjustments, from neighbors
 * that aren't adjusted, so a sharpened block can differ a little.)
 */
import { processImage, processedImage, adjustedPixels, getPaletteColors, workingScale, fittingScale } from '../lib/ImageProcessor.js';
import { applyTransforms, transformsOn } from '../lib/PixelTransforms.js';
import { nearestColor, paletteIndex } from '../lib/ColorUtils.js';
import { effectiveColor } from '../lib/PixelTransforms.js';
import Canvas, { ctx2d, fitRect } from '../lib/Canvas.js';
import { buildCellsFromBytes, buildCell, keepsSeed, seededChar, weightedChar, cellIndex, cellOfPixel, charRowsOf, composeCell, coverCell, glyphsOf, halfColors, mix } from '../lib/Cells.js';
import { cellKey, parseKey } from './editCells.js';
import { EMPTY_BASE } from './baseRecords.js';
import { bayerNudge, ditherPixels, nudgeSpread } from '../lib/Dither.js';
import { snapsLate, resolves, carriesError, bestMatcher, resolveGrid, shapeMatcher, resolveShapes, SAMPLES } from '../lib/CharResolver.js';
import { loadReferenceFont, referenceInk, referenceMask, coverageOf } from '../lib/GlyphCoverage.js';
import ShapeMatcher from '../lib/ShapeMatcher.js';

export default class Renderer {
  pipelineCanvas = null;
  outputCanvas = null;
  palette = null;
  baseRecords = EMPTY_BASE; // the store keeps this in step with its own
  baseLayer = null;         // the base layer's pixels (PaintLayer), the store's
  shapes = null;            // the base layer with the vector layer's shapes over it (ShapeLayer), the store's
  hideBase = false;         // the base's eye is shut: the picture, its own pixels and its pins left out (the store's, set before a render)
  upper = [];               // the layers above the lower group, bottom to top (the store's, set before a render and a compose): { kind: 'cells', cells, paint, params } or { kind: 'vector', layer: ShapeLayer, params }
  everyLayer = [];          // what the Number palette counts over the picture (countCanvas), bottom to top, hidden layers too (the store's, set before a composite): { layer } drawn as the base is (the base with shapes over it, a vector layer alone) or { paint } (a cells layer's); none while the output is all there is
  #scratch = null;
  #countScratch = null; // #scratch's stand-in while countCanvas draws, so the lower group's paint stays there for the dither (#ditherUnder)
  #count = null;        // countCanvas's canvas
  #pictureCanvas = null; // the pipeline's own picture, even while the base is hidden: what the Number palette counts under every layer
  #pipelineData = null; // pipelineCanvas pixels
  #baseData = null;     // the pipeline with the base layer's pixels over it, from the last composite(): what edit cells sit on
  #paintData = null;    // transformed paint at grid resolution, from the last composite()
  #heldData = null;     // the output before the palette snap, while a held composite's stroke is open
  #heldPaint = null;    // and the paint layer it's drawing on, whose stroke's own paint shows in its own colors
  #dithered = null;     // { palette, key, raw, data }: #baseData dithered to the palette (raw: the #baseData it's from), while Dither is on
  #resolved = null;     // the base resolved to cells: { key, palette, raw, cells, carried, gpu } by Best match (raw: the #baseData they're from), { key, palette, cells, stale, gpu } by By shape (gpu: the GPU made them)
  #picture = null;      // By shape's samples of the picture alone (processImage), from the last render
  #samples = null;      // { picture, layer, key, version, data }: #picture with the base layer's own pixels over it (#shapeSamples)
  #painted = null;      // { of, layer, version, cells }: By shape's cells under paint (#resolvePainted), of the #resolved they go over
  #baseSnapped = null;  // { from, palette, data }: #baseData (from) snapped to the palette, for basePixels under Best match
  #fontReady = false;   // the reference font has loaded: Best match and By shape can measure glyphs
  #glyphs = new Map();  // chars -> the set's glyphs with their inks and masks in the reference font (a few sets: each layer can have its own)
  #snapped = null;      // the whole output's bytes and palette entries, from the composite that just snapped it
  #effective = new Map(); // stored color -> displayed Color, until the next render
  #source = null;       // { key, data }: the image through the pipeline with color adjustments neutral (stored colors)
  #processed = null;    // { image, key, scale, canvas }: the processed picture in the grid at the base layer's scale (processed)
  #baseDrawn = null;    // { layer, version, key, data, canvas }: the base layer as drawn at grid resolution (#baseGrid)
  #baseStored = null;   // the same for its stored colors (#baseGrid, stored)
  #baseParams = null;   // the last render's baseParams
  #chosen = null;       // a Number palette someone else picked (usePalette): composite doesn't pick its own
  #lowerEdits = null;   // the lower group's cells layer's map, from the last composeAll or updateCells: where its cells are exact
  #upperGrids = new WeakMap(); // an upper vector layer -> its shapes at grid resolution (#upperGrid), as #baseDrawn is the base's
  #upperStored = new WeakMap(); // an upper vector layer -> its shapes at grid resolution as stored (upperStoredAt)
  #upperPaints = new WeakMap(); // an upper cells layer's paint -> its pixels at grid resolution through the transforms (#upperPaint)
  #shownOver = null;    // { of, canvas, dirty }: the output with the upper layers' pixels over it (shownCanvas); dirty, the grid rect a compose changed since, or null for all of it
  #matchers = new WeakMap(); // an upper layer's params -> { palette, matcher }: Best match's or By shape's matcher for one of its cells (#upperChar)
  #upperSamples = new WeakMap(); // an upper vector layer -> { params, w, h, k, key, version, tiles }: its own samples at By shape's resolution, a tile of cells at a time (#samplesAt)
  #tiles = new Map();   // every upper layer's tile -> its layer's #upperSamples entry, least recently used first, within sampleBudget
  #tileBytes = 0;       // what #tiles hold
  sampleBudget = 32 * 1024 * 1024; // the most bytes of By shape samples upper layers keep, together
  #cellSamples = null;  // one cell's samples, for By shape on an upper layer (#upperChar)
  #exact = false;       // whether the cell #upperCell made last holds a character that's someone's own
  settled = null;       // the cells the last composeUpper laid over again with indexes, past them too, as a Floyd–Steinberg layer was worked out again (#settled), or null

  // Forget the previous image's canvases so nothing paints against them before the next render.
  reset() {
    this.shapes?.reset();
    this.pipelineCanvas = this.outputCanvas = this.palette = this.#chosen = this.#pictureCanvas = null;
    this.everyLayer = [];
    this.#pipelineData = this.#baseData = this.#paintData = this.#source = this.#processed = this.#baseDrawn = this.#baseStored = this.#baseParams = this.#snapped = this.#dithered = this.#resolved = this.#baseSnapped = this.#picture = this.#samples = this.#painted = null;
    this.#lowerEdits = this.#shownOver = null;
    this.#matchers = new WeakMap();
    this.#upperSamples = new WeakMap();
    this.#tiles = new Map();
    this.#tileBytes = 0;
    this.#upperGrids = new WeakMap();
    this.#upperStored = new WeakMap();
    this.#upperPaints = new WeakMap();
    this.upper = [];
    this.#effective = new Map();
  }

  // baseParams: params with the color adjustments neutral (settings.baseParams).
  async render(image, params, paintLayer, baseParams) {
    // An upper layer's own settings (upper, set before a render too) count: its glyphs are measured in it as well.
    if ((resolves(params) || this.upper.some((u) => resolves(u.params))) && !this.#fontReady) { // glyphs measured in a placeholder font would choose the characters
      // If it doesn't load, glyphs are measured in its fallbacks, ending in the system's monospace font,
      // which differs from computer to computer: the characters may then too.
      await loadReferenceFont().catch((error) => console.warn('IBM VGA did not load: Best match and By shape measure glyphs in a fallback font', error));
      this.#fontReady = true;
    }
    this.#dropTiles((kept) => !this.upper.some((u) => u.layer === kept.layer && u.params.charMode === 'shape'));
    const { canvas: pipeline, paletteColors, samples } = await processImage(image, params);
    // A hidden base: black in the picture's place, so nothing reads it (Best match and By shape included).
    this.pipelineCanvas = this.hideBase ? blackCanvas(params.cols, params.rows) : pipeline.canvas;
    this.#pictureCanvas = pipeline.canvas;
    this.#picture = this.hideBase && samples ? blackImage(samples.width, samples.height) : samples;
    this.palette = this.#chosen ?? paletteColors;
    this.#pipelineData = ctx2d(this.pipelineCanvas).getImageData(0, 0, params.cols, params.rows);
    this.#effective = new Map();

    // Underlying colors depend only on the image, grid, smoothing, effects and CGA/VGA, so color
    // adjustments don't redo this.
    this.#baseParams = baseParams;
    const sp = baseParams ?? {};
    const sourceKey = [params.cols, params.rows, JSON.stringify(params.fit), params.smoothing, sp.quantize, sp.blur, sp.sharpen, sp.flatten, sp.edges, sp.edgeColor, sp.edgeThickness, snapsLate(sp)].join();
    if (baseParams && (this.#source?.image !== image || this.#source.key !== sourceKey)) {
      const { canvas: source } = await processImage(image, baseParams, { samples: false });
      this.#source = { image, key: sourceKey, data: ctx2d(source.canvas).getImageData(0, 0, params.cols, params.rows) };
    }
    const scale = this.baseLayer?.scale;
    if (baseParams && scale && (this.#processed?.image !== image || this.#processed.key !== sourceKey || this.#processed.scale !== scale)) {
      // An image smaller than the grid is processed at its own size and scaled up: there are no
      // whole processed pixels per grid pixel, and the stored colors (#source) are what shows.
      const drawn = workingScale(image, params) ? await this.#processedInGrid(image, baseParams, scale) : { canvas: this.#sourceCanvas(), scale: 1 };
      this.#processed = { image, key: sourceKey, scale, canvas: drawn.canvas, drawnScale: drawn.scale };
    }

    const output = document.createElement('canvas');
    output.width = params.cols;
    output.height = params.rows;
    ctx2d(output);
    this.outputCanvas = output;
    this.composite(paintLayer, params);
    return this.cellsFromOutput(params);
  }

  // The processed picture (see the top) where it sits in the grid, at `scale` pixels per grid pixel;
  // black around it, as the pipeline fills the letterbox. What a block of the base copies.
  get processed() {
    return this.#processed && { canvas: this.#processed.canvas, scale: this.#processed.drawnScale };
  }

  #sourceCanvas() {
    const { data } = this.#source;
    const canvas = document.createElement('canvas');
    canvas.width = data.width;
    canvas.height = data.height;
    ctx2d(canvas).putImageData(data, 0, 0);
    return canvas;
  }

  // At the base layer's scale, or lower when the GPU can't process the picture that large (a project
  // made on a GPU that draws more); { canvas, scale } with the scale it's at.
  async #processedInGrid(image, baseParams, scale) {
    const { dx, dy, dw, dh } = baseParams.fit ?? fitRect(image.naturalWidth || image.width, image.naturalHeight || image.height, baseParams.cols, baseParams.rows);
    const m = fittingScale(scale, dw, dh);
    if (m < 1) return { canvas: this.#sourceCanvas(), scale: 1 };
    const picture = await processedImage(image, baseParams, { m });
    const canvas = document.createElement('canvas');
    canvas.width = baseParams.cols * m;
    canvas.height = baseParams.rows * m;
    const ctx = ctx2d(canvas);
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(picture, dx * m, dy * m);
    return { canvas, scale: m };
  }

  // The generated cells from the composited output (no edit cells, no pins: each has the converter's
  // own character, which a pin covers only while it's there): quantized to the palette, which also
  // gives the pixels their palette index (c), which the cells and CGA/VGA export rely on.
  // The output's bytes are read once and snapped in place (no object per pixel: this runs over the
  // whole grid on every render and slider step).
  // Under Best match the cells are the resolved ones (#resolved) with the paint over them (#shown);
  // a pinned cell is built from its pixels as Random builds it, the pin its character (composeAll),
  // from the picture (#pictureAt), not the output, which shows the resolved cells (#showResolved).
  cellsFromOutput(params) {
    const resolved = this.#resolvedFor(params);
    if (resolved) {
      const { cols } = params, checks = this.baseRecords.pins.size || this.shapes?.hasArt;
      return resolved.cells.map((cell, i) => {
        const col = i % cols, row = (i - col) / cols;
        if (!checks || this.pinAt(col, row) === undefined) return this.#shown(cell, col, row, params);
        return buildCell(this.#pictureAt(col, 2 * row), this.#pictureAt(col, 2 * row + 1), cell.char, params.renderStyle);
      });
    }
    const { data, indexes } = this.#snapped ?? snapToPalette(this.outputCanvas, this.palette);
    return buildCellsFromBytes(data, params.cols, params.rows, {
      charset: params.chars,
      charMode: params.charMode || 'random',
      renderStyle: params.renderStyle || 'ansi',
      seed: params.seed,
    }, indexes && { indexes, palette: this.palette });
  }

  // A resolved cell with any paint in it over it: under By shape the cell the paint makes
  // (#resolvePainted), else paint colors the character, never changes it (coverCell). While a stroke
  // is held, paint shows in its own colors, as #held has it.
  #shown(cell, col, row, params) {
    if (params.charMode === 'shape') return (this.#painted?.of === this.#resolved && this.#painted.cells[row * params.cols + col]) || cell;
    const top = this.paintAt(col, 2 * row), bottom = this.paintAt(col, 2 * row + 1);
    if (!top && !bottom) return cell;
    return coverCell(cell, top, bottom, { renderStyle: params.renderStyle, palette: this.#heldData ? null : this.palette });
  }

  // #resolved when it's for these settings and this grid (not between a resize and its render), else null.
  #resolvedFor(params) {
    const r = this.#resolved;
    if (!r) return null;
    if (r.params !== params) Object.assign(r, { params, fits: r.key === resolvedKey(params, params.cols, params.rows) });
    return r.fits ? r : null;
  }

  // Redraw outputCanvas: the pipeline image, then the base layer's pixels and the paint layer, each
  // with the color transforms applied. The Number palette (quantize 'count') is picked from that with
  // every other layer over it, hidden ones too (countCanvas), so the drawing's colors have places in it
  // and an eye never changes it; true when that changed the palette
  // (every cell may need its colors again, not just those under the change). hold: an edit is open
  // and the Number palette waits for it to end; meanwhile the paint shows in its own colors
  // (updateCells). rect: the grid pixels an edit changed ({ x, y, w, h }), the only ones redrawn
  // when what's kept from the last composite still fits (not when the Number palette is picked
  // again: that can change every pixel). open: an edit is open (Best match with Floyd–Steinberg
  // waits for it to end to carry a change to the base on to every cell after it: #resolveUnder).
  composite(paintLayer, params, { hold = false, rect = null, open = false } = {}) {
    if (!this.outputCanvas || !this.pipelineCanvas) return false;

    const ctx = ctx2d(this.outputCanvas);
    const w = this.outputCanvas.width, h = this.outputCanvas.height;
    const layer = this.#base, base = !!layer?.hasPaint, fits = (data) => data?.width === w && data.height === h;
    const partial = !!rect && !(params.quantize === 'count' && !hold) && this.pipelineCanvas.width === w && this.pipelineCanvas.height === h
      && (base ? fits(this.#baseData) && this.#baseData !== this.#pipelineData : true)
      && (!paintLayer || fits(this.#paintData)) && (!hold || this.#heldData?.length === w * h * 4);
    const area = partial ? clipped(rect, w, h) : { x: 0, y: 0, w, h };
    if (!area.w || !area.h) return false; // nothing on the grid changed
    const { x, y } = area;
    this.#shownDirty(partial ? area : null);

    ctx.fillStyle = 'black';
    ctx.fillRect(x, y, area.w, area.h);
    ctx.drawImage(this.pipelineCanvas, x, y, area.w, area.h, x, y, area.w, area.h);

    if (base) this.#drawBase(ctx, layer, params, area);
    if (!base) this.#baseData = this.#pipelineData;
    else if (partial) {
      putRows(this.#baseData.data, w, ctx.getImageData(x, y, area.w, area.h).data, area);
      const snapped = this.#baseSnapped;
      if (snapped?.from === this.#baseData) { // only the area changed: only it is snapped again
        const rows = rowsOf(this.#baseData.data, w, area);
        snapBytes(rows, snapped.palette);
        putRows(snapped.data.data, w, rows, area);
      }
    } else this.#baseData = ctx.getImageData(0, 0, w, h);

    this.#paintData = paintLayer ? this.#drawLayer(ctx, paintLayer, params, partial ? area : null) : null;
    const changed = !hold && params.quantize === 'count' && !this.#chosen && this.#recount(params);
    const moved = this.#ditherUnder(ctx, params, area, !!paintLayer, open);
    const resolvedAgain = this.#resolveUnder(params, area, open, paintLayer);
    this.#heldPaint = hold ? paintLayer : null;
    if (!hold) this.#heldData = null;
    else if (partial) putRows(this.#heldData, w, ctx.getImageData(x, y, area.w, area.h).data, area);
    else this.#heldData = ctx.getImageData(0, 0, w, h).data;
    const resolved = !!this.#resolvedFor(params); // its cells don't read the output (cellsFromOutput): it's snapped here
    this.#snapped = (paintLayer || resolved) && this.palette?.length ? snapToPalette(this.outputCanvas, this.palette, area) : null;
    if (partial) this.#snapped = null; // only the area's
    if (this.#showsResolved(params)) this.#showResolved(ctx, params, resolvedAgain ? { x: 0, y: 0, w, h } : area);
    return changed || moved || resolvedAgain;
  }

  // Whether Floyd–Steinberg's dither holds still through an open edit (#ditherUnder): the edit's end
  // composites whole.
  holdsDither(params) {
    return params.dither > 0 && params.ditherStyle !== 'bayer' && !!this.palette?.length && !resolves(params);
  }

  // Under Best match and By shape, a grid pixel of the picture with any paint over it (#baseData and
  // #paintData, as composited), snapped as the output is: what a pinned cell is built from and shows.
  #pictureAt(x, y) {
    const { data, width } = this.#baseData, o = (y * width + x) * 4, paint = this.paintAt(x, y);
    const p = { r: data[o], g: data[o + 1], b: data[o + 2] };
    return nearestColor(paint ? mix(p, paint, paint.a) : p, this.palette);
  }

  // Whether the output shows the resolved cells (#showResolved): Best match and By shape in ANSI, with
  // a palette. The ASCII styles show the picture there, as By intensity and By brightness do (their
  // cells sit on black); without a palette there's nothing snapped, and the output is what a movie's
  // Number palette is picked from (FrameBuilder.moviePalette).
  #showsResolved(params) {
    return params.renderStyle === 'ansi' && !!this.palette?.length && !!this.#resolvedFor(params);
  }

  // The resolved cells in the output over area (whole cells), as #ditherUnder shows its pattern: the PIXEL
  // view, and what the Paint Bucket and Magic Wand read there, show the cells chosen, not the picture
  // snapped a pixel at a time. Each half its cell's half color (halfColors: the plain average, as edit
  // cells show at pixel scale; a shade's mix isn't a palette color), with any paint over it snapped
  // as the output snaps paint. A pinned cell shows the picture's own pixels, which its colors come
  // from (#pictureAt), and an odd last pixel row (no cell) keeps them. Also called for the cells an edit
  // rebuilds (updateCells), whose pins can change after its composite (eraseBase).
  #showResolved(ctx, params, area) {
    const { cols } = params, cells = this.#resolved.cells, checks = this.baseRecords.pins.size || this.shapes?.hasArt;
    const r0 = area.y >> 1, r1 = Math.min(charRowsOf(params.rows), (area.y + area.h + 1) >> 1);
    if (r1 <= r0) return;
    const { x, w } = area, y = 2 * r0, image = ctx.getImageData(x, y, w, 2 * (r1 - r0)), d = image.data;
    const paint = this.#paintData?.data, inks = new Map(); // halfColors' math, inline: this runs over the whole grid
    for (let row = r0; row < r1; row++) {
      for (let col = x; col < x + w; col++) {
        const pinned = checks && this.pinAt(col, row) !== undefined, cell = cells[row * cols + col];
        let ink = inks.get(cell.char);
        if (!ink) inks.set(cell.char, ink = coverageOf(cell.char));
        for (let half = 0; half < 2; half++) {
          const py = 2 * row + half, o = ((py - y) * w + col - x) * 4;
          if (pinned || paint?.[(py * cols + col) * 4 + 3]) {
            const over = !pinned && this.paintAt(col, py);
            const c = pinned ? this.#pictureAt(col, py) : nearestColor(mix(halfColors(cell)[half], over, over.a), this.palette);
            d[o] = c.r; d[o + 1] = c.g; d[o + 2] = c.b;
          } else {
            const { fg, bg } = cell, t = ink[half];
            d[o] = Math.round(bg.r + (fg.r - bg.r) * t); d[o + 1] = Math.round(bg.g + (fg.g - bg.g) * t); d[o + 2] = Math.round(bg.b + (fg.b - bg.b) * t);
          }
          d[o + 3] = 255;
        }
      }
    }
    ctx.putImageData(image, x, y);
  }

  // Best match and By shape: the base (before the palette snap) resolved to cells, each the glyph,
  // fg and bg that come closest to it, with Dither's error carried or nudged by the resolver
  // (#ditherUnder dithers nothing then). Worked out again whole when the settings, the grid or the
  // palette change, else only where the base changed. Floyd–Steinberg's cells depend on every cell
  // before them: while an edit is open only the changed cells are resolved again, and with none open
  // the whole grid is. True when every cell may have changed (a full rebuild).
  #resolveUnder(params, area, open, paintLayer) {
    if (!resolves(params) || !this.#fontReady || !this.#baseData) {
      this.#resolved = null;
      return false;
    }
    const { width: w, height: h } = this.#baseData, r = this.#resolved;
    const key = resolvedKey(params, w, h), whole = r?.palette !== this.palette || r.key !== key;
    const glyphs = this.#glyphsOf(params.chars), solids = params.solids / 100, light = params.patternLight / 100;
    const palette = !!this.palette?.length; // without one Dither does nothing (as #ditherUnder), Bayer too
    const opts = { strength: palette ? params.dither / 100 : 0, style: params.ditherStyle };
    const carries = palette && carriesError(params);
    if (params.charMode === 'shape') return this.#resolveShapes(params, area, open, paintLayer, { key, whole, glyphs, solids, light, opts, carries });

    // Best match: each cell's two halves (#baseData). While an edit is open Floyd–Steinberg resolves
    // the area from the error that arrived there before, and raw stays as it was, so the edit's end
    // sees the change.
    const raw = this.#baseData.data;
    if (!whole && sameRows(r.raw, raw, w, area)) return false;
    const matcher = bestMatcher({ palette: this.palette, glyphs, solids, light });
    const resolve = (o, gpu) => resolveBy(gpu, carries, () => resolveGrid(raw, w, h, matcher, o), raw, w, charRowsOf(h), matcher, o);
    if (whole || (carries && !open) || !resolve({ ...opts, area, carried: r.carried, cells: r.cells }, r.gpu)) {
      const { out: { cells, carried }, gpu } = resolve(opts);
      this.#resolved = { key, palette: this.palette, raw: raw.slice(), cells, carried, gpu };
      return true; // cells outside the area may have changed (or weren't resolved before)
    }
    if (!carries) putRows(r.raw, w, rowsOf(raw, w, area), area);
    return false;
  }

  // By shape: each cell's samples (#shapeSamples), resolved again where they changed. Nothing of
  // Floyd–Steinberg's error is kept (12 bytes a sample): while an edit is open the changed cells are
  // resolved with no error coming in, and the grid is left stale, so the edit's end resolves it whole.
  // Then the cells under paint (#resolvePainted).
  #resolveShapes(params, area, open, paintLayer, { key, whole, glyphs, solids, light, opts, carries }) {
    const samples = this.#shapeSamples(params);
    if (!samples) {
      this.#resolved = this.#painted = null;
      return false;
    }
    const { width: w, height: h } = this.#baseData, r = this.#resolved, { changed } = samples;
    const matcher = shapeMatcher({ palette: this.palette, glyphs, solids, light, renderStyle: params.renderStyle });
    const resolve = (o, gpu) => resolveBy(gpu, carries, () => resolveShapes(samples.data.data, w, charRowsOf(h), matcher, o), samples.data.data, w, charRowsOf(h), matcher, o);
    let again = false;
    if (whole || changed || (r.stale && carries && !open)) {
      if (whole || (carries && !open) || !resolve({ ...opts, area: changed, cells: r.cells }, r.gpu)) {
        const { out: { cells }, gpu } = resolve(opts);
        this.#resolved = { key, palette: this.palette, cells, stale: false, gpu };
        again = true;
      } else {
        r.stale ||= carries;
        again = !inside(changed, area); // a change to the samples past the composite's area (all of them, as the base's last pixels go)
      }
    }
    this.#resolvePainted(params, paintLayer, samples, matcher, opts, area, changed);
    return again;
  }

  // By shape under paint: each cell with paint in it matched from its samples with the paint over
  // them (baseSamplesOver, as the base layer's own pixels go), so it's the cell Merge down leaves.
  // Kept apart from the base's cells (#resolved): an edit cell still sits on the base's (underCell),
  // and erasing the paint brings the base's back. None of Floyd–Steinberg's error comes in or goes on
  // (as an open edit's cells: Merge down then carries it); Bayer's nudge is the base's. Worked out
  // again where the paint changed (the composite's area, grid pixels) or the samples under it did
  // (changed), and whole when the base's cells were. The samples are put back as they were.
  #resolvePainted(params, paintLayer, samples, matcher, opts, composited, changed) {
    const r = this.#resolved;
    if (!paintLayer?.hasPaint) {
      this.#painted = null;
      return;
    }
    const { width: w, height: h } = this.#baseData, lines = charRowsOf(h), p = this.#painted;
    let area;
    if (p?.of !== r || p.layer !== paintLayer) area = null;
    else if (p.version !== paintLayer.version) area = changed ? union(changed, composited) : composited;
    else if (changed) area = changed;
    else return;
    const painted = area ? p : { of: r, layer: paintLayer, cells: new Array(w * lines).fill(null) };
    painted.version = paintLayer.version;
    this.#painted = painted;
    // The area's whole cells, in grid pixels.
    const y0 = area ? Math.floor(area.y / 2) * 2 : 0, y1 = Math.min(2 * lines, area ? Math.ceil((area.y + area.h) / 2) * 2 : 2 * lines);
    const cellsIn = clipped({ x: area?.x ?? 0, y: y0, w: area?.w ?? w, h: y1 - y0 }, w, h);
    if (!cellsIn.w || !cellsIn.h) return;
    const n = SAMPLES.w, width = w * n, data = samples.data.data;
    const inSamples = { x: cellsIn.x * n, y: cellsIn.y * n, w: cellsIn.w * n, h: cellsIn.h * n };
    const saved = rowsOf(data, width, inSamples);
    baseSamplesOver(data, width, paintLayer, params, cellsIn, n);
    const o = { ...opts, area: cellsIn, cells: painted.cells };
    if (!resolveBy(r.gpu, false, () => resolveShapes(data, w, lines, matcher, o), data, w, lines, matcher, o)) resolveShapes(data, w, lines, matcher, o);
    // A cell the paint didn't change is the base's.
    const rowBytes = SAMPLES.w * 4;
    for (let line = cellsIn.y / 2; line < (cellsIn.y + cellsIn.h) / 2; line++) {
      for (let col = cellsIn.x; col < cellsIn.x + cellsIn.w; col++) {
        let same = true;
        for (let sy = 0; sy < SAMPLES.h && same; sy++) {
          const at = ((line * SAMPLES.h + sy) * width + col * n) * 4, from = ((line * SAMPLES.h + sy - inSamples.y) * inSamples.w + col * n - inSamples.x) * 4;
          for (let b = 0; b < rowBytes; b++) if (data[at + b] !== saved[from + b]) { same = false; break; }
        }
        if (same) painted.cells[line * w + col] = null;
      }
    }
    putRows(data, width, saved, inSamples);
  }

  // By shape's samples (SAMPLES: 4 a grid pixel each way): the picture's (#picture) with the base
  // layer's own pixels over them, drawn from its canvas at 4 a grid pixel through the color
  // transforms and no palette (baseSamplesOver), as #baseGrid draws them at grid resolution. Paint
  // isn't sampled. The picture's own when the base has no pixels. Kept as #baseGrid keeps its grid:
  // while it's of the same picture, layer and color settings, only what the layer changed since
  // (changedSince) is worked out again. { data, changed }: changed the grid pixels that changed
  // since the last call, or null. Null while the picture is another grid's (between a resize and its render).
  #shapeSamples(params) {
    const picture = this.#picture, w = this.#baseData.width, h = this.#baseData.height, n = SAMPLES.w;
    if (picture?.width !== w * n || picture.height !== h * n) return null;
    const base = this.#base, layer = base?.hasPaint ? base : null;
    const key = layer && [layer.scale, ...COLOR_KEYS.map((key) => params[key])].join();
    const s = this.#samples, all = { x: 0, y: 0, w, h };
    if (s?.picture !== picture || s.layer !== layer || s.key !== key) {
      const data = layer ? new ImageData(picture.data.slice(), picture.width, picture.height) : picture;
      if (layer) baseSamplesOver(data.data, w * n, layer, params, all, n);
      this.#samples = { picture, layer, key, version: layer?.version, data };
      return { data, changed: all };
    }
    if (!layer || s.version === layer.version) return { data: s.data, changed: null };
    const since = layer.changedSince(s.version), area = since ? gridRectOf(since, layer.scale, w, h) : all;
    s.version = layer.version;
    if (!area.w || !area.h) return { data: s.data, changed: null };
    const inArea = { x: area.x * n, y: area.y * n, w: area.w * n, h: area.h * n };
    putRows(s.data.data, w * n, rowsOf(picture.data, w * n, inArea), inArea);
    baseSamplesOver(s.data.data, w * n, layer, params, area, n);
    return { data: s.data, changed: area };
  }

  // The set's one-column characters (as the converter's, Cells.glyphsOf), each once, with their ink
  // (Best match) and mask (By shape) in the reference font.
  #glyphsOf(chars) {
    let glyphs = this.#glyphs.get(chars);
    if (!glyphs) {
      if (this.#glyphs.size >= 16) this.#glyphs.clear();
      glyphs = [...new Set(glyphsOf(chars))].map((char) => ({ char, ink: referenceInk(char), mask: referenceMask(char, SAMPLES.w, SAMPLES.h) }));
      this.#glyphs.set(chars, glyphs);
    }
    return glyphs;
  }

  // A Number palette chosen from outside (one for a whole animation), until it's null: cells then use it, and
  // a composite doesn't pick one from what it shows. The output's snap waits for the next composite.
  usePalette(palette) {
    this.#chosen = palette;
    if (palette) this.palette = palette;
    this.#effective = new Map();
  }

  // The Number palette from what's counted (countCanvas); true when it changed.
  #recount(params) {
    const next = getPaletteColors(params, new Canvas(this.countCanvas(params)));
    const key = (palette) => palette?.map((p) => p.hex).join();
    if (key(next) === key(this.palette)) return false;
    this.palette = next;
    this.#effective = new Map(); // displayed colors snap to the palette
    return true;
  }

  // What the Number palette is picked from: the output as composited (before it's quantized) while it's all there is,
  // else the pipeline's own picture (the base hidden or not) with everyLayer over it in order, hidden layers too, each
  // drawn as it would show: so an eye never changes the palette. At grid resolution.
  countCanvas(params) {
    if (!this.everyLayer.length || !this.outputCanvas) return this.outputCanvas;
    const { width: w, height: h } = this.outputCanvas, area = { x: 0, y: 0, w, h };
    if (this.#count?.width !== w || this.#count.height !== h) this.#count = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = ctx2d(this.#count), kept = this.#scratch;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(this.#pictureCanvas, 0, 0, w, h, 0, 0, w, h);
    this.#scratch = this.#countScratch;
    try {
      for (const { layer, paint } of this.everyLayer) {
        if (paint?.hasPaint) this.#drawLayerArea(ctx, paint, params, area);
        if (!layer?.hasPaint) continue;
        if (layer === this.#base) {
          this.#drawBase(ctx, layer, params, area);
          continue;
        }
        layer.sync?.();
        const grid = this.#upperGrid(layer, params);
        if (!grid.canvas) { // kept in step by #gridOf from here on
          grid.canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
          ctx2d(grid.canvas).putImageData(grid.data, 0, 0);
        }
        ctx.drawImage(grid.canvas, 0, 0);
      }
    } finally {
      this.#countScratch = this.#scratch;
      this.#scratch = kept;
    }
    return this.#count;
  }

  // The base layer at grid resolution, the way the pipeline draws the picture: every pixel through
  // the color transforms or, with CGA/VGA, through the shader's adjustments and snap
  // (adjustedPixels: a moved block of the picture is snapped as the picture is), then each grid
  // pixel's block averaged as Canvas.drawManual averages, or with Low smoothing its nearest pixel as
  // the pipeline's drawImage picks it. A pixel that's partly see-through (soft paint merged down)
  // isn't snapped: it's blended over the picture and the output's palette snap takes it, as paint.
  // stored: with the color adjustments neutral (baseParams), the colors the base stands for; a
  // block of one color is that color (an exact pixel stays exact), one that isn't (a moved block of
  // the picture) is snapped, then averaged, as the picture's own stored colors are (#source).
  // Cached: a stroke recomposites on every move, and the base doesn't change under it; when it does
  // (an erase, a move), only the grid pixels over what changed are worked out again.
  #baseGrid(layer, params, stored = false) {
    const result = this.#gridOf(layer, params, stored ? this.#baseStored : this.#baseDrawn, stored);
    if (stored) this.#baseStored = result;
    else this.#baseDrawn = result;
    return result;
  }

  // An upper vector layer's shapes at grid resolution, drawn as the base layer's own pixels are (#baseGrid), alpha where
  // nothing's drawn: what composeUpper and shownCanvas lay over the cells under them. Kept per layer, caught up where
  // its shapes changed.
  #upperGrid(layer, params) {
    const result = this.#gridOf(layer, params, this.#upperGrids.get(layer), false);
    this.#upperGrids.set(layer, result);
    return result;
  }

  // #baseGrid's work for any layer, from what was kept of it last time (cached): { layer, key, data, canvas, version }.
  #gridOf(layer, params, cached, stored) {
    const w = this.outputCanvas.width, h = this.outputCanvas.height, k = layer.scale;
    const palette = (params.quantize === 'cga' || params.quantize === 'vga') && !snapsLate(params) && this.palette?.length ? this.palette : null;
    const key = [w, h, params.smoothing, palette && params.quantize, ...COLOR_KEYS.map(key => params[key])].join();
    const same = cached?.layer === layer && cached.key === key;
    if (same && cached.version === layer.version) return cached;

    // With Low smoothing the grid is the browser's nearest-pixel scaling of the whole layer, which a
    // part of it doesn't reproduce exactly: that's worked out whole.
    const changed = same && params.smoothing !== 'low' && layer.changedSince(cached.version);
    const area = changed ? gridRectOf(changed, k, w, h) : { x: 0, y: 0, w, h };
    const result = changed ? cached : { layer, key, data: new ImageData(w, h), canvas: null };
    if (area.w && area.h) {
      const part = baseGridPart(layer, params, palette, area, stored);
      putRows(result.data.data, w, part.data, area);
      if (result.canvas) ctx2d(result.canvas).putImageData(result.data, 0, 0, area.x, area.y, area.w, area.h);
    }
    result.version = layer.version;
    return result;
  }

  // With Dither on, the picture under the paint (#baseData) dithered to the palette and shown in the
  // area, the paint drawn over it again (it snaps plainly: paint keeps its own color). Worked out
  // again only when the picture or the palette changes, so a stroke of paint doesn't move the pattern
  // around it. True when Floyd–Steinberg's pattern was worked out again: it depends on everything
  // before a pixel, so a change to the picture (a base pixel erased or moved) can move it anywhere after,
  // and every cell needs its colors again (Bayer's pattern is by place: only the area's change).
  // While an edit is open (a stroke on the base, a shape dragged) Floyd–Steinberg's pattern holds still: a
  // change dithers its area alone, with no error coming in from outside it, and raw stays as it was, so the
  // edit's end works the grid out whole (commitEdit, holdsDither).
  #ditherUnder(ctx, params, area, painted, open) {
    if (!(params.dither > 0) || !this.palette?.length || resolves(params)) { // a resolver carries the error itself
      this.#dithered = null;
      return false;
    }
    const { width: w, height: h, data: raw } = this.#baseData;
    const key = [params.ditherStyle, params.dither, w, h].join();
    const d = this.#dithered;
    const fits = d?.palette === this.palette && d.key === key, floyd = params.ditherStyle !== 'bayer';
    if (open && floyd && fits && (d.held || !sameRows(d.raw, raw, w, area))) {
      const rows = rowsOf(raw, w, area);
      putRows(d.data.data, w, ditherPixels(rows, area.w, area.h, this.palette, { style: params.ditherStyle, strength: params.dither / 100 }), area);
      d.held = true;
      ctx.putImageData(d.data, 0, 0, area.x, area.y, area.w, area.h);
      if (painted) ctx.drawImage(this.#scratch, area.x, area.y, area.w, area.h, area.x, area.y, area.w, area.h);
      return false;
    }
    const again = !fits || d.held || !sameRows(d.raw, raw, w, area);
    if (again) {
      const data = ditherPixels(raw, w, h, this.palette, { style: params.ditherStyle, strength: params.dither / 100 });
      this.#dithered = { palette: this.palette, key, raw: raw.slice(), data: new ImageData(data, w, h) };
    }
    const moved = again && !!d && params.ditherStyle !== 'bayer';
    const { x, y, w: aw, h: ah } = moved ? { x: 0, y: 0, w, h } : area;
    ctx.putImageData(this.#dithered.data, 0, 0, x, y, aw, ah);
    if (painted) ctx.drawImage(this.#scratch, x, y, aw, ah, x, y, aw, ah);
    return moved;
  }

  #drawBase(ctx, layer, params, { x, y, w, h }) {
    const drawn = this.#baseGrid(layer, params);
    if (!drawn.canvas) {
      drawn.canvas = Object.assign(document.createElement('canvas'), { width: drawn.data.width, height: drawn.data.height });
      ctx2d(drawn.canvas).putImageData(drawn.data, 0, 0);
    }
    ctx.drawImage(drawn.canvas, x, y, w, h, x, y, w, h);
  }

  // The base layer's own color at grid pixel (x, y) as stored (before adjustments; see #baseGrid),
  // with its alpha (0..1), or null where it has none.
  baseStoredAt(x, y) {
    const layer = this.#base;
    if (!layer?.hasPaint || !this.outputCanvas || !this.#baseParams) return null;
    const { data } = this.#baseGrid(layer, this.#baseParams, true);
    if (x < 0 || y < 0 || x >= data.width || y >= data.height) return null;
    const o = (y * data.width + x) * 4, p = data.data;
    return p[o + 3] ? { r: p[o], g: p[o + 1], b: p[o + 2], a: p[o + 3] / 255 } : null;
  }

  // An upper vector layer's color at grid pixel (x, y) as stored (before adjustments), as baseStoredAt reads the base's,
  // with its alpha (0..1), or null where it draws nothing (or it isn't one of the upper layers).
  upperStoredAt(layer, x, y) {
    const u = this.upper.find((each) => each.layer === layer);
    if (!u || !layer.drawsShapes || !this.outputCanvas) return null;
    layer.sync();
    const result = this.#gridOf(layer, u.params, this.#upperStored.get(layer), true);
    this.#upperStored.set(layer, result);
    const { data } = result;
    if (x < 0 || y < 0 || x >= data.width || y >= data.height) return null;
    const o = (y * data.width + x) * 4, p = data.data;
    return p[o + 3] ? { r: p[o], g: p[o + 1], b: p[o + 2], a: p[o + 3] / 255 } : null;
  }

  // Draw a layer at grid resolution (a grid pixel at a time) with the color transforms applied;
  // returns the transformed pixels. area: only those grid pixels (the rest of #paintData stays).
  #drawLayer(ctx, layer, params, area = null) {
    const pixels = this.#drawLayerArea(ctx, layer, params, area ?? { x: 0, y: 0, w: this.outputCanvas.width, h: this.outputCanvas.height });
    if (!area) return pixels;
    putRows(this.#paintData.data, this.outputCanvas.width, pixels.data, area);
    return this.#paintData;
  }

  // #drawLayer's drawing of area alone: the transformed pixels of that rect (#paintPart), drawn onto ctx.
  #drawLayerArea(ctx, layer, params, area) {
    const pixels = this.#paintPart(layer, params, area), { x, y, w: aw, h: ah } = area;
    if (transformsOn(params)) ctx2d(this.#scratch).putImageData(pixels, x, y);
    ctx.drawImage(this.#scratch, x, y, aw, ah, x, y, aw, ah);
    return pixels;
  }

  // A layer's pixels over area at grid resolution (a grid pixel at a time, as the lower group's paint is drawn) with the
  // color transforms applied: an ImageData of the rect. The scratch canvas holds the untransformed draw after.
  #paintPart(layer, params, area) {
    const w = this.outputCanvas.width, h = this.outputCanvas.height, k = layer.scale;
    const { x, y, w: aw, h: ah } = area;

    // Persistent scratch canvas for downsampling and transforming a layer
    if (!this.#scratch) this.#scratch = document.createElement('canvas');
    if (this.#scratch.width !== w || this.#scratch.height !== h) {
      this.#scratch.width = w;
      this.#scratch.height = h;
    }

    const scratchCtx = ctx2d(this.#scratch);
    scratchCtx.clearRect(x, y, aw, ah);
    scratchCtx.imageSmoothingEnabled = false;
    scratchCtx.drawImage(layer.canvas, x * k, y * k, aw * k, ah * k, x, y, aw, ah); // the grid's part (a layer can reach past it)

    const pixels = scratchCtx.getImageData(x, y, aw, ah);
    if (transformsOn(params)) applyTransforms(pixels.data, params);
    return pixels;
  }

  // Rebuild only the cells under the given grid pixels from the (already composited) output canvas.
  // baseCells (the last full render) supplies a cell's character in random mode.
  updateCells(cells, pixels, params, editCells, baseCells) {
    this.#lowerEdits = editCells;
    if (!this.outputCanvas || !pixels.length) return cells;
    const next = cells.slice();
    const { cols, chars: charset, charMode, renderStyle } = params;
    const done = new Set();
    const resolved = this.#resolvedFor(params), rebuilt = { x0: Infinity, x1: -1, r0: Infinity, r1: -1 }; // the cells' bounds, for #showResolved
    const pixelAt = !resolved && this.#outputPixels(pixels); // the resolved cells don't read the output

    for (const { x, y } of pixels) {
      const { col, row } = cellOfPixel(x, y);
      const i = cellIndex(col, row, cols);
      if (done.has(i) || !next[i]) continue;
      done.add(i);
      if (resolved) Object.assign(rebuilt, { x0: Math.min(rebuilt.x0, col), x1: Math.max(rebuilt.x1, col), r0: Math.min(rebuilt.r0, row), r1: Math.max(rebuilt.r1, row) });

      const entry = editCells.get(cellKey(col, row));
      if (entry) {
        next[i] = this.#composeOne(col, row, params, entry, baseCells);
        continue;
      }
      const painted = this.#paintedPin(col, row, params);
      if (painted) {
        next[i] = painted;
        continue;
      }

      if (resolved) { // a pin as cellsFromOutput builds it, held paint in its own colors
        if (this.pinAt(col, row) === undefined) {
          next[i] = this.#shown(resolved.cells[i], col, row, params);
          continue;
        }
        const half = (y) => this.#held(col, y, cols) ?? this.#pictureAt(col, y);
        next[i] = this.#onBase(col, row, buildCell(half(2 * row), half(2 * row + 1), resolved.cells[i].char, renderStyle));
        continue;
      }

      let top = pixelAt(col, 2 * row);
      if (!top) continue; // output canvas from an older grid size
      let bottom = pixelAt(col, 2 * row + 1) || top;
      // Quantize only the touched pixels instead of the entire canvas (held paint keeps its colors)
      if (this.palette) {
        top = this.#held(col, 2 * row, cols) ?? nearestColor(top, this.palette);
        bottom = this.#held(col, 2 * row + 1, cols) ?? nearestColor(bottom, this.palette);
      }

      // Random mode keeps the cell's rendered character
      const char = keepsSeed(charMode) ? (baseCells[i] ?? next[i]).char : weightedChar(top, bottom, charset, charMode);
      next[i] = this.#onBase(col, row, buildCell(top, bottom, char, renderStyle));
    }
    if (rebuilt.x1 >= 0 && this.#showsResolved(params)) {
      this.#showResolved(ctx2d(this.outputCanvas), params, { x: rebuilt.x0, y: 2 * rebuilt.r0, w: rebuilt.x1 - rebuilt.x0 + 1, h: 2 * (rebuilt.r1 - rebuilt.r0 + 1) });
    }
    return next;
  }

  // The output's pixels under the cells of these grid pixels, read once as one rect (an edit's
  // area, not the whole grid): (x, y) -> { r, g, b, a }, or undefined off the output.
  #outputPixels(pixels) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const { x, y } of pixels) {
      const row = Math.floor(y / 2);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, 2 * row); y1 = Math.max(y1, 2 * row + 1);
    }
    const { width, height } = this.outputCanvas;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(width - 1, x1); y1 = Math.min(height - 1, y1);
    if (x0 > x1 || y0 > y1) return () => undefined;
    const w = x1 - x0 + 1, { data } = ctx2d(this.outputCanvas).getImageData(x0, y0, w, y1 - y0 + 1);
    return (x, y) => {
      if (x < x0 || x > x1 || y < y0 || y > y1) return undefined;
      const o = ((y - y0) * w + (x - x0)) * 4;
      return { r: data[o], g: data[o + 1], b: data[o + 2], a: data[o + 3] / 255 };
    };
  }

  // A grid pixel the held stroke painted: its color before the palette snap; else null.
  #held(x, y, cols) {
    if (!this.#heldData || !this.paintAt(x, y) || !this.#heldPaint?.strokeCovers(x, y)) return null; // paint from before snaps
    const o = (y * cols + x) * 4, d = this.#heldData;
    return { r: d[o], g: d[o + 1], b: d[o + 2], a: 1 };
  }

  // Generated cells with the base's pins (and the art layers' characters) and every in-grid edit cell composed in.
  composeAll(baseCells, editCells, params) {
    this.#lowerEdits = editCells;
    const cells = baseCells.slice();
    const rows = charRowsOf(params.rows), pins = this.hideBase ? EMPTY_BASE.pins : this.baseRecords.pins;
    for (const key of this.shapes?.hasArt ? new Set([...pins.keys(), ...this.shapes.artCells()]) : pins.keys()) {
      const { col, row } = parseKey(key);
      if (col < params.cols && row < rows) cells[cellIndex(col, row, params.cols)] = this.#paintedPin(col, row, params) ?? this.#onBase(col, row, cells[cellIndex(col, row, params.cols)]);
    }
    for (const [key, entry] of editCells) {
      const { col, row } = parseKey(key);
      if (col < params.cols && row < rows) cells[cellIndex(col, row, params.cols)] = this.#composeOne(col, row, params, entry, baseCells);
    }
    return cells;
  }

  // The upper layers laid over the lower group's cells (lower, composeAll's or updateCells'): a new array sharing every
  // cell it doesn't change. indexes: only those cells, the rest kept from composed (the cells as last composed, the same
  // grid), or every cell with null. Per cell, bottom to top, { cell, exact }: exact is a character that's someone's own
  // (the lower cells layer's entry, the base's pin or an art layer's; a shape reaching over them gives it up):
  // - a vector layer where a shape reaches: each half is the cell's half color with the layer's pixels over it (its
  //   shapes drawn as the base's own pixels are, #upperGrid), converted by its settings (#upperChar: snapped with
  //   Random's or a weighted character, or Best match's or By shape's cell, By shape's from samples inside the cell),
  //   or the art layer's character over the halves snapped where one shows. Its own Dither: Ordered nudges each half it
  //   covers by its place (a cell by its own under Best match and By shape), and Floyd–Steinberg (#ditherLayer) carries
  //   error between the pixels it covers;
  // - a cells layer's entry composes over the cell as the lower group's do (#composeOne), and its paint covers an exact
  //   character (coverCell) or, over converted pixels, is mixed into the halves and converted with its settings. Paint
  //   isn't dithered.
  // Only a Floyd–Steinberg layer carries anything between cells, so otherwise a cell costs only its own layers. Such a
  // layer holds still while an edit is open (open): the cells at indexes are worked out with no error coming in, the
  // rest stay. Not open, cells at indexes it reaches work it out again over every cell it reaches (#settled), as its
  // pattern after a change can move anywhere after it.
  composeUpper(lower, indexes, palette, composed = null, { open = false } = {}) {
    const out = (indexes && composed?.length === lower.length ? composed : lower).slice();
    const cols = this.upper[0]?.params.cols ?? 1;
    // Each layer's pixels at grid resolution, read once for the walk: a cells layer's paint, a vector layer's shapes.
    const reads = this.upper.map((u) => {
      if (u.kind === 'cells') return u.paint?.hasPaint ? this.#upperPaint(u.paint, u.params) : null;
      if (!u.layer?.drawsShapes) return null;
      u.layer.sync();
      return this.#upperGrid(u.layer, u.params).data;
    });
    const settles = this.upper.map((u, at) => u.kind === 'vector' && !!reads[at] && this.holdsDither(u.params));
    // Every cell: only those some upper layer touches, as the rest come out as they went in.
    let visited = indexes ?? this.#touched(reads, cols, lower.length);
    if (settles.includes(true)) visited = indexes && !open ? this.#settled(indexes, settles, lower.length) : Int32Array.from(visited).sort();
    this.settled = indexes && visited !== indexes && !open && settles.includes(true) ? visited : null;
    const n = visited.length;
    if (settles.includes(true)) this.#composeSettling(out, lower, visited, palette, reads, settles, cols);
    else {
      for (let k = 0; k < n; k++) {
        const i = visited[k], col = i % cols, row = (i - col) / cols;
        if (lower[i]) out[i] = this.#upperCell(lower[i], col, row, palette, reads);
      }
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    if (indexes) {
      for (let k = 0; k < n; k++) {
        const i = visited[k], col = i % cols, row = (i - col) / cols;
        if (col < x0) x0 = col;
        if (col > x1) x1 = col;
        if (row < y0) y0 = row;
        if (row > y1) y1 = row;
      }
    }
    this.#shownDirty(indexes ? { x: x0, y: 2 * y0, w: n ? x1 - x0 + 1 : 0, h: n ? 2 * (y1 - y0 + 1) : 0 } : null);
    return out;
  }

  // indexes (into n cells) and, for each Floyd–Steinberg layer (settles) that reaches any of them, every cell it reaches,
  // in order: again until no layer adds any, as a higher layer's cells can reach a lower one's.
  // ponytail: the whole layer again from its top at an edit's end (35 ms for 300 x 200); start at the first row the
  // edit reached if that's too slow (docs/investigations/layer-stack-performance.md, area 12).
  #settled(indexes, settles, n) {
    const flags = new Uint8Array(n);
    for (const i of indexes) if (i < n) flags[i] = 1;
    const waiting = new Set(settles.flatMap((settle, at) => (settle ? [at] : [])));
    for (let grew = true; grew;) {
      grew = false;
      for (const at of waiting) {
        const reached = this.upper[at].layer.reachedCells();
        if (!reached.some((i) => flags[i])) continue;
        for (const i of reached) if (i < n) flags[i] = 1;
        waiting.delete(at);
        grew = true;
      }
    }
    const cells = [];
    for (let i = 0; i < n; i++) if (flags[i]) cells.push(i);
    return cells;
  }

  // composeUpper's walk with a Floyd–Steinberg layer in it (settles): the layers between two such are laid cell by cell
  // as ever (#upperCell), and each such layer over every visited cell (in order) at once (#ditherLayer).
  #composeSettling(out, lower, visited, palette, reads, settles, cols) {
    const n = visited.length, last = this.upper.length, exact = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      const i = visited[k], col = i % cols;
      exact[k] = this.#exactUnder(col, (i - col) / cols) ? 1 : 0;
    }
    let from = 0;
    for (let at = 0; at <= last; at++) {
      if (at < last && !settles[at]) continue;
      for (let k = 0; k < n; k++) {
        const i = visited[k], col = i % cols, row = (i - col) / cols;
        if (!lower[i]) continue;
        const cell = from ? out[i] : lower[i];
        if (from === at) out[i] = cell;
        else {
          out[i] = this.#upperCell(cell, col, row, palette, reads, from, at, exact[k] === 1);
          exact[k] = this.#exact ? 1 : 0;
        }
      }
      if (at < last) this.#ditherLayer(out, lower, visited, exact, at, reads[at].data, palette, cols);
      from = at + 1;
    }
  }

  // The upper vector layer at `at` over the visited cells (in order) with its own Floyd–Steinberg (holdsDither): each half
  // its shapes cover is their color over the cell's half, with the error that came to it, snapped to the palette; its
  // error goes on to the pixels right of it and below as ditherPixels passes it, among the pixels the layer covers (one
  // it doesn't keeps the color under it and takes none). Only visited ones: an open edit's area starts with no error
  // coming in. An art layer's character takes its halves snapped, as ever.
  // ponytail: an error buffer the size of the grid per such layer per compose (5 MB at the limit); keep two rows of it
  // if that shows.
  #ditherLayer(out, lower, visited, exact, at, data, palette, cols) {
    const u = this.upper[at], { params } = u, width = this.outputCanvas.width, height = this.outputCanvas.height;
    const strength = params.dither / 100, err = new Float32Array(width * height * 3), n = visited.length;
    const snap = (c) => nearestColor(c, palette);
    const pass = (x, y, er, eg, eb, f) => {
      if (x < 0 || x >= width || y >= height) return;
      const q = (y * width + x) * 3;
      err[q] += er * f; err[q + 1] += eg * f; err[q + 2] += eb * f;
    };
    for (let k0 = 0, k1; k0 < n; k0 = k1) {
      const row = Math.floor(visited[k0] / cols), line = [];
      for (k1 = k0; k1 < n && Math.floor(visited[k1] / cols) === row; k1++) {
        const i = visited[k1], col = i - row * cols, char = lower[i] ? u.layer.charAt(col, row) : undefined;
        if (char === undefined) continue;
        const halves = halfColors(out[i]);
        const sides = halves.map((half, h) => {
          const o = ((2 * row + h) * width + col) * 4;
          return data[o + 3] ? mix(half, { r: data[o], g: data[o + 1], b: data[o + 2] }, data[o + 3] / 255) : null;
        });
        line.push({ k: k1, i, col, char, halves, sides });
      }
      for (let h = 0; h < 2; h++) {
        const y = 2 * row + h;
        for (const cell of line) {
          const c = cell.sides[h];
          if (cell.char !== null || !c) continue;
          const x = cell.col, q = (y * width + x) * 3;
          const r = byte(c.r + err[q]), g = byte(c.g + err[q + 1]), b = byte(c.b + err[q + 2]);
          const p = palette[paletteIndex(r, g, b, palette)];
          cell.sides[h] = p;
          const er = (r - p.r) * strength, eg = (g - p.g) * strength, eb = (b - p.b) * strength;
          pass(x + 1, y, er, eg, eb, 7 / 16); pass(x - 1, y + 1, er, eg, eb, 3 / 16); pass(x, y + 1, er, eg, eb, 5 / 16); pass(x + 1, y + 1, er, eg, eb, 1 / 16);
        }
      }
      for (const { k, i, col, char, halves, sides } of line) {
        const [top, bottom] = sides.map((side, h) => side ?? halves[h]);
        out[i] = char === null ? this.#upperChar(halves, top, bottom, col, row, params, u.layer, snap) : buildCell(snap(top), snap(bottom), char, params.renderStyle);
        exact[k] = char !== null ? 1 : 0;
      }
    }
  }

  // Whether the upper layers' Floyd–Steinberg holds still through an open edit (composeUpper): the edit's end lays them
  // over again (commitEdit).
  get upperHoldsDither() {
    return this.upper.some((u) => u.kind === 'vector' && u.layer?.drawsShapes && this.holdsDither(u.params));
  }

  // A layer's own Ordered dither (Bayer): its nudge's size (bayerNudge's spread x strength), or 0 with none or no palette.
  #bayerOf(params) {
    return params.dither > 0 && params.ditherStyle === 'bayer' && this.palette?.length ? nudgeSpread(this.palette) * params.dither / 100 : 0;
  }

  // The cells (indexes into n cells, cols wide) some upper layer touches: a cells layer's entries and the cells its paint
  // has a pixel in (reads: its pixels at grid resolution), a vector layer's cells its shapes reach. A whole-grid compose
  // visits only these: a layer with a sticker of paint costs its sticker, not the grid.
  #touched(reads, cols, n) {
    const flags = new Uint8Array(n), width = this.outputCanvas.width, height = this.outputCanvas.height;
    const rows = charRowsOf(height);
    for (let at = 0; at < this.upper.length; at++) {
      const u = this.upper[at], read = reads[at];
      if (u.kind === 'vector') {
        if (read) for (const i of u.layer.reachedCells()) if (i < n) flags[i] = 1;
        continue;
      }
      for (const key of u.cells.keys()) {
        const { col, row } = parseKey(key);
        if (col < cols && row < rows) flags[row * cols + col] = 1;
      }
      if (!read) continue;
      for (let y = 0, o = 3; y < height; y++) {
        const start = (y >> 1) * cols;
        for (let x = 0; x < width; x++, o += 4) if (read[o]) flags[start + x] = 1;
      }
    }
    const cells = [];
    for (let i = 0; i < n; i++) if (flags[i]) cells.push(i);
    return cells;
  }

  // The shown canvas (shownCanvas) has this grid rect to catch up on too, or all of it (null): a compose changed it.
  #shownDirty(rect) {
    const s = this.#shownOver;
    if (!s) return;
    if (!rect) this.#shownOver = null; // a whole compose: a new copy next time
    else s.dirty = union(s.dirty, rect);
  }

  // An upper cells layer's paint at grid resolution through the color transforms, as #drawLayer draws the lower group's:
  // RGBA bytes the output's size. Kept per paint layer while the grid and color settings stay the same, caught up only
  // over what the layer changed since (changedSince), as #gridOf is.
  #upperPaint(paint, params) {
    const w = this.outputCanvas.width, h = this.outputCanvas.height;
    const key = [w, h, ...COLOR_KEYS.map((name) => params[name])].join();
    let kept = this.#upperPaints.get(paint);
    const same = kept?.key === key;
    if (same && kept.version === paint.version) return kept.data;
    const changed = same && paint.changedSince(kept.version);
    const area = changed ? gridRectOf(changed, paint.scale, w, h) : { x: 0, y: 0, w, h };
    if (!same) kept = { key, data: new Uint8ClampedArray(w * h * 4) };
    if (area.w && area.h) putRows(kept.data, w, this.#paintPart(paint, params, area).data, area);
    kept.version = paint.version;
    this.#upperPaints.set(paint, kept);
    return kept.data;
  }

  // Whether the cell at col, row holds a character that's someone's own under the upper layers: the lower cells layer's
  // entry or the base's pin.
  #exactUnder(col, row) {
    return !!this.#lowerEdits?.has(cellKey(col, row)) || this.pinAt(col, row) !== undefined;
  }

  // reads: each upper layer's pixels at grid resolution (composeUpper), or null for one with nothing to lay. Only the
  // layers from `from` up to (not with) `to`, over a cell whose character is exact or not; whether it is after them is
  // left in #exact.
  #upperCell(cell, col, row, palette, reads, from = 0, to = this.upper.length, exact = this.#exactUnder(col, row)) {
    const key = cellKey(col, row);
    const snap = (c) => (palette?.length ? nearestColor(c, palette) : c);
    const width = this.outputCanvas.width;
    const paintAt = (bytes, y) => { // a grid pixel of a layer's paint, or null where there's none
      const o = (y * width + col) * 4;
      return bytes[o + 3] ? { r: bytes[o], g: bytes[o + 1], b: bytes[o + 2], a: bytes[o + 3] / 255 } : null;
    };
    for (let at = from; at < to; at++) {
      const u = this.upper[at], read = reads[at], { params } = u, { renderStyle } = params;
      if (u.kind === 'vector') {
        if (!read) continue;
        const char = u.layer.charAt(col, row);
        if (char === undefined) continue;
        const { data } = read, halves = halfColors(cell), size = char === null ? this.#bayerOf(params) : 0;
        const ordered = size && !resolves(params); // each half it covers nudged by its own place, then snapped
        const [top, bottom] = halves.map((half, k) => {
          const o = ((2 * row + k) * width + col) * 4;
          if (!data[o + 3]) return half;
          const c = mix(half, { r: data[o], g: data[o + 1], b: data[o + 2] }, data[o + 3] / 255);
          if (!ordered) return c;
          const v = bayerNudge(col, 2 * row + k, size, 1);
          return palette[paletteIndex(byte(c.r + v), byte(c.g + v), byte(c.b + v), palette)];
        });
        cell = char === null ? this.#upperChar(halves, top, bottom, col, row, params, u.layer, snap, ordered ? 0 : bayerNudge(col, row, size, 1)) : buildCell(snap(top), snap(bottom), char, renderStyle);
        exact = char !== null;
        continue;
      }
      const entry = u.cells.get(key);
      const top = read ? paintAt(read, 2 * row) : null, bottom = read ? paintAt(read, 2 * row + 1) : null;
      if (entry) {
        cell = coverCell(composeCell(cell, entry, renderStyle, (hex) => this.effective(hex, params)), top, bottom, { renderStyle, palette });
        exact = true;
        continue;
      }
      if (!top && !bottom) continue;
      if (exact) {
        cell = coverCell(cell, top, bottom, { renderStyle, palette });
        continue;
      }
      const halves = halfColors(cell), [ht, hb] = halves;
      // Paint is drawn a grid pixel at a time (PaintLayer.paint, drawOver): its halves are its samples.
      cell = this.#upperChar(halves, top ? mix(ht, top, top.a) : ht, bottom ? mix(hb, bottom, bottom.a) : hb, col, row, params, null, snap);
    }
    this.#exact = exact;
    return cell;
  }

  // The cell an upper layer's settings (params, its own) make of a converted cell at col, row: under, its two half colors
  // under the layer; top and bottom, them with the layer's pixels over them (grid resolution, before the palette snap).
  // Best match's or By shape's cell for the one cell with no error coming in (as #resolvePainted), By shape's sampled
  // as the lower group's are: the layer's own samples in the cell (#samplesAt) over the halves under it. Else the halves
  // snapped with Random's seed character (its own seed's in its own set) or one by weight (weightedChar). nudge: Ordered
  // dither's for the cell (bayerNudge), added to every sample Best match or By shape matches, as walkCells adds it.
  #upperChar(under, top, bottom, col, row, params, layer, snap, nudge = 0) {
    if (resolves(params) && this.#fontReady) {
      let m = this.#matchers.get(params);
      if (m?.palette !== this.palette) {
        const glyphs = this.#glyphsOf(params.chars), solids = params.solids / 100, light = params.patternLight / 100;
        const matcher = params.charMode === 'shape' ? shapeMatcher({ palette: this.palette, glyphs, solids, light, renderStyle: params.renderStyle }) : bestMatcher({ palette: this.palette, glyphs, solids, light });
        this.#matchers.set(params, m = { palette: this.palette, matcher });
      }
      const { matcher } = m;
      if (params.charMode !== 'shape') {
        const r = matcher.match([clamp(top.r + nudge), clamp(top.g + nudge), clamp(top.b + nudge)], [clamp(bottom.r + nudge), clamp(bottom.g + nudge), clamp(bottom.b + nudge)]);
        return { char: r.char, fg: r.fg, bg: r.bg };
      }
      const s = (this.#cellSamples ??= new Float64Array(SAMPLES.w * SAMPLES.h * 3)), own = this.#samplesAt(layer, params, col, row);
      for (let sy = 0, j = 0; sy < SAMPLES.h; sy++) {
        const half = sy < SAMPLES.h / 2 ? 0 : 1, u = under[half], c = half ? bottom : top;
        for (let sx = 0; sx < SAMPLES.w; sx++, j += 3) {
          if (!own) { s[j] = clamp(c.r + nudge); s[j + 1] = clamp(c.g + nudge); s[j + 2] = clamp(c.b + nudge); continue; }
          const o = ((own.y + sy) * own.width + own.x + sx) * 4, a = own.data[o + 3] / 255;
          s[j] = clamp(Math.round(own.data[o] * a + u.r * (1 - a)) + nudge); s[j + 1] = clamp(Math.round(own.data[o + 1] * a + u.g * (1 - a)) + nudge); s[j + 2] = clamp(Math.round(own.data[o + 2] * a + u.b * (1 - a)) + nudge);
        }
      }
      const r = matcher.match(s);
      return { char: r.char, fg: r.fg, bg: r.bg };
    }
    const t = snap(top), b = snap(bottom);
    return buildCell(t, b, keepsSeed(params.charMode) ? seededChar(params.chars, params.seed, col, row) : weightedChar(t, b, params.chars, params.charMode), params.renderStyle);
  }

  // An upper vector layer's own samples in the cell at col, row (its shapes, SAMPLES a cell, alpha their coverage, through
  // the color transforms, as baseSamplesOver reads the base's): { data, width, x, y }, the cell's first sample at x, y of
  // data (RGBA), width samples wide. Read from the layer a tile of cells at a time
  // where it's first asked for (only cells the layer reaches ask), and kept until the grid, its scale or the color settings
  // change, the layer changes over the tile, it's no longer an upper By shape layer (render), or the tiles of every layer
  // together pass sampleBudget (the least recently used go). Null for none, or a layer with no more detail than its grid
  // pixels (scale 1: its halves are its samples). Its coverage is a byte, so in full color a cell can come out a level
  // off the lower group's.
  // ponytail: one budget for every layer, 32 KB a tile: a layer reaching past it reads its oldest tiles again on every
  // whole compose; raise sampleBudget if that shows in profiles.
  #samplesAt(layer, params, col, row) {
    const k = layer?.scale;
    if (!(k > 1)) return null;
    const w = this.outputCanvas.width, h = this.outputCanvas.height, n = SAMPLES.w, across = Math.ceil(w / TILE);
    let kept = this.#upperSamples.get(layer);
    if (kept?.params !== params || kept.w !== w || kept.h !== h || kept.k !== k) { // the key's worked out only then, not a cell at a time
      const key = [w, h, k, ...COLOR_KEYS.map((name) => params[name])].join();
      if (kept?.key !== key) {
        if (kept) this.#dropTiles((each) => each === kept);
        this.#upperSamples.set(layer, kept = { layer, key, version: layer.version, tiles: new Map() });
      }
      Object.assign(kept, { params, w, h, k });
    }
    if (kept.version !== layer.version) {
      const since = layer.changedSince(kept.version), area = since && gridRectOf(since, k, w, h);
      kept.version = layer.version;
      if (!area) this.#dropTiles((each) => each === kept);
      else if (area.w && area.h) {
        for (const [t, tile] of kept.tiles) {
          const x = (t % across) * TILE, y = Math.floor(t / across) * 2 * TILE;
          if (x < area.x + area.w && area.x < x + TILE && y < area.y + area.h && area.y < y + 2 * TILE) this.#dropTile(kept, t, tile);
        }
      }
    }
    const tx = Math.floor(col / TILE), ty = Math.floor(row / TILE), t = ty * across + tx;
    let tile = kept.tiles.get(t);
    if (tile) this.#tiles.delete(tile); // used: the newest
    else {
      const area = clipped({ x: tx * TILE, y: ty * 2 * TILE, w: TILE, h: 2 * TILE }, w, 2 * charRowsOf(h)), count = area.w * n * area.h * n;
      tile = { t, area, data: new Uint8ClampedArray(count * 4) };
      baseSamplesOver(tile.data, area.w * n, layer, params, area, n, true);
      kept.tiles.set(t, tile);
      this.#tileBytes += tile.data.byteLength;
    }
    this.#tiles.set(tile, kept);
    this.#dropTiles(null);
    return { data: tile.data, width: tile.area.w * n, x: (col - tile.area.x) * n, y: (2 * row - tile.area.y) * n };
  }

  // Every tile of the layers whose #upperSamples entry gone(entry) says, then (gone null too) the least recently used past
  // sampleBudget, the newest kept whatever it holds.
  #dropTiles(gone) {
    if (gone) for (const [tile, kept] of this.#tiles) if (gone(kept)) this.#dropTile(kept, tile.t, tile);
    for (const [tile, kept] of this.#tiles) {
      if (this.#tileBytes <= this.sampleBudget || this.#tiles.size === 1) break;
      this.#dropTile(kept, tile.t, tile);
    }
  }

  #dropTile(kept, t, tile) {
    kept.tiles.delete(t);
    this.#tiles.delete(tile);
    this.#tileBytes -= tile.data.byteLength;
  }

  // An upper layer (upper) has its own Best match or By shape and the reference font they measure glyphs in hasn't loaded:
  // a render loads it (until then such a layer's cells are Random's or by weight).
  get needsFont() { return !this.#fontReady && this.upper.some((u) => resolves(u.params)); }

  // What the upper layers' By shape samples hold, in bytes (#samplesAt).
  get sampleBytes() { return this.#tileBytes; }

  // What the PIXEL view shows and the Paint Bucket reads: the output, with every upper layer's pixels (its shapes at grid
  // resolution, its paint) drawn over it when there are any. Kept, and caught up only over the rect the composes since
  // changed (#shownDirty): an edit on an upper layer costs its own cells here too.
  shownCanvas() {
    if (!this.upper.length || !this.outputCanvas) return this.outputCanvas;
    const { width, height } = this.outputCanvas;
    let s = this.#shownOver;
    if (s?.of !== this.outputCanvas) s = this.#shownOver = { of: this.outputCanvas, canvas: Object.assign(document.createElement('canvas'), { width, height }), dirty: { x: 0, y: 0, w: width, h: height } };
    const area = s.dirty && clipped(s.dirty, width, height);
    if (!area) return s.canvas;
    s.dirty = { x: 0, y: 0, w: 0, h: 0 };
    if (!area.w || !area.h) return s.canvas;
    const ctx = ctx2d(s.canvas), { x, y, w, h } = area;
    ctx.clearRect(x, y, w, h);
    ctx.drawImage(this.outputCanvas, x, y, w, h, x, y, w, h);
    for (const u of this.upper) {
      if (u.kind === 'cells') {
        if (u.paint?.hasPaint) this.#drawLayerArea(ctx, u.paint, u.params, area);
        continue;
      }
      if (!u.layer?.drawsShapes) continue;
      u.layer.sync();
      const grid = this.#upperGrid(u.layer, u.params);
      if (!grid.canvas) { // kept in step by #gridOf from here on, as #drawBase keeps the base's
        grid.canvas = Object.assign(document.createElement('canvas'), { width, height });
        ctx2d(grid.canvas).putImageData(grid.data, 0, 0);
      }
      ctx.drawImage(grid.canvas, x, y, w, h, x, y, w, h);
    }
    return s.canvas;
  }

  // A stored color as it displays: color adjustments, then the active palette.
  effective(hex, params) {
    let color = this.#effective.get(hex);
    if (!color) {
      color = effectiveColor(hex, params, this.palette);
      this.#effective.set(hex, color);
    }
    return color;
  }

  // Transformed paint at a grid pixel ({ r, g, b, a } with a in 0..1), or null where there's none.
  paintAt(x, y) {
    const data = this.#paintData;
    if (!data || x < 0 || y < 0 || x >= data.width || y >= data.height) return null;
    const o = (y * data.width + x) * 4;
    return data.data[o + 3] ? { r: data.data[o], g: data.data[o + 1], b: data.data[o + 2], a: data.data[o + 3] / 255 } : null;
  }

  // A grid pixel of the image downsampled by the pipeline with nothing applied, or null before the
  // first render. Black in the letterbox, as the pipeline fills it.
  // cols/rows: the current grid; between a resize and its render the cached pixels are stale.
  imageAt(x, y, cols, rows) {
    const data = this.#source?.data;
    if (!data || data.width !== cols || data.height !== rows || x < 0 || y < 0 || x >= cols || y >= rows) return null;
    if (this.hideBase) return { r: 0, g: 0, b: 0 };
    const o = (y * data.width + x) * 4;
    return { r: data.data[o], g: data.data[o + 1], b: data.data[o + 2] };
  }

  // The pipeline with the base layer's pixels over it, as of the last composite: what the paint sits on.
  // Under Best match (which the shader leaves unsnapped) snapped to the palette, as the output is:
  // whole when first asked for, then only over what a composite changes.
  get basePixels() {
    if (this.#dithered) return this.#dithered.data;
    if (!this.#resolved || !this.palette?.length || !this.#baseData) return this.#baseData;
    const snapped = this.#baseSnapped;
    if (snapped?.from !== this.#baseData || snapped.palette !== this.palette) {
      const { width, height, data } = this.#baseData, bytes = data.slice();
      snapBytes(bytes, this.palette);
      this.#baseSnapped = { from: this.#baseData, palette: this.palette, data: new ImageData(bytes, width, height) };
    }
    return this.#baseSnapped.data;
  }

  // The base layer's cell (no edit cells, no paint): what an edit cell sits on, Best match's own
  // where it resolved one. Null while the pipeline pixels are stale (between a grid resize and its render).
  underCell(col, row, params, baseCells) {
    const { cols, chars: charset, charMode, renderStyle } = params;
    const resolved = this.#resolvedFor(params); // for this grid only
    if (resolved && this.pinAt(col, row) === undefined) return resolved.cells[cellIndex(col, row, cols)] ?? null;
    const data = this.#dithered?.data ?? this.#baseData; // snapped below
    // Between a grid resize and the render it queues, the pipeline pixels are the old size.
    if (!data || data.width !== cols || data.height !== params.rows) return null;
    const pixelAt = (y) => {
      const o = (Math.min(y, params.rows - 1) * cols + col) * 4;
      const p = { r: data.data[o], g: data.data[o + 1], b: data.data[o + 2] };
      return this.palette ? nearestColor(p, this.palette) : p;
    };
    const top = pixelAt(2 * row), bottom = pixelAt(2 * row + 1);
    const char = keepsSeed(charMode) ? baseCells[cellIndex(col, row, cols)]?.char ?? ' ' : weightedChar(top, bottom, charset || '▄', charMode);
    return this.#onBase(col, row, buildCell(top, bottom, char, renderStyle));
  }

  // A pinned cell with paint in it, or null: the cell the base shows (underCell), the paint over it as
  // over an edit cell (coverCell). A pin's colors are its two pixels, background over foreground, so
  // paint mixed into them would color half a space or a block the wrong way (or not show at all).
  #paintedPin(col, row, params) {
    if (this.pinAt(col, row) === undefined) return null;
    const top = this.paintAt(col, 2 * row), bottom = this.paintAt(col, 2 * row + 1);
    if (!top && !bottom) return null;
    const under = this.underCell(col, row, params, []);
    return under && coverCell(under, top, bottom, { renderStyle: params.renderStyle, palette: this.#heldData ? null : this.palette });
  }

  // A converted cell with the base layer's pin (if any) as its character.
  #onBase(col, row, cell) {
    const pin = this.pinAt(col, row);
    return pin !== undefined ? { ...cell, char: pin } : cell;
  }

  // The character a cell keeps, or undefined (the conversion's): the topmost art layer's there, else the base
  // layer's pin; none where a shape reaches over either (the pin shows again once no shape covers it).
  pinAt(col, row) {
    const pins = this.hideBase ? EMPTY_BASE.pins : this.baseRecords.pins, pin = pins.size ? pins.get(cellKey(col, row)) : undefined; // no key made for none: asked once a cell
    if (pin === undefined && !this.shapes?.hasArt) return undefined;
    const shown = this.shapes?.charAt(col, row);
    return shown === undefined ? pin : shown ?? undefined;
  }

  // What's under the shapes' side of the converter: the base layer, with the shapes over it while there are any.
  // A hidden base: the shapes alone (ShapeLayer.hideBase), or nothing.
  get #base() {
    if (!this.shapes?.drawsShapes) return this.hideBase ? null : this.baseLayer;
    this.shapes.sync();
    return this.shapes;
  }

  // An edit cell and paint in the same cell: the edit cell's entry composes over the paint-free
  // image, then any paint in the cell shows over it (coverCell), so erasing the paint reveals the edit
  // cell again. (A rule chosen to try out; it lives only here, so it's one place to change.)
  #composeOne(col, row, params, entry, baseCells) {
    const under = this.underCell(col, row, params, baseCells);
    if (!under) return baseCells[cellIndex(col, row, params.cols)];
    const cell = composeCell(under, entry, params.renderStyle, (hex) => this.effective(hex, params));
    return coverCell(cell, this.paintAt(col, 2 * row), this.paintAt(col, 2 * row + 1), {
      renderStyle: params.renderStyle,
      palette: this.palette,
    });
  }
}

// Opaque black, as the pipeline fills the letterbox: what a hidden base shows.
function blackImage(w, h) {
  const image = new ImageData(w, h);
  new Uint32Array(image.data.buffer).fill(0xff000000); // little-endian RGBA: alpha 255
  return image;
}

function blackCanvas(w, h) {
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  ctx2d(canvas).putImageData(blackImage(w, h), 0, 0);
  return canvas;
}

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const byte = (v) => Math.round(clamp(v));

// A canvas's pixels snapped to a palette in place, read and written once as bytes (no object per
// pixel: this runs over the whole output). Returns its bytes and each pixel's palette entry, or
// indexes null with no palette.
function snapToPalette(canvas, palette, { x, y, w, h } = { x: 0, y: 0, w: canvas.width, h: canvas.height }) {
  const ctx = ctx2d(canvas), image = ctx.getImageData(x, y, w, h), data = image.data;
  if (!palette?.length) return { data, indexes: null };
  const indexes = snapBytes(data, palette);
  ctx.putImageData(image, x, y);
  return { data, indexes };
}

// RGBA bytes snapped to a palette in place; each pixel's palette entry.
function snapBytes(data, palette) {
  const indexes = new Uint16Array(data.length / 4);
  let last = -1, k = 0; // a pixel the color of the one before it (most are) skips the lookup
  for (let i = 0, o = 0; i < indexes.length; i++, o += 4) {
    const rgb = data[o] << 16 | data[o + 1] << 8 | data[o + 2];
    if (rgb !== last) k = paletteIndex(data[o], data[o + 1], data[o + 2], palette), last = rgb;
    indexes[i] = k;
    data[o] = palette[k].r; data[o + 1] = palette[k].g; data[o + 2] = palette[k].b;
    data[o + 3] ||= 255; // as Canvas.writePixels writes a see-through pixel
  }
  return indexes;
}

// A rect ({ x, y, w, h }) of rows (RGBA bytes, rect.w wide) put into a width-wide image's bytes.
function putRows(target, width, rows, { x, y, w, h }) {
  for (let row = 0; row < h; row++) target.set(rows.subarray(row * w * 4, (row + 1) * w * 4), ((y + row) * width + x) * 4);
}

// A rect's rows of a width-wide image's bytes (as putRows takes them).
function rowsOf(data, width, { x, y, w, h }) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) out.set(data.subarray(((y + row) * width + x) * 4, ((y + row) * width + x + w) * 4), row * w * 4);
  return out;
}

// What Best match's cells (Renderer #resolved) are worked out from, besides the picture and the palette.
const resolvedKey = (params, cols, rows) => JSON.stringify([params.charMode, params.chars, params.solids, params.patternLight, params.dither, params.ditherStyle, params.renderStyle, cols, rows]);

// A resolve's cells, { out, gpu }: with no error carried from cell to cell the GPU's (ShapeMatcher,
// args) when it can match them, else the JavaScript's (js), gpu saying which. gpu given (an area):
// only that way, so the area's cells are the ones its grid's whole resolve would give, near-ties and
// all; null when the GPU made the grid and can't any more (its context lost), for a whole resolve.
function resolveBy(gpu, carries, js, ...args) {
  if (gpu !== false && !carries) {
    const out = ShapeMatcher.shared()?.resolve(...args);
    if (out) return { out, gpu: true };
    if (gpu) return null;
  }
  return { out: js(), gpu: false };
}

// Whether two width-wide images' bytes agree over a rect.
function sameRows(a, b, width, { x, y, w, h }) {
  if (a.length !== b.length) return false;
  for (let row = y; row < y + h; row++) {
    for (let o = (row * width + x) * 4, end = o + w * 4; o < end; o++) if (a[o] !== b[o]) return false;
  }
  return true;
}

// Whether rect a lies inside rect b.
const inside = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

// The smallest rect holding rects a and b; an empty one (no width or height) adds nothing.
function union(a, b) {
  if (!a.w || !a.h) return b;
  if (!b.w || !b.h) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

// A rect clipped to a w x h grid.
function clipped(rect, w, h) {
  const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
  return { x, y, w: Math.max(0, Math.min(w, rect.x + rect.w) - x), h: Math.max(0, Math.min(h, rect.y + rect.h) - y) };
}

// The grid pixels (w x h) over a rect of a layer at k pixels per grid pixel.
function gridRectOf(rect, k, w, h) {
  const x = Math.floor(rect.x / k), y = Math.floor(rect.y / k);
  return clipped({ x, y, w: Math.ceil((rect.x + rect.w) / k) - x, h: Math.ceil((rect.y + rect.h) / k) - y }, w, h);
}

// The base layer at grid resolution over area (#baseGrid has the why of each step).
function baseGridPart(layer, params, palette, area, stored) {
  const k = layer.scale, w = area.w, h = area.h;
  const full = document.createElement('canvas');
  full.width = w * k;
  full.height = h * k;
  const fullCtx = ctx2d(full);
  fullCtx.drawImage(layer.canvas, area.x * k, area.y * k, w * k, h * k, 0, 0, w * k, h * k);
  const raw = fullCtx.getImageData(0, 0, w * k, h * k).data;
  const pixels = new ImageData(new Uint8ClampedArray(raw), w * k, h * k), d = pixels.data;
  if (transformsOn(params)) applyTransforms(d, params);
  if (palette) {
    const snapped = adjustedPixels(full, params);
    for (let i = 0; i < d.length; i += 4) {
      if (raw[i + 3] === 255) d.set(snapped.subarray(i, i + 3), i);
    }
  }
  let data;
  if (params.smoothing === 'low') {
    fullCtx.putImageData(pixels, 0, 0);
    const nearest = ctx2d(Object.assign(document.createElement('canvas'), { width: w, height: h }));
    nearest.imageSmoothingEnabled = false;
    nearest.drawImage(full, 0, 0, w * k, h * k, 0, 0, w, h);
    data = nearest.getImageData(0, 0, w, h);
  } else {
    data = averaged(d, w, h, k, params.smoothing === 'medium' ? 2 : 1);
  }
  if (stored) keepUniform(data, raw, w, h, k);
  return data;
}

// The base layer's own pixels (k a grid pixel) blended over samples (RGBA bytes, width wide, n a grid
// pixel each way) in area (grid pixels): each sample the alpha-weighted average of the layer pixels
// it covers, or the one it falls in when it covers none (k under n), through the color transforms.
// Worked out from the layer's bytes, not drawn scaled, so an area comes out as the whole would. own: samples are the
// layer's own, area's alone from data's corner, each its color and its coverage in alpha (#samplesAt).
function baseSamplesOver(data, width, layer, params, area, n, own = false) {
  const k = layer.scale;
  const lx = Math.floor(area.x * k), ly = Math.floor(area.y * k);
  const lw = Math.max(1, Math.ceil((area.x + area.w) * k) - lx), lh = Math.max(1, Math.ceil((area.y + area.h) * k) - ly);
  const d = ctx2d(layer.canvas).getImageData(lx, ly, lw, lh).data;
  if (transformsOn(params)) applyTransforms(d, params);
  // The layer pixels [from, to) a sample covers, across and down, from the area's corner.
  const spans = (start, count) => {
    const from = new Int32Array(count), to = new Int32Array(count);
    for (let i = 0; i < count; i++) {
      const s = start * n + i, a = Math.floor(s * k / n);
      from[i] = a; to[i] = Math.max(a + 1, Math.floor((s + 1) * k / n));
    }
    return { from, to };
  };
  const xs = spans(area.x, area.w * n), ys = spans(area.y, area.h * n);
  for (let j = 0; j < area.h * n; j++) {
    for (let i = 0; i < area.w * n; i++) {
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let y = ys.from[j]; y < ys.to[j]; y++) {
        for (let x = xs.from[i]; x < xs.to[i]; x++) {
          const o = ((y - ly) * lw + (x - lx)) * 4, al = d[o + 3];
          r += d[o] * al; g += d[o + 1] * al; b += d[o + 2] * al; a += al;
          count++;
        }
      }
      if (!a) continue;
      if (own) {
        const o = (j * width + i) * 4;
        data[o] = Math.round(r / a); data[o + 1] = Math.round(g / a); data[o + 2] = Math.round(b / a); data[o + 3] = Math.round(a / count);
        continue;
      }
      const alpha = a / count / 255, o = ((area.y * n + j) * width + area.x * n + i) * 4;
      data[o] = Math.round(Math.round(r / a) * alpha + data[o] * (1 - alpha));
      data[o + 1] = Math.round(Math.round(g / a) * alpha + data[o + 1] * (1 - alpha));
      data[o + 2] = Math.round(Math.round(b / a) * alpha + data[o + 2] * (1 - alpha));
      data[o + 3] = 255;
    }
  }
}

// The cells a side of an upper layer's tile of By shape samples (Renderer #samplesAt).
const TILE = 16;

// The color settings a layer is drawn with.
const COLOR_KEYS = ['brightness', 'contrast', 'saturation', 'hue', 'invert', 'colorize', 'colorizeStrength',
  'levelsBlack', 'levelsWhite', 'levelsMid', 'posterize', 'threshold', 'thresholdDark', 'thresholdLight'];

// RGBA pixels w*k x h*k averaged to w x h, a k x k block per pixel (every step-th pixel, as
// Canvas.drawManual samples), colors weighted by alpha so an empty pixel adds nothing.
function averaged(d, w, h, k, step) {
  const out = new ImageData(w, h), o = out.data, rowLength = w * k;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y * k; sy < (y + 1) * k; sy += step) {
        for (let sx = x * k; sx < (x + 1) * k; sx += step) {
          const i = (sy * rowLength + sx) * 4, al = d[i + 3];
          r += d[i] * al; g += d[i + 1] * al; b += d[i + 2] * al; a += al;
          n++;
        }
      }
      if (!a) continue;
      const j = (y * w + x) * 4;
      o[j] = Math.round(r / a); o[j + 1] = Math.round(g / a); o[j + 2] = Math.round(b / a); o[j + 3] = Math.round(a / n);
    }
  }
  return out;
}

// Where a k x k block of raw (w*k x h*k) is one color, that color in the w x h grid data.
function keepUniform(data, raw, w, h, k) {
  const rowLength = w * k, o = data.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const first = (y * k * rowLength + x * k) * 4;
      let uniform = true;
      for (let sy = y * k; uniform && sy < (y + 1) * k; sy++) {
        for (let sx = x * k; sx < (x + 1) * k; sx++) {
          const i = (sy * rowLength + sx) * 4;
          if (raw[i] !== raw[first] || raw[i + 1] !== raw[first + 1] || raw[i + 2] !== raw[first + 2] || raw[i + 3] !== raw[first + 3]) {
            uniform = false;
            break;
          }
        }
      }
      if (uniform) o.set(raw.subarray(first, first + 4), (y * w + x) * 4);
    }
  }
}
