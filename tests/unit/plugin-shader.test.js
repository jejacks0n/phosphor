// A plugin solver's shader source (ShapeMatcher's pluginShaderSource): the prelude, one uniform per option, the author's
// body as solve() or refine(), and a main that calls it.
import { describe, expect, it } from 'vitest';
import { pluginShaderSource, ownGlyphs } from '@/lib/ShapeMatcher.js';
import { filterSource } from '@/lib/WebGLProcessor.js';

const def = {
  id: 'edges', reach: 1,
  options: [
    { id: 'threshold', kind: 'slider', min: 0, max: 100, step: 1, default: 40 },
    { id: 'thin', kind: 'checkbox', default: true },
    { id: 'set', kind: 'choice', choices: ['a', 'b'], default: 0 },
  ],
  shader: { solve: 'byShape();', refine: 'if (charAt(ivec2(1, 0)) == 0) byShape();' },
};

describe('pluginShaderSource', () => {
  it('declares one uniform per option, typed by kind', () => {
    const src = pluginShaderSource(def, 'solve', { glyphs: 3, reach: 1 });
    expect(src).toMatch(/uniform float opt_threshold;/);
    expect(src).toMatch(/uniform bool opt_thin;/);
    expect(src).toMatch(/uniform int opt_set;/);
  });

  it('has Solids as the JavaScript gets it and look.gray as gray(), for both passes', () => {
    for (const pass of ['solve', 'refine']) {
      const src = pluginShaderSource(def, pass, { glyphs: 3, reach: 1 });
      expect(src).toMatch(/uniform float uSolids;/);
      expect(src).toMatch(/float gray\(vec3 c\) \{ return 0\.2126 \* c\.r \+ 0\.7152 \* c\.g \+ 0\.0722 \* c\.b; \}/);
    }
  });

  it('only pass 2 gets charAt', () => {
    expect(pluginShaderSource(def, 'solve', { glyphs: 3, reach: 1 })).not.toMatch(/charAt/);
    expect(pluginShaderSource(def, 'refine', { glyphs: 3, reach: 1 })).toMatch(/int charAt\(ivec2 d\)/);
  });

  it('puts the author\'s body in its pass\'s function, which main calls, with the glyph count and reach', () => {
    const solve = pluginShaderSource(def, 'solve', { glyphs: 3, reach: 2 });
    expect(solve).toMatch(/void solve\(\) \{\n#line 1\nbyShape\(\);\n\}/);
    expect(solve).toMatch(/void main\(\) \{[^}]*solve\(\);/);
    expect(solve).toMatch(/const int glyphCount = 3;/);
    expect(solve).toMatch(/const int ph_reach = 2;/);
    const refine = pluginShaderSource(def, 'refine', { glyphs: 3, reach: 1 });
    expect(refine).toMatch(/void refine\(\) \{\n#line 1\nif \(charAt/);
    expect(refine).toMatch(/void main\(\) \{[^}]*refine\(\);/);
    expect(refine.startsWith('#version 300 es')).toBe(true);
  });

  it('gives the solver\'s own characters\' glyph indexes, in its order: the set\'s where the set holds one', () => {
    const glyphs = [...' .:-=', '|', '/', '\\'].map((char, i) => ({ char, own: i >= 5 }));
    const own = { ...def, chars: '-|/\\' };
    expect(ownGlyphs(own, glyphs)).toEqual([3, 5, 6, 7]);
    expect(pluginShaderSource(own, 'solve', { glyphs: 8, reach: 1, own: ownGlyphs(own, glyphs) })).toMatch(/const int ownGlyph\[4\] = int\[4\]\(3, 5, 6, 7\);/);
    expect(pluginShaderSource(def, 'solve', { glyphs: 3, reach: 1, own: [] })).not.toMatch(/ownGlyph/); // no chars: no array
  });
});

// An author's pass is pasted into a shader after Phosphor's prelude, so every name declared there is one the pass can
// use, and would break if it were renamed. The names docs/plugins.md lists are the plugin API; every other one is
// Phosphor's own and begins ph_, which the docs tell authors never to use or declare.
describe('the names a pass can reach', () => {
  // Every name declared outside a function in a shader's source: uniforms, ins and outs, constants, globals, functions
  // and #defines. Comments are dropped and braces counted, so a function's own locals aren't taken.
  function declared(source) {
    const names = new Set();
    const code = source.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, name] of code.matchAll(/^[ \t]*#define[ \t]+(\w+)/gm)) names.add(name);
    let depth = 0, statement = '';
    const take = () => {
      const head = statement.replace(/layout\s*\([^)]*\)/g, '').split(/[(=[]/)[0].trim();
      const name = /(\w+)$/.exec(head)?.[1];
      if (name && !/^precision\b/.test(head)) names.add(name);
      statement = '';
    };
    for (const line of code.split('\n')) {
      if (/^[ \t]*#/.test(line)) continue;
      for (const char of line) {
        if (char === '{') { if (depth++ === 0) take(); } else if (char === '}') { depth--; statement = ''; } else if (depth === 0) {
          if (char === ';') take(); else statement += char;
        }
      }
      if (depth === 0) statement += ' ';
    }
    return [...names];
  }
  const own = (names, listed) => names.filter((name) => !listed.includes(name) && !name.startsWith('ph_') && !name.startsWith('opt_'));

  const SOLVER = ['sampleAt', 'charAt', 'cell', 'glyphCount', 'glyphMask', 'ownGlyph', 'paletteCount', 'paletteColor', 'uLight', 'uSolids', 'uStyle',
    'snap', 'mixed', 'gray', 'toLinear', 'toSrgb', 'byShape', 'put', 'main'];
  const FILTER = ['pixel', 'uv', 'uResolution', 'luma', 'main'];
  const chars = { ...def, chars: '-|' };

  it('finds what a source declares', () => {
    const names = declared('#define two one\nuniform float one; // not this\nlayout(location = 0) out vec4 three;\nconst int four[2] = int[2](1, 2);\nvec2 five;\nfloat six(vec3 c) { float inner = 1.0; return inner; }\nvoid main() { six(vec3(0)); }');
    expect(names.sort()).toEqual(['five', 'four', 'main', 'one', 'six', 'three', 'two']);
  });

  it.each(['solve', 'refine'])('a solver\'s %s pass reaches the listed names and Phosphor\'s own, which begin ph_', (pass) => {
    const names = declared(pluginShaderSource(chars, pass, { glyphs: 3, reach: 1, own: [1, 2] }));
    expect(own(names, [...SOLVER, pass])).toEqual([]);
    for (const name of SOLVER.filter((each) => each !== 'charAt' || pass === 'refine')) expect(names, name).toContain(name);
    expect(names).toContain('opt_threshold');
    // sampleAt and put are each one function: By shape's own of those names (other arguments) would be reachable too.
    const source = pluginShaderSource(chars, pass, { glyphs: 3, reach: 1, own: [1, 2] });
    expect([source.match(/\bsampleAt\(ivec2 \w+, \w+ \w+\) \{/g), source.match(/\bvoid put\(/g)]).toEqual([['sampleAt(ivec2 d, int i) {'], ['void put(']]);
  });

  it('a filter\'s pass reaches the listed names and Phosphor\'s own, which begin ph_', () => {
    const names = declared(filterSource('return pixel(vec2(0.0));', def.options));
    expect(own(names, FILTER)).toEqual([]);
    for (const name of FILTER) expect(names, name).toContain(name);
    expect(names).toContain('opt_threshold');
  });
});
