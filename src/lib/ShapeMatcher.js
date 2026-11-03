/**
 * Best match and By shape on the GPU (WebGL2): CharResolver's bestMatcher and shapeMatcher worked out
 * in a shader, one fragment a cell, so that with no error carried from cell to cell (Dither at 0 or
 * Bayer) a whole grid is matched in milliseconds. The JavaScript is the reference: the same steps,
 * the same rounding and the same tie order (the solid, then the glyphs in order, then the palette's
 * order), in 32-bit floats, so a near-tie can tip the other way now and then.
 *
 * Its own WebGL2 context, made the first time it's asked for (WebGLProcessor's is WebGL1). The
 * samples (bytes), the glyphs' masks or inks, the palette and Best match's mixes go up as textures;
 * each cell comes back as two pixels, [fg, glyph] and [bg, 0], fg and bg its palette indexes with a
 * palette, else their colors; glyph 255 is the solid.
 */
import { bayerNudge, nudgeSpread } from './Dither.js';
import { colorOf, ASCII_BG } from './Cells.js';
import { cellRange } from './CharResolver.js';

const MAX_GLYPHS = 255; // a glyph's index is a byte, 255 the solid
const MAX_COLORS = 256;
const MAX_MIXES = 1 << 16; // Best match's flat mixes past that (a set of many shades on VGA): left to the JavaScript
const MIX_ROW = 1024;      // mixes a row of their textures

const VERTEX = `#version 300 es
void main() { gl_Position = vec4(vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) * 2.0 - 1.0, 0, 1); }`;

// What both matchers share: the cell's samples, Bayer's nudge, the palette and how two colors mix
// (CharResolver's mixChannel).
const COMMON = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform usampler2D uSamples; // the band's samples (RGBA bytes), its first cell's at (0, 0)
uniform ivec2 uFirst;        // that cell's column and line in the grid
uniform float uNudge[16];    // Bayer's nudge at each place in its 4 x 4 pattern
uniform usampler2D uPalette; // uColors x 1 (RGBA bytes); none: 0
uniform int uColors;
uniform float uLight;        // Pattern light
uniform float uTolerance;    // Solids'
layout(location = 0) out vec4 outFg;
layout(location = 1) out vec4 outBg;
const float INF = 1e38;

ivec2 local() { return ivec2(gl_FragCoord.xy); }
float nudge() { ivec2 c = uFirst + local(); return uNudge[(c.y & 3) * 4 + (c.x & 3)]; }
vec3 sampleAt(ivec2 p, float n) { return clamp(vec3(texelFetch(uSamples, p, 0).rgb) + n, 0.0, 255.0); }

float toLinear(float v) { v /= 255.0; return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4); }
vec3 toLinear(vec3 v) { return vec3(toLinear(v.r), toLinear(v.g), toLinear(v.b)); }
float toSrgb(float l) { return 255.0 * (l <= 0.0031308 ? l * 12.92 : 1.055 * pow(l, 1.0 / 2.4) - 0.055); }
vec3 toSrgb(vec3 l) { return vec3(toSrgb(l.r), toSrgb(l.g), toSrgb(l.b)); }

// bg mixed with fg by ink, lb and lf their linear light.
vec3 mixed(vec3 bg, vec3 fg, vec3 lb, vec3 lf, float ink) {
  if (ink <= 0.0) return bg;
  if (ink >= 1.0) return fg;
  vec3 plain = bg + (fg - bg) * ink;
  if (uLight == 0.0) return plain;
  return plain + (toSrgb(lb * (1.0 - ink) + lf * ink) - plain) * uLight;
}

vec3 paletteColor(int i) { return vec3(texelFetch(uPalette, ivec2(i, 0), 0).rgb); }

// v rounded to bytes into c and, with a palette, its nearest color (the first of a tie): its index, else -1.
int snap(vec3 v, out vec3 c) {
  c = floor(clamp(v, 0.0, 255.0) + 0.5);
  if (uColors == 0) return -1;
  int best = 0;
  float least = INF;
  for (int i = 0; i < uColors; i++) {
    vec3 d = paletteColor(i) - c;
    float e = dot(d, d);
    if (e < least) { least = e; best = i; }
  }
  c = paletteColor(best);
  return best;
}

// A byte (a color channel, a palette index, a glyph) as it's read back from an 8-bit target. A
// quarter over it: a driver may take either integer next to v / 255 x 255, which in 32-bit floats can
// fall just under v, and v + 0.25 rounds and truncates to v alike.
vec3 byte(vec3 v) { return (v + 0.25) / 255.0; }
// A color as it's read back: its palette index, or itself.
vec3 code(vec3 c, int i) { return byte(i < 0 ? c : vec3(float(i), 0, 0)); }
void put(vec3 fg, int fi, vec3 bg, int bi, int glyph) {
  outFg = vec4(code(fg, fi), byte(vec3(glyph)).x);
  outBg = vec4(code(bg, bi), 0);
}
`;

// By shape (shapeMatcher): 4 x 8 samples a cell against each glyph's mask.
const SHAPE = `${COMMON}
uniform sampler2D uMasks; // a glyph's mask a row (32 x uGlyphs)
uniform int uGlyphs;
uniform int uStyle;       // 0 ANSI, 1 Color ASCII, 2 Monochrome ASCII
const int N = 32;

void main() {
  ivec2 at = local() * ivec2(4, 8);
  float n = nudge();
  vec3 s[N];
  vec3 sum = vec3(0);
  for (int i = 0; i < N; i++) { s[i] = sampleAt(at + ivec2(i % 4, i / 4), n); sum += s[i]; }
  float m[N];

  if (uStyle == 2) { // against the samples' brightness, white on black
    float lum[N];
    for (int i = 0; i < N; i++) lum[i] = floor(0.2126 * s[i].r + 0.7152 * s[i].g + 0.0722 * s[i].b + 0.5);
    float best = INF;
    int won = 0;
    for (int g = 0; g < uGlyphs; g++) {
      float e = 0.0;
      for (int i = 0; i < N; i++) {
        float ink = texelFetch(uMasks, ivec2(i, g), 0).r;
        float gray = ink <= 0.0 ? 0.0 : ink >= 1.0 ? 255.0 : 255.0 * ink + (toSrgb(ink) - 255.0 * ink) * uLight;
        e += (lum[i] - gray) * (lum[i] - gray);
      }
      if (e < best) { best = e; won = g; }
    }
    put(vec3(255), -1, vec3(0), -1, won);
    return;
  }

  bool ansi = uStyle == 0;
  vec3 mean = sum / float(N), solid = vec3(0);
  int solidI = -1;
  float best = INF;
  if (ansi) { // a glyph has to come closer than the solid less Solids' tolerance
    solidI = snap(mean, solid);
    float e = 0.0;
    for (int i = 0; i < N; i++) { vec3 d = solid - s[i]; e += dot(d, d); }
    best = e - uTolerance;
  }
  int won = -1, wonF = -1, wonB = -1;
  vec3 wonFg = vec3(0), wonBg = vec3(0);
  for (int g = 0; g < uGlyphs; g++) {
    vec3 f = vec3(0), b = vec3(0);
    float m1 = 0.0, m0 = 0.0, m2 = 0.0;
    for (int i = 0; i < N; i++) {
      float k = texelFetch(uMasks, ivec2(i, g), 0).r;
      m[i] = k;
      f += k * s[i]; b += (1.0 - k) * s[i];
      m1 += k; m0 += 1.0 - k; m2 += k * k;
    }
    vec3 fg, bg = vec3(0);
    int fi, bi = -1;
    if (ansi) {
      fi = snap(m1 != 0.0 ? f / m1 : mean, fg);
      bi = snap(m0 != 0.0 ? b / m0 : mean, bg);
    } else fi = snap(m2 != 0.0 ? f / m2 : vec3(0), fg);
    vec3 lf = toLinear(fg), lb = toLinear(bg);
    float e = 0.0;
    for (int i = 0; i < N; i++) { vec3 d = mixed(bg, fg, lb, lf, m[i]) - s[i]; e += dot(d, d); }
    if (e < best) { best = e; won = g; wonF = fi; wonB = bi; wonFg = fg; wonBg = bg; }
  }
  if (won < 0) put(solid, solidI, solid, solidI, 255);
  else put(wonFg, wonF, wonBg, wonB, won);
}
`;

// Best match (bestMatcher): a cell's two halves against the flat glyphs' mixes (the nearest to the
// middle of the halves' mean's 15-bit box: uMixLut) and the two-ink glyphs, then the solid.
const BEST = `${COMMON}
uniform sampler2D uInks;    // the two-ink glyphs: (top ink, bottom ink, glyph, a half each) a texel
uniform int uTwoInk;
uniform bool uMixes;
uniform usampler2D uMixLut; // each 15-bit box's nearest mix (256 x 128)
uniform sampler2D uMixRgb;  // the mixes' colors, ${MIX_ROW} a row
uniform usampler2D uMixOf;  // their glyph, fg and bg

float halvesErr(vec3 v, vec3 t, vec3 b) { vec3 p = v - t, q = v - b; return dot(p, p) + dot(q, q); }

// The fg and bg that show t over ink a and b over ink c (CharResolver's fit).
void fit(vec3 t, vec3 b, float a, float c, out vec3 fg, out vec3 bg) {
  vec3 d = (t - b) / (a - c), x = t - d * a, y = x + d;
  if (uLight != 0.0) {
    vec3 lt = toLinear(t), dl = (lt - toLinear(b)) / (a - c), xl = lt - dl * a;
    x += (toSrgb(clamp(xl, 0.0, 1.0)) - x) * uLight;
    y += (toSrgb(clamp(xl + dl, 0.0, 1.0)) - y) * uLight;
  }
  bg = clamp(x, 0.0, 255.0); fg = clamp(y, 0.0, 255.0);
}

void main() {
  ivec2 at = local() * ivec2(1, 2);
  float n = nudge();
  vec3 t = sampleAt(at, n), b = sampleAt(at + ivec2(0, 1), n), mean = (t + b) / 2.0;
  float bestErr = INF;
  int bestGi = 1 << 30, bestF = -1, bestB = -1;
  vec3 bestFg = vec3(0), bestBg = vec3(0);
  if (uMixes) {
    ivec3 r = ivec3(floor(mean + 0.5)) >> 3;
    int key = r.x << 10 | r.y << 5 | r.z;
    int mix = int(texelFetch(uMixLut, ivec2(key & 255, key >> 8), 0).r);
    ivec2 p = ivec2(mix % ${MIX_ROW}, mix / ${MIX_ROW});
    uvec4 of = texelFetch(uMixOf, p, 0);
    bestErr = halvesErr(texelFetch(uMixRgb, p, 0).rgb, t, b);
    bestGi = int(of.x); bestF = int(of.y); bestB = int(of.z);
  }
  vec3 nt, nb;
  int ti = -2, bi;
  for (int j = 0; j < uTwoInk; j++) {
    vec4 g = texelFetch(uInks, ivec2(j, 0), 0);
    float a = g.x, c = g.y;
    vec3 fg, bg;
    int fI, bI;
    if (uColors > 0 && g.w > 0.5) { // ▄ ▀: each half snapped on its own
      if (ti == -2) { ti = snap(t, nt); bi = snap(b, nb); }
      if (a != 0.0) { fg = nt; fI = ti; bg = nb; bI = bi; } else { fg = nb; fI = bi; bg = nt; bI = ti; }
    } else {
      vec3 f, k;
      fit(t, b, a, c, f, k);
      fI = snap(f, fg); bI = snap(k, bg);
    }
    vec3 lf = toLinear(fg), lb = toLinear(bg), top = mixed(bg, fg, lb, lf, a) - t, bottom = mixed(bg, fg, lb, lf, c) - b;
    float e = dot(top, top) + dot(bottom, bottom);
    int gi = int(g.z);
    if (e < bestErr || (e == bestErr && gi < bestGi)) { bestErr = e; bestGi = gi; bestF = fI; bestB = bI; bestFg = fg; bestBg = bg; }
  }
  vec3 solid;
  int si = snap(mean, solid);
  if (halvesErr(solid, t, b) <= bestErr + uTolerance) put(solid, si, solid, si, 255);
  else put(bestFg, bestF, bestBg, bestB, bestGi);
}
`;

// Each 15-bit box's nearest mix, worked out for the middle of the box (CharResolver's nearestMix).
const MIX_LUT = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uMixRgb;
uniform int uMixCount;
out uint outMix;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int key = p.y * 256 + p.x;
  vec3 c = vec3((key >> 10) << 3, ((key >> 5) & 31) << 3, (key & 31) << 3) + 4.0;
  float best = 1e38;
  int m = 0;
  for (int i = 0; i < uMixCount; i++) {
    vec3 d = texelFetch(uMixRgb, ivec2(i % ${MIX_ROW}, i / ${MIX_ROW}), 0).rgb - c;
    float e = dot(d, d);
    if (e < best) { best = e; m = i; }
  }
  outMix = uint(m);
}
`;

export default class ShapeMatcher {
  static #made = false;
  static #one = null;

  // The one there is, made the first time it's asked for; null without WebGL2 (or when its shaders
  // don't compile there: the JavaScript matches then).
  static shared() {
    if (!ShapeMatcher.#made) {
      ShapeMatcher.#made = true;
      const gl = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('webgl2', { antialias: false, depth: false, stencil: false });
      try {
        ShapeMatcher.#one = gl && new ShapeMatcher(gl);
      } catch (error) {
        console.warn(error);
      }
    }
    return ShapeMatcher.#one;
  }

  static available() {
    return !!ShapeMatcher.shared();
  }

  #gl;
  #programs;
  #textures = {};
  #frame = null;  // { fb, w, h, fg, bg }: what the cells are drawn into
  #palette = null; // the palette in uPalette
  #core = null;    // the matcher core whose glyphs (and mixes) are in their textures
  #mixes = 0;      // how many of them

  constructor(gl) {
    this.#gl = gl;
    this.maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.#programs = { shape: this.#compile('shape', SHAPE), best: this.#compile('best', BEST), mixLut: this.#compile('mixLut', MIX_LUT) };
  }

  // Cells ({ char, fg, bg }) as CharResolver's resolveShapes and resolveGrid make them, for matcher
  // (shapeMatcher's or bestMatcher's) over samples (RGBA bytes: its SAMPLES or 1 x 2 a cell, cols of
  // them wide, at least lines tall), Bayer's nudge by strength (any other style isn't the GPU's), with
  // area only the cells over it (into cells, the rest left as they are); { cells, carried: null }.
  // Null when it can't (match).
  resolve(samples, cols, lines, matcher, { strength = 0, style, area = null, cells = new Array(cols * lines) } = {}) {
    const out = this.match(samples, cols, lines, matcher, { strength, style, area });
    if (!out) return null;
    const { core } = matcher, palette = core.palette, { c0, c1, l0 } = out, w = c1 - c0;
    const colorAt = (d, o) => (palette ? palette[d[o]] : colorOf({ r: d[o], g: d[o + 1], b: d[o + 2] }));
    const mono = core.kind === 'shape' && core.style === 'ascii', ascii = core.kind === 'shape' && core.style !== 'ansi';
    for (let j = 0, o = 0; j < out.fg.length / 4; j++, o += 4) {
      const i = (l0 + Math.floor(j / w)) * cols + c0 + (j % w), glyph = out.fg[o + 3];
      if (mono) cells[i] = { char: core.glyphs[glyph].char, fg: core.white, bg: ASCII_BG };
      else if (glyph === 255) {
        const solid = colorAt(out.fg, o);
        cells[i] = { char: core.solidChar, fg: solid, bg: solid };
      } else cells[i] = { char: core.glyphs[glyph].char, fg: colorAt(out.fg, o), bg: ascii ? ASCII_BG : colorAt(out.bg, o) };
    }
    return { cells, carried: null };
  }

  // The area's cells as they're read back: fg [r, g, b, glyph] and bg [r, g, b, 0] a cell (a palette
  // index in r with a palette), row-major from its first (c0, l0); { fg, bg, c0, c1, l0, l1 }. Null
  // when it can't: Floyd–Steinberg, more than 255 glyphs or 256 colors, too many mixes, a grid wider
  // than a texture, or the context lost.
  match(samples, cols, lines, { core, tolerance }, { strength = 0, style, area = null } = {}) {
    const gl = this.#gl, best = core.kind === 'best', palette = core.palette;
    const [sw, sh] = best ? [1, 2] : [4, 8];
    if (strength > 0 && style !== 'bayer') return null;
    if (core.glyphs.length > MAX_GLYPHS || palette?.length > MAX_COLORS || cols * sw > this.maxSize || gl.isContextLost()) return null;
    if (best && core.table?.glyph.length > MAX_MIXES) return null;
    const { c0, c1, l0, l1 } = cellRange(area, cols, lines), w = c1 - c0, h = Math.max(0, l1 - l0);
    const fg = new Uint8Array(w * h * 4), bg = new Uint8Array(w * h * 4);
    if (!w || !h) return { fg, bg, c0, c1, l0, l1 };

    // Everything made and uploaded (in texture unit 0) before the units are bound, in bands of lines a texture can hold.
    const band = Math.max(1, Math.min(h, Math.floor(this.maxSize / sh)));
    this.#frameOf(w, band);
    if (!this.#textures.samples) this.#texture('samples', gl.RGBA8UI, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, 1, 1, new Uint8Array(4));
    this.#upload(core);
    const program = this.#programs[best ? 'best' : 'shape'];
    gl.useProgram(program);
    const spread = nudgeSpread(palette), nudges = new Float32Array(16);
    for (let i = 0; i < 16; i++) nudges[i] = strength > 0 ? bayerNudge(i & 3, i >> 2, spread, strength) : 0;
    const u = (name) => gl.getUniformLocation(program, name);
    gl.uniform1fv(u('uNudge'), nudges);
    gl.uniform1i(u('uColors'), palette?.length ?? 0);
    gl.uniform1f(u('uLight'), core.light);
    gl.uniform1f(u('uTolerance'), tolerance ?? 0);
    const units = best ? { uSamples: 0, uPalette: 1, uInks: 2, uMixLut: 3, uMixRgb: 4, uMixOf: 5 } : { uSamples: 0, uPalette: 1, uMasks: 2 };
    for (const [name, unit] of Object.entries(units)) gl.uniform1i(u(name), unit);
    this.#bind(1, this.#textures.palette);
    if (best) {
      gl.uniform1i(u('uTwoInk'), core.twoInk.length);
      gl.uniform1i(u('uMixes'), this.#mixes > 0);
      for (const [unit, name] of [[2, 'inks'], [3, 'mixLut'], [4, 'mixRgb'], [5, 'mixOf']]) this.#bind(unit, this.#textures[name]);
    } else {
      gl.uniform1i(u('uGlyphs'), core.glyphs.length);
      gl.uniform1i(u('uStyle'), ['ansi', 'colorAscii', 'ascii'].indexOf(core.style));
      this.#bind(2, this.#textures.masks);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#frame.fb);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    this.#bind(0, this.#textures.samples);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, cols * sw);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, c0 * sw);
    const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
    for (let l = l0; l < l1; l += band) {
      const bh = Math.min(band, l1 - l);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, l * sh);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, w * sw, bh * sh, 0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, bytes);
      gl.uniform2i(u('uFirst'), c0, l);
      gl.viewport(0, 0, w, bh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      for (const [attachment, into] of [[gl.COLOR_ATTACHMENT0, fg], [gl.COLOR_ATTACHMENT1, bg]]) {
        gl.readBuffer(attachment);
        gl.readPixels(0, 0, w, bh, gl.RGBA, gl.UNSIGNED_BYTE, into.subarray((l - l0) * w * 4, (l - l0 + bh) * w * 4));
      }
    }
    for (const name of ['UNPACK_ROW_LENGTH', 'UNPACK_SKIP_PIXELS', 'UNPACK_SKIP_ROWS']) gl.pixelStorei(gl[name], 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // An upload or a draw that failed (out of memory) drew from whatever was there: the JavaScript's
    // cells then, and everything uploaded again next time.
    if (gl.getError() !== gl.NO_ERROR) {
      this.#core = this.#palette = null;
      return null;
    }
    return { fg, bg, c0, c1, l0, l1 };
  }

  #compile(name, fragment) {
    const gl = this.#gl, program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`ShapeMatcher ${name}: ${gl.getShaderInfoLog(shader)}`);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`ShapeMatcher ${name}: ${gl.getProgramInfoLog(program)}`);
    return program;
  }

  #bind(unit, texture) {
    const gl = this.#gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  // A texture of w x h texels from data (nearest, no mipmaps), in texture unit 0.
  #texture(name, internal, format, type, w, h, data) {
    const gl = this.#gl;
    const texture = this.#textures[name] ??= gl.createTexture();
    this.#bind(0, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
    return texture;
  }

  // The palette's colors, and the core's glyphs (and Best match's mixes), when they're not up already.
  #upload(core) {
    const gl = this.#gl, palette = core.palette;
    if (this.#palette !== palette || !this.#textures.palette) {
      const n = Math.max(1, palette?.length ?? 0), data = new Uint8Array(n * 4);
      palette?.forEach((p, i) => data.set([p.r, p.g, p.b, 255], i * 4));
      this.#texture('palette', gl.RGBA8UI, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, n, 1, data);
      this.#palette = palette;
    }
    if (this.#core === core) return;
    if (core.kind === 'shape') {
      const n = core.glyphs.length, data = new Float32Array(32 * Math.max(1, n));
      core.glyphs.forEach((g, i) => data.set(g.mask, i * 32));
      this.#texture('masks', gl.R32F, gl.RED, gl.FLOAT, 32, Math.max(1, n), data);
    } else {
      const n = core.twoInk.length, data = new Float32Array(4 * Math.max(1, n));
      core.twoInk.forEach(({ gi, a, c, halves }, j) => data.set([a, c, gi, halves ? 1 : 0], j * 4));
      this.#texture('inks', gl.RGBA32F, gl.RGBA, gl.FLOAT, Math.max(1, n), 1, data);
      this.#uploadMixes(core);
    }
    this.#core = core;
  }

  // Best match's flat mixes as textures, and each 15-bit box's nearest (uMixLut), worked out on the GPU.
  #uploadMixes(core) {
    const gl = this.#gl, table = core.table, n = table ? table.glyph.length : 0;
    this.#mixes = n;
    const rows = Math.max(1, Math.ceil(n / MIX_ROW)), rgb = new Float32Array(MIX_ROW * rows * 4), of = new Uint8Array(MIX_ROW * rows * 4);
    for (let m = 0; m < n; m++) {
      rgb.set([table.rgb[m * 3], table.rgb[m * 3 + 1], table.rgb[m * 3 + 2], 0], m * 4);
      of.set([core.flat[table.glyph[m]].gi, table.fg[m], table.bg[m], 0], m * 4);
    }
    this.#texture('mixRgb', gl.RGBA32F, gl.RGBA, gl.FLOAT, MIX_ROW, rows, rgb);
    this.#texture('mixOf', gl.RGBA8UI, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, MIX_ROW, rows, of);
    const lut = this.#texture('mixLut', gl.R32UI, gl.RED_INTEGER, gl.UNSIGNED_INT, 256, 128, null);
    if (!n) return;
    const program = this.#programs.mixLut, fb = gl.createFramebuffer();
    gl.useProgram(program);
    this.#bind(4, this.#textures.mixRgb);
    gl.uniform1i(gl.getUniformLocation(program, 'uMixRgb'), 4);
    gl.uniform1i(gl.getUniformLocation(program, 'uMixCount'), n);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, lut, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0, 0, 256, 128);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
  }

  // The two targets the cells are drawn into, at least w x h.
  #frameOf(w, h) {
    const gl = this.#gl, f = this.#frame;
    if (f && f.w >= w && f.h >= h) return;
    const fw = Math.max(w, f?.w ?? 0), fh = Math.max(h, f?.h ?? 0);
    if (f) { gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.fg); gl.deleteTexture(f.bg); }
    const target = () => {
      const t = gl.createTexture();
      this.#bind(0, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, fw, fh);
      return t;
    };
    const fb = gl.createFramebuffer(), fg = target(), bg = target();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fg, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, bg, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.#frame = { fb, w: fw, h: fh, fg, bg };
  }
}
