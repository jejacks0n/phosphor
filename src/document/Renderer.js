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
import { buildCellsFromBytes, buildCell, keepsSeed, weightedChar, cellIndex, cellOfPixel, charRowsOf, composeCell, coverCell, glyphsOf, halfColors, mix } from '../lib/Cells.js';
import { cellKey, parseKey } from './editCells.js';
import { EMPTY_BASE } from './baseRecords.js';
import { ditherPixels } from '../lib/Dither.js';
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
  #scratch = null;
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
  #glyphs = null;       // { chars, glyphs }: the set's glyphs with their inks and masks in the reference font
  #snapped = null;      // the whole output's bytes and palette entries, from the composite that just snapped it
  #effective = new Map(); // stored color -> displayed Color, until the next render
  #source = null;       // { key, data }: the image through the pipeline with color adjustments neutral (stored colors)
  #processed = null;    // { image, key, scale, canvas }: the processed picture in the grid at the base layer's scale (processed)
  #baseDrawn = null;    // { layer, version, key, data, canvas }: the base layer as drawn at grid resolution (#baseGrid)
  #baseStored = null;   // the same for its stored colors (#baseGrid, stored)
  #baseParams = null;   // the last render's baseParams
  #chosen = null;       // a Number palette someone else picked (usePalette): composite doesn't pick its own

  // Forget the previous image's canvases so nothing paints against them before the next render.
  reset() {
    this.shapes?.reset();
    this.pipelineCanvas = this.outputCanvas = this.palette = this.#chosen = null;
    this.#pipelineData = this.#baseData = this.#paintData = this.#source = this.#processed = this.#baseDrawn = this.#baseStored = this.#baseParams = this.#snapped = this.#dithered = this.#resolved = this.#baseSnapped = this.#picture = this.#samples = this.#painted = null;
    this.#effective = new Map();
  }

  // baseParams: params with the color adjustments neutral (settings.baseParams).
  async render(image, params, paintLayer, baseParams) {
    if (resolves(params) && !this.#fontReady) { // glyphs measured in a placeholder font would choose the characters
      // If it doesn't load, glyphs are measured in its fallbacks, ending in the system's monospace font,
      // which differs from computer to computer: the characters may then too.
      await loadReferenceFont().catch((error) => console.warn('IBM VGA did not load: Best match and By shape measure glyphs in a fallback font', error));
      this.#fontReady = true;
    }
    const { canvas: pipeline, paletteColors, samples } = await processImage(image, params);
    this.pipelineCanvas = pipeline.canvas;
    this.#picture = samples;
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
      const { cols } = params, pins = this.baseRecords.pins;
      return resolved.cells.map((cell, i) => {
        const col = i % cols, row = (i - col) / cols;
        if (!pins.size || this.pinAt(col, row) === undefined) return this.#shown(cell, col, row, params);
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
  // with the color transforms applied. The Number palette (quantize 'count') is picked from what
  // that shows, so the drawing's colors have places in it; true when that changed the palette
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
    const { cols } = params, cells = this.#resolved.cells, pins = this.baseRecords.pins;
    const r0 = area.y >> 1, r1 = Math.min(charRowsOf(params.rows), (area.y + area.h + 1) >> 1);
    if (r1 <= r0) return;
    const { x, w } = area, y = 2 * r0, image = ctx.getImageData(x, y, w, 2 * (r1 - r0)), d = image.data;
    const paint = this.#paintData?.data, inks = new Map(); // halfColors' math, inline: this runs over the whole grid
    for (let row = r0; row < r1; row++) {
      for (let col = x; col < x + w; col++) {
        const pinned = pins.size && this.pinAt(col, row) !== undefined, cell = cells[row * cols + col];
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
    if (this.#glyphs?.chars !== chars) {
      this.#glyphs = { chars, glyphs: [...new Set(glyphsOf(chars))].map((char) => ({ char, ink: referenceInk(char), mask: referenceMask(char, SAMPLES.w, SAMPLES.h) })) };
    }
    return this.#glyphs.glyphs;
  }

  // A Number palette chosen from outside (one for a whole animation), until it's null: cells then use it, and
  // a composite doesn't pick one from what it shows. The output's snap waits for the next composite.
  usePalette(palette) {
    this.#chosen = palette;
    if (palette) this.palette = palette;
    this.#effective = new Map();
  }

  // The Number palette from the output as composited (before it's quantized); true when it changed.
  #recount(params) {
    const next = getPaletteColors(params, new Canvas(this.outputCanvas));
    const key = (palette) => palette?.map((p) => p.hex).join();
    if (key(next) === key(this.palette)) return false;
    this.palette = next;
    this.#effective = new Map(); // displayed colors snap to the palette
    return true;
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
    const w = this.outputCanvas.width, h = this.outputCanvas.height, k = layer.scale;
    const palette = (params.quantize === 'cga' || params.quantize === 'vga') && !snapsLate(params) && this.palette?.length ? this.palette : null;
    const key = [w, h, params.smoothing, palette && params.quantize, ...COLOR_KEYS.map(key => params[key])].join();
    const cached = stored ? this.#baseStored : this.#baseDrawn;
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
    if (stored) this.#baseStored = result;
    else this.#baseDrawn = result;
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

  // Draw a layer at grid resolution (a grid pixel at a time) with the color transforms applied;
  // returns the transformed pixels. area: only those grid pixels (the rest of #paintData stays).
  #drawLayer(ctx, layer, params, area = null) {
    const w = this.outputCanvas.width, h = this.outputCanvas.height, k = layer.scale;
    const { x, y, w: aw, h: ah } = area ?? { x: 0, y: 0, w, h };

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
    if (transformsOn(params)) {
      applyTransforms(pixels.data, params);
      scratchCtx.putImageData(pixels, x, y);
    }
    ctx.drawImage(this.#scratch, x, y, aw, ah, x, y, aw, ah);
    if (!area) return pixels;
    putRows(this.#paintData.data, w, pixels.data, area);
    return this.#paintData;
  }

  // Rebuild only the cells under the given grid pixels from the (already composited) output canvas.
  // baseCells (the last full render) supplies a cell's character in random mode.
  updateCells(cells, pixels, params, editCells, baseCells) {
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

  // Generated cells with the base's pins and every in-grid edit cell composed in.
  composeAll(baseCells, editCells, params) {
    const cells = baseCells.slice();
    const rows = charRowsOf(params.rows);
    for (const key of this.baseRecords.pins.keys()) {
      const { col, row } = parseKey(key);
      if (col < params.cols && row < rows) cells[cellIndex(col, row, params.cols)] = this.#paintedPin(col, row, params) ?? this.#onBase(col, row, cells[cellIndex(col, row, params.cols)]);
    }
    for (const [key, entry] of editCells) {
      const { col, row } = parseKey(key);
      if (col < params.cols && row < rows) cells[cellIndex(col, row, params.cols)] = this.#composeOne(col, row, params, entry, baseCells);
    }
    return cells;
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

  // The base layer's pinned character at a cell, or undefined: none, or a shape draws there and the cell's
  // character comes from the conversion (the pin shows again once no shape covers it).
  pinAt(col, row) {
    const pin = this.baseRecords.pins.get(cellKey(col, row));
    return pin !== undefined && this.shapes?.covers(col, row) ? undefined : pin;
  }

  // What's under the shapes' side of the converter: the base layer, with the shapes over it while there are any.
  get #base() {
    if (!this.shapes?.drawsShapes) return this.baseLayer;
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

// The smallest rect holding rects a and b.
function union(a, b) {
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
// Worked out from the layer's bytes, not drawn scaled, so an area comes out as the whole would.
function baseSamplesOver(data, width, layer, params, area, n) {
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
      const alpha = a / count / 255, o = ((area.y * n + j) * width + area.x * n + i) * 4;
      data[o] = Math.round(Math.round(r / a) * alpha + data[o] * (1 - alpha));
      data[o + 1] = Math.round(Math.round(g / a) * alpha + data[o + 1] * (1 - alpha));
      data[o + 2] = Math.round(Math.round(b / a) * alpha + data[o + 2] * (1 - alpha));
      data[o + 3] = 255;
    }
  }
}

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
