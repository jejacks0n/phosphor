// A plugin solver's shader source (ShapeMatcher's pluginShaderSource): the prelude, one uniform per option, the author's
// body as solve() or refine(), and a main that calls it.
import { describe, expect, it } from 'vitest';
import { pluginShaderSource, ownGlyphs } from '@/lib/ShapeMatcher.js';

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

  it('only pass 2 gets charAt', () => {
    expect(pluginShaderSource(def, 'solve', { glyphs: 3, reach: 1 })).not.toMatch(/charAt/);
    expect(pluginShaderSource(def, 'refine', { glyphs: 3, reach: 1 })).toMatch(/int charAt\(ivec2 d\)/);
  });

  it('puts the author\'s body in its pass\'s function, which main calls, with the glyph count and reach', () => {
    const solve = pluginShaderSource(def, 'solve', { glyphs: 3, reach: 2 });
    expect(solve).toMatch(/void solve\(\) \{\n#line 1\nbyShape\(\);\n\}/);
    expect(solve).toMatch(/void main\(\) \{[^}]*solve\(\);/);
    expect(solve).toMatch(/const int glyphCount = 3;/);
    expect(solve).toMatch(/const int reach = 2;/);
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
