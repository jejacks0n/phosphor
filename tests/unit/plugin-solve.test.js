// A plugin solver's JavaScript passes: the window of neighbors, the second pass over the first's picks, every result held.
import { describe, expect, it } from 'vitest';
import { readScript } from '@/plugins/script';
import { pluginMatcher, resolvePlugin, grownArea, holdCell, SolverError } from '@/lib/PluginSolve';
import { shapeMatcher, resolveShapes, mixChannel } from '@/lib/CharResolver';
import { PALETTES } from '@/lib/ColorUtils';
import { ASCII_BG } from '@/lib/Cells';

const CGA = PALETTES.cga;
const REF = 'plugin:jane.test/t';
// Glyph masks at 4 x 8, row-major, from exact geometry (as char-resolver.test.js makes them).
const RECTS = { '▀': [0, 0, 4, 4], '▄': [0, 4, 4, 8], '█': [0, 0, 4, 8], '▌': [0, 0, 2, 8], '|': [1, 0, 3, 8], '-': [0, 3, 4, 5] };
const maskOf = ([x0, y0, x1, y1]) => Float32Array.from({ length: 32 }, (_, i) => (i % 4 >= x0 && i % 4 < x1 && i >> 2 >= y0 && i >> 2 < y1 ? 1 : 0));
const SET = ['▀', '▄', '█', '▌'].map((char) => ({ char, mask: maskOf(RECTS[char]), own: false }));
const GLYPHS = [...SET, ...['|', '-'].map((char) => ({ char, mask: maskOf(RECTS[char]), own: true }))];
const CHARS = GLYPHS.map(({ char }) => char);

const solver = (fields) => readScript({ default: { solvers: [{ id: 't', name: 'T', styles: ['ansi', 'colorAscii', 'ascii'], reach: 1, ...fields }] } }).solvers[0];
const matcherOf = (def, more) => pluginMatcher({ def, ref: REF, palette: CGA, glyphs: GLYPHS, solids: 0, light: 0, renderStyle: 'ansi', options: {}, ...more });
const pick = (c) => [c.char, c.fg.hex.toLowerCase(), c.bg.hex.toLowerCase()];

// Samples (RGBA, cols x 4 wide, lines x 8 tall): each cell one color, color(col, line).
const solid = (cols, lines, color) => {
  const raw = new Uint8ClampedArray(cols * 4 * lines * 8 * 4);
  for (let y = 0; y < lines * 8; y++) {
    for (let x = 0; x < cols * 4; x++) raw.set([...color(x >> 2, y >> 3), 255], (y * cols * 4 + x) * 4);
  }
  return raw;
};
// Noise, the same every run.
const noise = (cols, lines) => {
  let seed = 7;
  return Uint8ClampedArray.from({ length: cols * 4 * lines * 8 * 4 }, (_, i) => (i % 4 === 3 ? 255 : (seed = (seed * 1103515245 + 12345) % 2147483648) % 256));
};
// Sample i of the cell at col, line, as RGB.
const rawSample = (raw, cols, col, line, i) => {
  const o = ((line * 8 + (i >> 2)) * cols * 4 + col * 4 + (i & 3)) * 4;
  return [raw[o], raw[o + 1], raw[o + 2]];
};
const clampTo = (v, n) => Math.min(n - 1, Math.max(0, v));

describe('resolvePlugin', () => {
  it('sample(dx, dy, i) reads neighbors within reach and the edge cell past the border', () => {
    const color = (col, line) => [40 * col + 10, 60 * line + 20, 5];
    const seen = new Map();
    let reused = null;
    const def = solver({
      reach: 1,
      solve(cell) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) seen.set(`${cell.col},${cell.line},${dx},${dy}`, [...cell.sample(dx, dy, 5)]);
        }
        reused ??= cell.sample(0, 0, 0) === cell.sample(1, 0, 0); // one array, overwritten by the next call
        return { char: '█', fg: 0, bg: 0 };
      },
    });
    resolvePlugin(solid(3, 2, color), 3, 2, matcherOf(def));
    expect(seen.get('0,0,-1,-1')).toEqual(color(0, 0));
    for (let line = 0; line < 2; line++) {
      for (let col = 0; col < 3; col++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            expect(seen.get(`${col},${line},${dx},${dy}`)).toEqual(color(clampTo(col + dx, 3), clampTo(line + dy, 2)));
          }
        }
      }
    }
    expect(reused).toBe(true);
    // Past its reach is the author's mistake: a SolverError.
    const far = solver({ reach: 1, solve: (cell) => (cell.sample(2, 0, 0), { char: '█', fg: 0, bg: 0 }) });
    expect(() => resolvePlugin(solid(3, 2, color), 3, 2, matcherOf(far))).toThrow(SolverError);
  });

  it('pass 2 sees pass 1\'s picks around the cell, null past the border', () => {
    const at = (col, line) => CHARS[(col + 2 * line) % CHARS.length];
    const seen = new Map();
    const def = solver({
      reach: 1,
      solve: (cell) => ({ char: at(cell.col, cell.line), fg: 0, bg: 0 }),
      refine(cell) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) seen.set(`${cell.col},${cell.line},${dx},${dy}`, cell.char(dx, dy));
        }
        return { char: '█', fg: 1, bg: 1 };
      },
    });
    const { cells, first } = resolvePlugin(solid(3, 2, () => [9, 9, 9]), 3, 2, matcherOf(def));
    for (let line = 0; line < 2; line++) {
      for (let col = 0; col < 3; col++) {
        expect(first[line * 3 + col].char).toBe(at(col, line));
        expect(cells[line * 3 + col].char).toBe('█');
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const c = col + dx, l = line + dy;
            expect(seen.get(`${col},${line},${dx},${dy}`)).toBe(c < 0 || c >= 3 || l < 0 || l >= 2 ? null : at(c, l));
          }
        }
      }
    }
  });

  it('an area\'s resolve gives the same cells as the whole grid\'s over the grown area', () => {
    const corners = [[-2, -2], [2, -2], [-2, 2], [2, 2], [0, 0]];
    const def = solver({
      reach: 2,
      solve(cell, look) {
        let sum = 0;
        for (const [dx, dy] of corners) sum += look.gray(cell.sample(dx, dy, 7));
        const n = Math.floor(sum);
        return { char: CHARS[n % CHARS.length], fg: look.nearest(cell.sample(0, 0, 0)), bg: n % 16 };
      },
      refine(cell) {
        const own = cell.char(0, 0);
        let n = 0;
        for (const [dx, dy] of corners) {
          const c = cell.char(dx, dy);
          n += c === null ? 3 : c === own ? 1 : 0;
        }
        return { char: CHARS[(CHARS.indexOf(own) + n) % CHARS.length], fg: n % 16, bg: 0 };
      },
    });
    const m = matcherOf(def), cols = 11, lines = 9, o = { strength: 1, style: 'bayer' };
    const raw = noise(cols, lines);
    const whole = resolvePlugin(raw, cols, lines, m, o);
    const changed = raw.slice();
    for (let y = 0; y < 8; y++) changed.fill(255, ((4 * 8 + y) * cols * 4 + 5 * 4) * 4, ((4 * 8 + y) * cols * 4 + 6 * 4) * 4); // the cell at col 5, line 4, white
    const area = { x: 5, y: 8, w: 1, h: 2 };
    const part = resolvePlugin(changed, cols, lines, m, { ...o, area, cells: whole.cells.slice(), first: whole.first.slice() });
    const fresh = resolvePlugin(changed, cols, lines, m, o);
    expect(part.cells.map(pick)).toEqual(fresh.cells.map(pick));
    expect(part.first.map(pick)).toEqual(fresh.first.map(pick));
    // Past reach of the change, so growing by reach alone would have missed it.
    const far = fresh.cells.some((c, i) => Math.max(Math.abs((i % cols) - 5), Math.abs(Math.floor(i / cols) - 4)) > 2 && pick(c).join() !== pick(whole.cells[i]).join());
    expect(far).toBe(true);
  });

  it('with Floyd–Steinberg, pass 1 carries the error and pass 2 sees none of it', () => {
    const cols = 8, lines = 5, raw = noise(cols, lines);
    const neighbor = new Map(), own1 = new Map(), own2 = new Map();
    const def = solver({
      reach: 1,
      solve(cell, look) {
        neighbor.set(`${cell.col},${cell.line}`, [...cell.sample(1, 0, 3)]);
        own1.set(`${cell.col},${cell.line}`, [...cell.sample(0, 0, 3)]);
        return look.byShape(cell);
      },
      refine(cell, look) {
        own2.set(`${cell.col},${cell.line}`, [...cell.sample(0, 0, 3)]);
        return look.byShape(cell);
      },
    });
    const settings = { palette: CGA, solids: 0.1, light: 0.5, renderStyle: 'ansi' };
    const r = resolvePlugin(raw, cols, lines, matcherOf(def, settings), { strength: 0.8, style: 'floyd' });
    const shape = shapeMatcher({ ...settings, glyphs: SET });
    const floyd = resolveShapes(raw, cols, lines, shape, { strength: 0.8, style: 'floyd' }).cells.map(pick);
    const plain = resolveShapes(raw, cols, lines, shape).cells.map(pick);
    expect(floyd).not.toEqual(plain);
    expect(r.first.map(pick)).toEqual(floyd); // pass 1 rides By shape's walk: the same error, carried the same way
    expect(r.cells.map(pick)).toEqual(plain); // pass 2: none of it
    expect([...own1.values()]).not.toEqual([...own2.values()]);
    for (let line = 0; line < lines; line++) {
      for (let col = 0; col < cols; col++) {
        // A neighbor's as sampled; past the border the edge cell's, here the cell's own (its error included).
        expect(neighbor.get(`${col},${line}`)).toEqual(col + 1 < cols ? rawSample(raw, cols, col + 1, line, 3) : own1.get(`${col},${line}`));
        expect(own2.get(`${col},${line}`)).toEqual(rawSample(raw, cols, col, line, 3));
      }
    }
  });

  it('Bayer\'s nudge is in a neighbor\'s samples as in the cell\'s own', () => {
    const cols = 5, lines = 3, own = new Map(), right = new Map();
    const def = solver({
      reach: 1,
      solve(cell) {
        own.set(`${cell.col},${cell.line}`, [...cell.sample(0, 0, 9)]);
        right.set(`${cell.col},${cell.line}`, [...cell.sample(1, 0, 9)]);
        return { char: '█', fg: 0, bg: 0 };
      },
    });
    const raw = solid(cols, lines, () => [100, 100, 100]);
    resolvePlugin(raw, cols, lines, matcherOf(def), { strength: 1, style: 'bayer' });
    expect(own.get('0,0')).not.toEqual(own.get('1,0'));
    for (let line = 0; line < lines; line++) {
      for (let col = 0; col < cols; col++) expect(right.get(`${col},${line}`)).toEqual(own.get(`${clampTo(col + 1, cols)},${line}`));
    }
  });

  it('alone: reach 0 and no pass 2', () => {
    const color = (col, line) => [40 * col + 10, 60 * line + 20, 5];
    const got = [];
    let refined = 0;
    const def = solver({
      reach: 2,
      solve(cell, look) {
        got.push([cell.col, cell.line, [...cell.sample(1, 0, 0)], [...cell.sample(-2, -2, 0)]]);
        return look.byShape(cell);
      },
      refine: () => (refined++, { char: '█', fg: 0, bg: 0 }),
    });
    const r = resolvePlugin(solid(3, 2, color), 3, 2, matcherOf(def), { alone: true });
    expect(refined).toBe(0);
    expect(r.first).toBe(null);
    expect(got).toHaveLength(6);
    for (const [col, line, a, b] of got) {
      expect(a).toEqual(color(col, line));
      expect(b).toEqual(color(col, line));
    }
    // Past the solver's own reach is still a mistake, alone or not.
    const far = solver({ reach: 1, solve: (cell) => (cell.sample(0, 2, 0), { char: '█', fg: 0, bg: 0 }) });
    expect(() => resolvePlugin(solid(1, 1, color), 1, 1, matcherOf(far), { alone: true })).toThrow(SolverError);
  });

  it('a refine that returns null keeps pass 1\'s cell, not a fault; undefined is still one', () => {
    const color = (col) => [60 * col, 100, 30];
    const def = solver({
      solve: (cell) => ({ char: '▌', fg: cell.col, bg: 2 }),
      refine: (cell) => [null, undefined, { char: '-', fg: 9, bg: 9 }][cell.col],
    });
    const r = resolvePlugin(solid(3, 2, color), 3, 2, matcherOf(def), {});
    for (const line of [0, 1]) {
      expect(r.cells[line * 3]).toBe(r.first[line * 3]); // kept, the same cell
      expect(pick(r.cells[line * 3])).toEqual(['▌', CGA[0].hex.toLowerCase(), CGA[2].hex.toLowerCase()]);
      expect(r.cells[line * 3 + 1].char).toBe('▀'); // held: the first glyph
      expect(r.cells[line * 3 + 2].char).toBe('-');
    }
    expect(r.faults).toBe(2); // undefined, once a line
    // Only pass 2 keeps: pass 1's null is held, as before.
    expect(resolvePlugin(solid(1, 1, color), 1, 1, matcherOf(solver({ solve: () => null })), {}).faults).toBe(1);
  });

  it('holds nonsense: undefined, a foreign character, NaN and out-of-range colors', () => {
    const results = [
      undefined, { char: 'Z' }, { char: '-', fg: { r: NaN, g: 0, b: 0 }, bg: 999 },
      { char: '▀', fg: 4, bg: { r: 250, g: 3, b: 3 } }, 7, null, { char: '|', fg: { r: 300, g: 0, b: 0 }, bg: 3.5 },
    ];
    const def = solver({ reach: 0, solve: (cell) => results[cell.col] });
    const r = resolvePlugin(solid(7, 1, () => [200, 200, 200]), 7, 1, matcherOf(def));
    const black = '#000000';
    expect(r.cells.map(pick)).toEqual([
      ['▀', black, black], ['▀', black, black], ['-', black, black],
      ['▀', '#0000aa', '#aa0000'], ['▀', black, black], ['▀', black, black], ['|', black, black],
    ]);
    expect(r.cells[3].fg).toBe(CGA[4]); // the palette's own entries, for .ans export
    expect(r.cells[3].bg).toBe(CGA[1]);
    expect(r.faults).toBe(4); // a character held: undefined, Z, 7 and null; colors are held without a fault

    // Full color: a color is rounded; an index has no palette to name.
    const full = matcherOf(def, { palette: null });
    expect(pick(holdCell({ char: '▌', fg: { r: 12.4, g: 200.6, b: 0 }, bg: 3 }, full).cell)).toEqual(['▌', '#0cc900', black]);
    // What a cell shows: bg mixed with fg by the glyph's mask.
    const { cell, shown } = holdCell({ char: '▌', fg: 15, bg: 1 }, matcherOf(def));
    expect(pick(cell)).toEqual(['▌', '#ffffff', '#aa0000']);
    expect([...shown]).toEqual(Array.from({ length: 96 }, (_, j) => ((j / 3 | 0) % 4 < 2 ? 255 : j % 3 ? 0 : 170)));
  });

  it('Color ASCII keeps a black background; ASCII is white on black', () => {
    const def = solver({ reach: 0, solve: () => ({ char: '▌', fg: 9, bg: 12 }) });
    const raw = solid(1, 1, () => [0, 0, 0]);
    const color = matcherOf(def, { renderStyle: 'colorAscii' });
    const [c] = resolvePlugin(raw, 1, 1, color).cells;
    expect(pick(c)).toEqual(['▌', '#ff5555', '#000000']);
    expect(c.bg).toBe(ASCII_BG);
    expect([...holdCell({ char: '▌', fg: 9, bg: 12 }, color).shown]).toEqual(Array.from({ length: 96 }, (_, j) => ((j / 3 | 0) % 4 < 2 ? [255, 85, 85][j % 3] : 0)));
    const mono = matcherOf(def, { renderStyle: 'ascii' });
    const [a] = resolvePlugin(raw, 1, 1, mono).cells;
    expect(pick(a)).toEqual(['▌', '#ffffff', '#000000']);
    expect(a.bg).toBe(ASCII_BG);
    expect([...holdCell({ char: '▌', fg: 9, bg: 12 }, mono).shown]).toEqual(Array.from({ length: 96 }, (_, j) => ((j / 3 | 0) % 4 < 2 ? 255 : 0)));
  });

  it('byShape(cell) is By shape\'s pick from the set alone', () => {
    const raw = solid(1, 1, () => [0, 0, 0]);
    for (let y = 0; y < 8; y++) for (let x = 1; x < 3; x++) raw.set([255, 255, 255], (y * 4 + x) * 4); // a | of white
    const s = Float32Array.from({ length: 96 }, (_, j) => raw[(j / 3 | 0) * 4 + j % 3]);
    const def = solver({ reach: 0, solve: (cell, look) => look.byShape(cell) });
    const m = matcherOf(def);
    const [c] = resolvePlugin(raw, 1, 1, m).cells;
    const shape = shapeMatcher({ palette: CGA, glyphs: SET, solids: 0, light: 0, renderStyle: 'ansi' }).match(s);
    expect(pick(c)).toEqual(pick(shape));
    expect(c.char).not.toBe('|');
    // Kept while its inputs stay the same.
    expect(matcherOf(def)).toBe(m);
    expect(matcherOf(def, { options: { threshold: 2 } })).not.toBe(m);
  });

  it('a throw becomes a SolverError naming the solver', () => {
    const raw = solid(2, 2, () => [0, 0, 0]);
    const caught = (def) => {
      try {
        resolvePlugin(raw, 2, 2, matcherOf(def));
      } catch (error) {
        return error;
      }
      return null;
    };
    const a = caught(solver({ solve: () => { throw new Error('boom'); } }));
    expect(a).toBeInstanceOf(SolverError);
    expect(a).toMatchObject({ ref: REF, message: 'boom' });
    const b = caught(solver({ solve: () => ({ char: '█', fg: 0, bg: 0 }), refine: () => { throw 'nope'; } }));
    expect(b).toMatchObject({ ref: REF, message: 'nope' });
  });

  it('look holds the set then the solver\'s own, the palette as colors, the settings, and the helpers', () => {
    let look = null, shaped = null;
    const def = solver({
      reach: 0,
      solve(cell, l) {
        look = l;
        const r = l.byShape(cell);
        shaped = { fg: r.fg, bg: r.bg };
        return r;
      },
    });
    const raw = solid(1, 1, () => [170, 0, 0]);
    resolvePlugin(raw, 1, 1, matcherOf(def, { solids: 0.25, light: 0.5, options: { threshold: 40 } }));
    expect(look.glyphs.map(({ char, own }) => [char, own])).toEqual([['▀', false], ['▄', false], ['█', false], ['▌', false], ['|', true], ['-', true]]);
    expect([...look.glyphs[4].mask]).toEqual([...GLYPHS[4].mask]);
    expect(look.glyphs[4].mask).not.toBe(GLYPHS[4].mask); // a copy: a solver can't change the app's masks
    expect(look.palette).toHaveLength(16);
    expect(look.palette[9]).toEqual({ r: 255, g: 85, b: 85 });
    expect(look).toMatchObject({ style: 'ansi', options: { threshold: 40 }, light: 0.5, solids: 0.25 });
    expect(look.mix(10, 200, 0.3)).toBe(mixChannel(10, 200, 0.3, 0.5));
    expect(look.nearest([250, 80, 90])).toBe(look.palette[9]);
    expect(look.nearest({ r: 1, g: 2, b: 3 })).toBe(look.palette[0]);
    expect(look.gray([10, 20, 30])).toBeCloseTo(0.2126 * 10 + 0.7152 * 20 + 0.0722 * 30);
    expect(look.gray({ r: 10, g: 20, b: 30 })).toBe(look.gray([10, 20, 30]));
    // byShape's colors are look's copies too, not the app's palette entries.
    expect(shaped.fg).toBe(look.palette[1]);
    expect(CGA).not.toContain(shaped.fg);

    let full = null;
    const fullDef = solver({ reach: 0, solve: (cell, l) => ((full = l), { char: '█', fg: 0, bg: 0 }) });
    resolvePlugin(raw, 1, 1, matcherOf(fullDef, { palette: null, renderStyle: 'colorAscii' }));
    expect(full.palette).toBe(null);
    expect(full.style).toBe('colorAscii');
    expect(full.nearest([12.4, 300, -5])).toEqual({ r: 12, g: 255, b: 0 });
  });

  it('a half-cell offset or char() past reach is the solver\'s mistake; an area with no first resolves whole', () => {
    const raw = solid(3, 2, () => [0, 0, 0]), done = { char: '█', fg: 0, bg: 0 };
    const half = solver({ reach: 1, solve: (cell) => (cell.sample(0.5, 0, 0), done) });
    expect(() => resolvePlugin(raw, 3, 2, matcherOf(half))).toThrow(SolverError);
    const far = solver({ reach: 1, solve: () => done, refine: (cell) => (cell.char(0, 2), done) });
    expect(() => resolvePlugin(raw, 3, 2, matcherOf(far))).toThrow(SolverError);
    let refined = 0;
    const counted = solver({ reach: 1, solve: () => done, refine: () => (refined++, done) });
    const r = resolvePlugin(raw, 3, 2, matcherOf(counted), { area: { x: 1, y: 0, w: 1, h: 2 } });
    expect(refined).toBe(6);
    expect(r.first).toHaveLength(6);
  });

  it('a 1-column, 1-line drawing at reach 4 reads only its own cell', () => {
    const raw = noise(1, 1), seen = [];
    const def = solver({
      reach: 4,
      solve(cell) {
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) for (let i = 0; i < 32; i++) seen.push([[...cell.sample(dx, dy, i)], rawSample(raw, 1, 0, 0, i)]);
        return { char: '█', fg: 0, bg: 0 };
      },
    });
    resolvePlugin(raw, 1, 1, matcherOf(def));
    expect(seen).toHaveLength(81 * 32);
    for (const [got, want] of seen) expect(got).toEqual(want);
  });

  it('origin offsets the col and line the solver is told, not the samples it reads', () => {
    const raw = solid(2, 1, (col) => (col ? [255, 255, 255] : [0, 0, 0])), told = [];
    const def = solver({
      solve(cell) {
        told.push([cell.col, cell.line, cell.sample(0, 0, 0)[0], cell.sample(1, 0, 0)[0]]);
        return { char: '█', fg: 0, bg: 0 };
      },
    });
    resolvePlugin(raw, 2, 1, matcherOf(def), { origin: { col: 7, line: 3 } });
    expect(told).toEqual([[7, 3, 0, 255], [8, 3, 255, 255]]);
    told.length = 0;
    resolvePlugin(raw, 2, 1, matcherOf(def));
    expect(told.map(([col, line]) => [col, line])).toEqual([[0, 0], [1, 0]]);
  });
});

describe('grownArea', () => {
  it('grows an area by reach cells each way, clipped to the grid; null stays null', () => {
    expect(grownArea(null, 2, 10, 6)).toBe(null);
    expect(grownArea({ x: 5, y: 5, w: 1, h: 2 }, 2, 10, 6)).toEqual({ x: 3, y: 1, w: 5, h: 10 });
    expect(grownArea({ x: 1, y: 2, w: 2, h: 2 }, 2, 10, 6)).toEqual({ x: 0, y: 0, w: 5, h: 8 });
    expect(grownArea({ x: 8, y: 8, w: 2, h: 4 }, 1, 10, 6)).toEqual({ x: 7, y: 6, w: 3, h: 6 });
    expect(grownArea({ x: 4, y: 4, w: 1, h: 1 }, 0, 10, 6)).toEqual({ x: 4, y: 4, w: 1, h: 1 });
  });
});
