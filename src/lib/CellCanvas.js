/**
 * The ANSI view's cells drawn on a <canvas> with WebGL2, text anti-aliased (smooth: a glyph's edges
 * blend its cell's fg into its bg, and nothing else) or sharp (every pixel exactly fg or bg); a color
 * glyph (an emoji) is its own colors, and blocks and shades are always exactly fg or bg. One
 * full-screen pass reads each pixel's cell from two cols x rows data textures (fg rgb + glyph index
 * low byte, bg rgb + high byte) and its ink from an atlas of glyphs (see #rasterize), and every draw
 * is a full redraw. The canvas covers only the cells in view (the view picks them: draw takes the
 * whole grid and where its window starts), so a redraw stays a few milliseconds at any grid size.
 * (fillText anti-aliases; Path2D masks, a CPU blend and per-cell tinting were all far slower.)
 *
 * Block elements (█▀▄▌▐ and the quadrants) and the shades (░▒▓) aren't the font's: they're drawn
 * exactly, as most terminals draw them, so they never seam; the shades as CP437's dot patterns, a
 * dot a sixteenth of the cell high (the VGA's own pixel in its 8x16 cell), across the whole grid, wherever
 * the window is.
 *
 * Cells snap to whole device pixels at a backing scale capped to stay under the browsers' canvas
 * limits (which only a huge viewport reaches); metrics is the cell size in CSS px that the editor's
 * overlays measure with.
 *
 * A character drawing wider than its columns (﷽ gets one and draws about eleven: DrawnWidth) is drawn
 * as a terminal draws it: its cell keeps its column, and its full shape covers the cells after it,
 * over their characters and backgrounds. Its shape is cut into a glyph per column it covers; two more
 * data textures give each covered cell the slice that lands there and the character's color.
 */
import { DISPLAY_FONT, displayFontCss, drawGlyph } from './displayFonts.js';
import { drawnColumns, layoutSpills } from './DrawnWidth.js';

// Safari refuses 2D canvases of 16,777,216 pixels or more, and a WebGL drawing buffer past the GPU's
// largest side (16384 px on most, 8192 on software WebGL) is quietly cut short.
export const MAX_BACKING_AREA = 16_000_000;
const ATLAS_COLS = 64; // glyphs per atlas row

// Device pixels per CSS pixel: the display's, or less when a grid that big would pass the area cap
// or have a side longer than maxSide.
export function backingScale(cssWidth, cssHeight, dpr, maxSide = Infinity) {
  return Math.min(dpr, Math.sqrt(MAX_BACKING_AREA / (cssWidth * cssHeight)), maxSide / cssWidth, maxSide / cssHeight);
}

// A cell in whole device pixels (an even height, so the two halves match, as GlyphCoverage
// rasterizes) and in CSS px. advance: the font's character width at its CSS size. capped: the scale
// was lowered to the cap, so sizes round down (rounding up would pass it again).
export function cellGeometry(advance, scale, capped = false, font = DISPLAY_FONT) {
  const round = capped ? Math.floor : Math.round;
  const cw = round(advance * scale);
  const ch = round(font.size * font.lineHeight * scale / 2) * 2;
  return { cw, ch, cellWidth: cw / scale, lineHeight: ch / scale };
}

// Block elements as exact quadrants, the way the cell model means them (GlyphCoverage's exact
// table), so blocks never seam: top-left 1, top-right 2, bottom-left 4, bottom-right 8.
const BLOCKS = new Map([
  [' ', 0], [' ', 0], ['█', 15], ['▀', 3], ['▄', 12], ['▌', 5], ['▐', 10],
  ['▘', 1], ['▝', 2], ['▖', 4], ['▗', 8], ['▚', 9], ['▞', 6],
  ['▙', 13], ['▟', 14], ['▛', 7], ['▜', 11],
]);

// The shades, drawn by the shader rather than the font (see FRAGMENT's over): a font's own shade
// glyphs are dot patterns drawn for its own height, which a cell cuts off (a seam at every row) and
// whose dots don't fall on whole pixels. Their atlas texels hold only this level (alpha 16, 32, 48).
const SHADES = new Map([['░', 1], ['▒', 2], ['▓', 3]]);

// The columns a character draws over: blocks and shades are drawn here, in their own cell, however
// wide the font draws them.
const columnsOf = (char) => (BLOCKS.has(char) || SHADES.has(char) ? 1 : drawnColumns(char));

// A shade's dot in device px: a sixteenth of the cell's height, as the VGA's 8x16 cell has 16 rows of
// pixels, in whole pixels so every dot is the same.
const shadeDot = (ch) => Math.max(1, Math.round(ch / 16));

// A block character's mask (cw x ch, 0 or 255), or null for any other character.
export function blockMask(char, cw, ch) {
  const quadrants = BLOCKS.get(char);
  if (quadrants === undefined) return null;
  const mask = new Uint8Array(cw * ch);
  const hw = Math.floor(cw / 2), hh = Math.floor(ch / 2); // the left and top halves; the rest is right and bottom
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const bit = (x < hw ? 1 : 2) * (y < hh ? 1 : 4);
      if (quadrants & bit) mask[y * cw + x] = 255;
    }
  }
  return mask;
}

// The data textures' bytes for the first count cells: fg rgb + the glyph index's low byte, bg rgb
// + its high byte (glyphOf(cell): a wide character's lead and trail are its two halves). A missing cell (a grid between its resize and its render) is black on black.
export function packCells(cells, count, glyphOf, fg, bg) {
  for (let i = 0; i < count; i++) {
    const cell = cells[i], o = i * 4;
    if (!cell) {
      fg.fill(0, o, o + 4);
      bg.fill(0, o, o + 4);
      continue;
    }
    const g = glyphOf(cell);
    fg[o] = cell.fg.r; fg[o + 1] = cell.fg.g; fg[o + 2] = cell.fg.b; fg[o + 3] = g & 255;
    bg[o] = cell.bg.r; bg[o + 1] = cell.bg.g; bg[o + 2] = cell.bg.b; bg[o + 3] = g >> 8;
  }
}

// The spill textures' bytes (layoutSpills: for a cell an overflowing character draws over, that
// character's cell and which of its columns lands here): its fg rgb + the slice's glyph index low
// byte, and the high byte with a 255 "present" flag. sliceOf(cell, k): the glyph of column k.
export function packSpills(cells, spills, count, sliceOf, ov, ovHi) {
  for (let i = 0; i < count; i++) {
    const spill = spills[i], o = i * 4;
    if (!spill) {
      ov.fill(0, o, o + 4);
      ovHi.fill(0, o, o + 4);
      continue;
    }
    const source = cells[spill.from], g = sliceOf(source, spill.slice);
    ov[o] = source.fg.r; ov[o + 1] = source.fg.g; ov[o + 2] = source.fg.b; ov[o + 3] = g & 255;
    ovHi[o] = g >> 8; ovHi[o + 1] = 255; ovHi[o + 2] = 0; ovHi[o + 3] = 0;
  }
}

const VERTEX = `#version 300 es
void main() { // one triangle covering the viewport
  gl_Position = vec4(gl_VertexID == 1 ? 3. : -1., gl_VertexID == 2 ? 3. : -1., 0., 1.);
}`;

const FRAGMENT = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uFg, uBg, uAtlas, uOv, uOvHi;
uniform ivec2 uCell;        // cw, ch in device px
uniform ivec2 uOrigin;      // the window's top-left in the grid, in device px
uniform int uHeight;        // canvas height in device px
uniform int uAtlasCols;     // glyphs per atlas row
uniform int uDot;           // a shade's dot in device px (shadeDot)
out vec4 color;
ivec2 p;                    // this pixel, top-left origin
// An atlas texel over what's under it: ink in the character's color as much as its red says (alpha
// 1: the glyph's coverage there, anti-aliased), a color glyph's own color (alpha .5), a shade (alpha
// 16/255, 32/255 or 48/255: ░▒▓), or nothing (0).
vec3 over(vec4 t, vec3 ink, vec3 under) {
  int shade = t.a < .25 ? int(t.a * 255. + .5) / 16 : 0;
  if (shade > 0) {
    // CP437's shades in dots across the whole grid, so neighboring cells' dots line up: ░ a quarter
    // of the dots, ▒ a checkerboard, ▓ the inverse of ░.
    ivec2 d = (p + uOrigin) / uDot;
    bool quarter = d.y % 2 == 1 ? d.x % 4 == 0 : d.x % 4 == 2;
    bool on = shade == 1 ? quarter : shade == 2 ? (d.x + d.y) % 2 == 0 : !quarter;
    return on ? ink : under;
  }
  return t.a > .75 ? mix(under, ink, t.r) : t.a > .25 ? t.rgb : under;
}
void main() {
  p = ivec2(int(gl_FragCoord.x), uHeight - 1 - int(gl_FragCoord.y));
  ivec2 c = p / uCell;
  vec4 f = texelFetch(uFg, c, 0), b = texelFetch(uBg, c, 0);
  int g = int(f.a * 255. + .5) + 256 * int(b.a * 255. + .5);
  ivec2 l = p - c * uCell;
  vec4 ink = texelFetch(uAtlas, ivec2((g % uAtlasCols) * uCell.x + l.x, (g / uAtlasCols) * uCell.y + l.y), 0);
  // A spill: part of an overflowing character to the left, drawn on top of this cell (its character
  // and background), as a terminal draws it.
  vec4 o = texelFetch(uOv, c, 0), oh = texelFetch(uOvHi, c, 0);
  vec4 spill = vec4(0.);
  if (oh.g > .5) {
    int s = int(o.a * 255. + .5) + 256 * int(oh.r * 255. + .5);
    spill = texelFetch(uAtlas, ivec2((s % uAtlasCols) * uCell.x + l.x, (s / uAtlasCols) * uCell.y + l.y), 0);
  }
  color = vec4(over(spill, o.rgb, over(ink, f.rgb, b.rgb)), 1.);
}`;

export default class CellCanvas {
  canvas;
  #gl = null;
  #maxSide = Infinity; // the GPU's longest drawing buffer side
  #uniforms = null;
  #textures = null;     // [fg, bg, atlas, ov, ovHi], bound to texture units 0-4
  #allocated = false;   // the data textures have the grid's size
  #onRestored = null;
  #font = null;         // the font it draws in, or null for the display font (read when used)
  #advance = null;      // the font's character width in CSS px, measured by resize
  #geom = null;         // { cols, rows, cw, ch, scale }
  #fg = null;
  #bg = null;
  #ov = null;
  #ovHi = null;
  #glyphs = new Map();  // char -> atlas index
  #slices = new Map();  // char -> the atlas indexes of its columns (wide and overflowing characters)
  #atlas = new Uint8Array(0);
  #atlasRows = 0;
  #atlasDirty = true;
  #smooth = true;       // text anti-aliased (WorkspaceStore.smoothText)

  #onLost = (event) => event.preventDefault(); // so the context can be restored
  #onRestore = () => {
    this.#init();
    this.#dropAtlas();
    this.#onRestored?.();
  };

  // font: a font of its own ({ family, size, lineHeight }: a room's art in the host's), rather than
  // the display font.
  constructor(canvas, { onRestored, font = null } = {}) {
    this.canvas = canvas;
    this.#onRestored = onRestored;
    this.#font = font;
    this.#init();
    canvas.addEventListener('webglcontextlost', this.#onLost);
    canvas.addEventListener('webglcontextrestored', this.#onRestore);
  }

  // The cell size in CSS px, or null before the first resize.
  get metrics() {
    const g = this.#geom;
    return g ? { cellWidth: g.cw / g.scale, lineHeight: g.ch / g.scale } : null;
  }

  // Whether text is anti-aliased; changing it draws every glyph again.
  get smooth() {
    return this.#smooth;
  }

  set smooth(on) {
    if (on === this.#smooth) return;
    this.#smooth = on;
    this.#dropAtlas();
  }

  // The cell in CSS px at the display's full dpr (no cap), without touching the canvas: what a view
  // sizes its first window by, before resize has run.
  cellSize(dpr) {
    const { cellWidth, lineHeight } = cellGeometry(this.#advance ??= measureAdvance(this.#fontNow), dpr, false, this.#fontNow);
    return { cellWidth, lineHeight };
  }

  // Size the canvas for cols x rows cells (the window of the grid it draws) at the display's dpr;
  // true when anything changed.
  resize(cols, rows, dpr) {
    const font = this.#fontNow;
    if (this.#advance === null) this.#advance = measureAdvance(font);
    const scale = backingScale(cols * this.#advance, rows * font.size * font.lineHeight, dpr, this.#maxSide);
    const { cw, ch } = cellGeometry(this.#advance, scale, scale < dpr, font);
    const g = this.#geom;
    if (g && g.cols === cols && g.rows === rows && g.cw === cw && g.ch === ch && g.scale === scale) return false;
    const sameCell = g && g.cw === cw && g.ch === ch && g.scale === scale; // the window's size moves on every frame of a viewport resize

    this.canvas.width = cols * cw;
    this.canvas.height = rows * ch;
    this.canvas.style.width = `${cols * cw / scale}px`;
    this.canvas.style.height = `${rows * ch / scale}px`;
    this.#geom = { cols, rows, cw, ch, scale };
    this.#fg = new Uint8Array(cols * rows * 4);
    this.#bg = new Uint8Array(cols * rows * 4);
    this.#ov = new Uint8Array(cols * rows * 4);
    this.#ovHi = new Uint8Array(cols * rows * 4);
    this.#allocated = false;
    if (!sameCell) this.#dropAtlas();
    return true;
  }

  // The font changed (it finished loading): glyphs and possibly the cell width are measured again.
  invalidate() {
    this.#advance = null;
    this.#dropAtlas();
  }

  // Draw the canvas's cells from (col, row). cells: the whole grid's, row-major, cols x rows (the
  // grid's size, the canvas's own by default). Cells of another size, or a window that doesn't fit in
  // the grid (the grid changed and its render hasn't landed) draw nothing, leaving the canvas as it was.
  draw(cells, { cols: gridCols = this.#geom?.cols, rows: gridRows = this.#geom?.rows, col = 0, row = 0 } = {}) {
    const gl = this.#gl, g = this.#geom;
    if (!g || gl.isContextLost() || cells.length !== gridCols * gridRows) return;
    if (col < 0 || row < 0 || col + g.cols > gridCols || row + g.rows > gridRows) return;
    if (!this.#glyphs.size) this.#glyphOf({ char: ' ' }); // glyph 0: what a missing cell draws
    // The window's whole rows get their spills laid out, so a character left of the window still
    // spills into it; then the window takes its columns of the cells and the spills.
    const rowCells = cells.slice(row * gridCols, (row + g.rows) * gridCols);
    const rowSpills = layoutSpills(rowCells, gridCols, (cell) => columnsOf(cell.char));
    const count = g.cols * g.rows, windowCells = new Array(count), windowSpills = new Array(count);
    for (let y = 0; y < g.rows; y++) {
      for (let x = 0; x < g.cols; x++) {
        windowCells[y * g.cols + x] = rowCells[y * gridCols + col + x];
        windowSpills[y * g.cols + x] = rowSpills[y * gridCols + col + x];
      }
    }
    packCells(windowCells, count, (cell) => this.#glyphOf(cell), this.#fg, this.#bg);
    packSpills(rowCells, windowSpills, count, (cell, k) => this.#slicesOf(cell.char)[k], this.#ov, this.#ovHi);

    const [fgTexture, bgTexture, atlasTexture, ovTexture, ovHiTexture] = this.#textures;
    for (const [unit, texture, data] of [[0, fgTexture, this.#fg], [1, bgTexture, this.#bg], [3, ovTexture, this.#ov], [4, ovHiTexture, this.#ovHi]]) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (this.#allocated) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, g.cols, g.rows, gl.RGBA, gl.UNSIGNED_BYTE, data);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, g.cols, g.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
    this.#allocated = true;
    if (this.#atlasDirty) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, ATLAS_COLS * g.cw, this.#atlasRows * g.ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.#atlas);
      this.#atlasDirty = false;
    }

    gl.uniform2i(this.#uniforms.cell, g.cw, g.ch);
    gl.uniform2i(this.#uniforms.origin, col * g.cw, row * g.ch);
    gl.uniform1i(this.#uniforms.dot, shadeDot(g.ch));
    gl.uniform1i(this.#uniforms.height, this.canvas.height);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Release the WebGL context: browsers cap live contexts, and the ANSI view remounts on tab switches.
  destroy() {
    this.canvas.removeEventListener('webglcontextlost', this.#onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.#onRestore);
    this.#gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }

  get #fontNow() {
    return this.#font ?? DISPLAY_FONT;
  }

  // The context, program and textures (again after a context loss).
  #init() {
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.#gl = gl;
    this.#maxSide = Math.min(...gl.getParameter(gl.MAX_VIEWPORT_DIMS), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));

    const program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.#textures = [0, 1, 2, 3, 4].map((unit) => {
      const texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      for (const filter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, filter, gl.NEAREST);
      for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, wrap, gl.CLAMP_TO_EDGE);
      return texture;
    });
    const at = (name) => gl.getUniformLocation(program, name);
    gl.uniform1i(at('uFg'), 0);
    gl.uniform1i(at('uBg'), 1);
    gl.uniform1i(at('uAtlas'), 2);
    gl.uniform1i(at('uOv'), 3);
    gl.uniform1i(at('uOvHi'), 4);
    gl.uniform1i(at('uAtlasCols'), ATLAS_COLS);
    this.#uniforms = { cell: at('uCell'), origin: at('uOrigin'), height: at('uHeight'), dot: at('uDot') };
    this.#allocated = false;
  }

  #dropAtlas() {
    this.#glyphs.clear();
    this.#slices.clear();
    this.#atlas = new Uint8Array(0);
    this.#atlasRows = 0;
    this.#atlasDirty = true;
  }

  // A cell's atlas index, rasterizing its character the first time. A character covering more than
  // one column (a wide one, or one drawing wider than its columns) is drawn once at its full width and
  // cut into a glyph per column (#slicesOf); a cell shows its own column's, a wide character's trail
  // the second.
  #glyphOf({ char, wide }) {
    if (wide || columnsOf(char) > 1) return this.#slicesOf(char)[wide === 'trail' ? 1 : 0];
    const index = this.#glyphs.get(char);
    if (index !== undefined) return index;
    const { cw, ch } = this.#geom;
    const block = blockMask(char, cw, ch), shade = SHADES.get(char);
    if (shade) return this.#store(char, shadeTexels(shade, cw, ch));
    return this.#store(char, block ? inkTexels(block) : this.#rasterize(char, 1));
  }

  // A character's shape at its full width (the columns it draws over), cut into one glyph per column.
  #slicesOf(char) {
    let indexes = this.#slices.get(char);
    if (indexes) return indexes;
    const { cw, ch } = this.#geom, span = Math.max(columnsOf(char), 1);
    const whole = this.#rasterize(char, span);
    indexes = Array.from({ length: span }, (_, k) => {
      const texels = new Uint8Array(cw * ch * 4), row = span * cw * 4;
      for (let y = 0; y < ch; y++) texels.set(whole.subarray(y * row + k * cw * 4, y * row + (k + 1) * cw * 4), y * cw * 4);
      return this.#store(`${char}\u0000${k}`, texels);
    });
    this.#slices.set(char, indexes);
    return indexes;
  }

  // Put a glyph's cw x ch RGBA texels in the next atlas slot (growing the atlas a row at a time); its index.
  #store(key, texels) {
    const { cw, ch } = this.#geom;
    const index = this.#glyphs.size;
    this.#glyphs.set(key, index);
    const row = Math.floor(index / ATLAS_COLS), width = ATLAS_COLS * cw * 4;
    if (row >= this.#atlasRows) {
      const grown = new Uint8Array(width * (row + 1) * ch);
      grown.set(this.#atlas);
      this.#atlas = grown;
      this.#atlasRows = row + 1;
    }
    const x0 = (index % ATLAS_COLS) * cw * 4;
    for (let y = 0; y < ch; y++) this.#atlas.set(texels.subarray(y * cw * 4, (y + 1) * cw * 4), (row * ch + y) * width + x0);
    this.#atlasDirty = true;
    return index;
  }

  // A character in its font across cells cells (1, or 2 for a wide one), anti-aliased or
  // sharp (displayFonts.drawGlyph). Its atlas texels: ink (alpha 255, its coverage in red: how much
  // of the cell's fg is blended in), or for a color glyph (an emoji: drawn in its own colors,
  // whatever the fill says) its color with alpha 128 where it's over half covered.
  #rasterize(char, cells) {
    const { ch, scale } = this.#geom, cw = this.#geom.cw * cells;
    const data = drawGlyph(char, cw, ch, scale, '#f00', this.#smooth, this.#fontNow);
    let color = false; // any inked pixel that isn't the fillStyle's red
    for (let i = 0; i < data.length && !color; i += 4) color = data[i + 3] > 127 && (data[i] < 224 || data[i + 1] > 31 || data[i + 2] > 31);
    const texels = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i += 4) {
      if (color) {
        if (data[i + 3] > 127) texels.set([data[i], data[i + 1], data[i + 2], 128], i);
      } else if (data[i + 3]) {
        texels[i] = data[i + 3];
        texels[i + 3] = 255;
      }
    }
    return texels;
  }
}

// A shade's atlas texels: its level (1 ░, 2 ▒, 3 ▓) in every one, which the shader draws.
function shadeTexels(level, cw, ch) {
  const texels = new Uint8Array(cw * ch * 4);
  for (let i = 3; i < texels.length; i += 4) texels[i] = level * 16;
  return texels;
}

// A mask's (0 or 255) atlas texels: ink, fully the cell's fg, where it's set.
function inkTexels(mask) {
  const texels = new Uint8Array(mask.length * 4);
  for (let i = 0; i < mask.length; i++) texels[i * 4] = texels[i * 4 + 3] = mask[i];
  return texels;
}

// A font's character width in CSS px.
function measureAdvance(font) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = displayFontCss(font);
  return ctx.measureText('M').width;
}
