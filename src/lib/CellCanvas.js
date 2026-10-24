/**
 * The ANSI view's cells drawn on a <canvas> with WebGL2, aliased like the DOM view's text: every
 * device pixel is exactly its cell's fg or bg. One full-screen pass reads each pixel's cell from
 * two cols x rows data textures (fg rgb + glyph index low byte, bg rgb + high byte) and its ink
 * from an atlas of 0/255 glyph masks, so a whole 30k-cell grid redraws in a few milliseconds and
 * every draw is a full redraw. (fillText anti-aliases; Path2D masks, a CPU blend and per-cell
 * tinting were all far slower.)
 *
 * Cells snap to whole device pixels at a backing scale capped to stay under the browsers' canvas
 * limits; metrics is the cell size in CSS px that the editor's overlays measure with.
 */
import { DISPLAY_FONT, DISPLAY_FONT_CSS } from './GlyphCoverage.js';

// Safari refuses 2D canvases of 16,777,216 pixels or more, and WebGL drawing buffers past the
// browser's limits are silently shrunk.
export const MAX_BACKING_AREA = 16_000_000;
const ATLAS_COLS = 64; // glyphs per atlas row

// Device pixels per CSS pixel: the display's, or less when a grid that big would pass the cap.
export function backingScale(cssWidth, cssHeight, dpr) {
  return Math.min(dpr, Math.sqrt(MAX_BACKING_AREA / (cssWidth * cssHeight)));
}

// A cell in whole device pixels (an even height, so the two halves match, as GlyphCoverage
// rasterizes) and in CSS px. advance: the font's character width at its CSS size.
export function cellGeometry(advance, scale) {
  const cw = Math.round(advance * scale);
  const ch = Math.round(DISPLAY_FONT.size * DISPLAY_FONT.lineHeight * scale / 2) * 2;
  return { cw, ch, cellWidth: cw / scale, lineHeight: ch / scale };
}

// Block elements as exact quadrants, the way the cell model means them (GlyphCoverage's exact
// table), so blocks never seam: top-left 1, top-right 2, bottom-left 4, bottom-right 8.
const BLOCKS = new Map([
  [' ', 0], [' ', 0], ['█', 15], ['▀', 3], ['▄', 12], ['▌', 5], ['▐', 10],
  ['▘', 1], ['▝', 2], ['▖', 4], ['▗', 8], ['▚', 9], ['▞', 6],
  ['▙', 13], ['▟', 14], ['▛', 7], ['▜', 11],
]);

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

const VERTEX = `#version 300 es
void main() { // one triangle covering the viewport
  gl_Position = vec4(gl_VertexID == 1 ? 3. : -1., gl_VertexID == 2 ? 3. : -1., 0., 1.);
}`;

const FRAGMENT = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uFg, uBg, uAtlas;
uniform ivec2 uCell;        // cw, ch in device px
uniform int uHeight;        // canvas height in device px
uniform int uAtlasCols;     // glyphs per atlas row
out vec4 color;
void main() {
  ivec2 p = ivec2(int(gl_FragCoord.x), uHeight - 1 - int(gl_FragCoord.y)); // top-left origin
  ivec2 c = p / uCell;
  vec4 f = texelFetch(uFg, c, 0), b = texelFetch(uBg, c, 0);
  int g = int(f.a * 255. + .5) + 256 * int(b.a * 255. + .5);
  ivec2 l = p - c * uCell;
  float ink = texelFetch(uAtlas, ivec2((g % uAtlasCols) * uCell.x + l.x, (g / uAtlasCols) * uCell.y + l.y), 0).r;
  color = vec4(ink > .5 ? f.rgb : b.rgb, 1.);
}`;

export default class CellCanvas {
  canvas;
  #gl = null;
  #uniforms = null;
  #textures = null;     // [fg, bg, atlas], bound to texture units 0, 1, 2
  #allocated = false;   // the data textures have the grid's size
  #onRestored = null;
  #advance = null;      // the font's character width in CSS px, measured by resize
  #geom = null;         // { cols, rows, cw, ch, scale }
  #fg = null;
  #bg = null;
  #glyphs = new Map();  // char -> atlas index
  #atlas = new Uint8Array(0);
  #atlasRows = 0;
  #atlasDirty = true;
  #scratch = null;      // glyph rasterizing

  #onLost = (event) => event.preventDefault(); // so the context can be restored
  #onRestore = () => {
    this.#init();
    this.#dropAtlas();
    this.#onRestored?.();
  };

  constructor(canvas, { onRestored } = {}) {
    this.canvas = canvas;
    this.#onRestored = onRestored;
    this.#init();
    canvas.addEventListener('webglcontextlost', this.#onLost);
    canvas.addEventListener('webglcontextrestored', this.#onRestore);
  }

  // The cell size in CSS px, or null before the first resize.
  get metrics() {
    const g = this.#geom;
    return g ? { cellWidth: g.cw / g.scale, lineHeight: g.ch / g.scale } : null;
  }

  // Size the canvas for cols x rows cells at the display's dpr; true when anything changed.
  resize(cols, rows, dpr) {
    if (this.#advance === null) this.#advance = measureAdvance();
    const scale = backingScale(cols * this.#advance, rows * DISPLAY_FONT.size * DISPLAY_FONT.lineHeight, dpr);
    const { cw, ch } = cellGeometry(this.#advance, scale);
    const g = this.#geom;
    if (g && g.cols === cols && g.rows === rows && g.cw === cw && g.ch === ch && g.scale === scale) return false;

    this.canvas.width = cols * cw;
    this.canvas.height = rows * ch;
    this.canvas.style.width = `${cols * cw / scale}px`;
    this.canvas.style.height = `${rows * ch / scale}px`;
    this.#geom = { cols, rows, cw, ch, scale };
    this.#fg = new Uint8Array(cols * rows * 4);
    this.#bg = new Uint8Array(cols * rows * 4);
    this.#allocated = false;
    this.#dropAtlas();
    return true;
  }

  // The font changed (it finished loading): glyphs and possibly the cell width are measured again.
  invalidate() {
    this.#advance = null;
    this.#dropAtlas();
  }

  // Draw every cell. cells: the grid's, row-major; a cells array of another size (the grid changed
  // and its render hasn't landed) draws nothing, leaving the canvas as its resize cleared it.
  draw(cells) {
    const gl = this.#gl, g = this.#geom;
    if (!g || gl.isContextLost() || cells.length !== g.cols * g.rows) return;
    if (!this.#glyphs.size) this.#glyphOf({ char: ' ' }); // glyph 0: what a missing cell draws
    packCells(cells, g.cols * g.rows, (cell) => this.#glyphOf(cell), this.#fg, this.#bg);

    const [fgTexture, bgTexture, atlasTexture] = this.#textures;
    for (const [unit, texture, data] of [[0, fgTexture, this.#fg], [1, bgTexture, this.#bg]]) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (this.#allocated) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, g.cols, g.rows, gl.RGBA, gl.UNSIGNED_BYTE, data);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, g.cols, g.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
    this.#allocated = true;
    if (this.#atlasDirty) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, ATLAS_COLS * g.cw, this.#atlasRows * g.ch, 0, gl.RED, gl.UNSIGNED_BYTE, this.#atlas);
      this.#atlasDirty = false;
    }

    gl.uniform2i(this.#uniforms.cell, g.cw, g.ch);
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

  // The context, program and textures (again after a context loss).
  #init() {
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.#gl = gl;

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
    this.#textures = [0, 1, 2].map((unit) => {
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
    gl.uniform1i(at('uAtlasCols'), ATLAS_COLS);
    this.#uniforms = { cell: at('uCell'), height: at('uHeight') };
    this.#allocated = false;
  }

  #dropAtlas() {
    this.#glyphs.clear();
    this.#atlas = new Uint8Array(0);
    this.#atlasRows = 0;
    this.#atlasDirty = true;
  }

  // A cell's atlas index, rasterizing its character the first time. A wide character is drawn
  // once across two cells and kept as two glyphs, its lead's half and its trail's.
  #glyphOf({ char, wide }) {
    const key = wide ? `${char}\u0000${wide}` : char;
    const index = this.#glyphs.get(key);
    if (index !== undefined) return index;
    const { cw, ch } = this.#geom;
    if (!wide) return this.#store(key, blockMask(char, cw, ch) ?? this.#rasterize(char, 1));

    const both = this.#rasterize(char, 2), half = (x0) => {
      const mask = new Uint8Array(cw * ch);
      for (let y = 0; y < ch; y++) mask.set(both.subarray(y * 2 * cw + x0, y * 2 * cw + x0 + cw), y * cw);
      return mask;
    };
    const lead = this.#store(`${char}\u0000lead`, half(0));
    const trail = this.#store(`${char}\u0000trail`, half(cw));
    return wide === 'lead' ? lead : trail;
  }

  // Put a cw x ch mask in the next atlas slot (growing the atlas a row at a time); its index.
  #store(key, mask) {
    const { cw, ch } = this.#geom;
    const index = this.#glyphs.size;
    this.#glyphs.set(key, index);
    const row = Math.floor(index / ATLAS_COLS), width = ATLAS_COLS * cw;
    if (row >= this.#atlasRows) {
      const grown = new Uint8Array(width * (row + 1) * ch);
      grown.set(this.#atlas);
      this.#atlas = grown;
      this.#atlasRows = row + 1;
    }
    const x0 = (index % ATLAS_COLS) * cw;
    for (let y = 0; y < ch; y++) this.#atlas.set(mask.subarray(y * cw, (y + 1) * cw), (row * ch + y) * width + x0);
    this.#atlasDirty = true;
    return index;
  }

  // A character in the display font across cells cells (1, or 2 for a wide one), as GlyphCoverage
  // rasterizes it: centred in the line, squeezed into its cells when wider, inked where alpha > 127.
  #rasterize(char, cells) {
    const { ch, scale } = this.#geom, cw = this.#geom.cw * cells;
    this.#scratch ??= document.createElement('canvas');
    if (this.#scratch.width !== cw || this.#scratch.height !== ch) {
      this.#scratch.width = cw;
      this.#scratch.height = ch;
    }
    const ctx = this.#scratch.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, cw, ch);
    ctx.font = `${DISPLAY_FONT.size * scale}px ${DISPLAY_FONT.family}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(char, 0, ch / 2, cw);
    const { data } = ctx.getImageData(0, 0, cw, ch);
    const mask = new Uint8Array(cw * ch);
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 127 ? 255 : 0;
    return mask;
  }
}

// The display font's character width in CSS px.
function measureAdvance() {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = DISPLAY_FONT_CSS;
  return ctx.measureText('M').width;
}
