// A script's default export read into checked, frozen solvers.
import { describe, expect, it } from 'vitest';
import { readScript, readOutlines } from '@/plugins/script';

const OUTLINE_LIKE = {
  id: 'outlines', name: 'Outlines', styles: ['ansi', 'ascii'], reach: 1, chars: '/\\-|',
  options: [{ id: 'threshold', kind: 'slider', name: 'Threshold', min: 0, max: 100, step: 1, default: 40 }],
  solve: () => ({ char: '-', fg: 0, bg: 0 }),
};
const read = (change) => readScript({ default: { solvers: [{ ...OUTLINE_LIKE, ...change }] } }).solvers;
const shape = (field) => expect.objectContaining({ code: 'scriptShape', detail: { field } });

describe('readScript', () => {
  it('checks a solver\'s shape and freezes it', () => {
    const [def] = readScript({ default: { solvers: [OUTLINE_LIKE] } }).solvers;
    expect(Object.isFrozen(def) && Object.isFrozen(def.options)).toBe(true);
    expect(def).toMatchObject({ reach: 1, chars: '/\\-|', refine: null, shader: { solve: null, refine: null } });
  });

  it.each([
    [{ reach: 5 }, 'solvers[0].reach'], [{ reach: 1.5 }, 'solvers[0].reach'], [{ styles: [] }, 'solvers[0].styles'],
    [{ styles: ['pixel'] }, 'solvers[0].styles'], [{ solve: 'x' }, 'solvers[0].solve'], [{ chars: 'x'.repeat(33) }, 'solvers[0].chars'],
    [{ options: [{ id: 'a', kind: 'slider', name: 'A', min: 5, max: 1, step: 1, default: 3 }] }, 'solvers[0].options[0]'],
    [{ options: [{ id: 'a', kind: 'choice', name: 'A', choices: ['x'], default: 1 }] }, 'solvers[0].options[0]'],
    [{ options: [{ id: 'a', kind: 'dial', name: 'A', default: 1 }] }, 'solvers[0].options[0]'],
    [{ options: [{ id: 'a-b', kind: 'checkbox', name: 'A', default: true }] }, 'solvers[0].options[0]'],
    [{ options: [{ id: 'a__b', kind: 'checkbox', name: 'A', default: true }] }, 'solvers[0].options[0]'], // GLSL reserves __
    [{ options: [{ id: `a${'b'.repeat(32)}`, kind: 'checkbox', name: 'A', default: true }] }, 'solvers[0].options[0]'],
    [{ id: 'Bad Id' }, 'solvers[0].id'], [{ id: '-lines' }, 'solvers[0].id'], [{ name: 'Out\tlines' }, 'solvers[0].name'], [{ shader: { solve: 3 } }, 'solvers[0].shader'],
  ])('refuses %o at %s', (change, field) => expect(() => read(change)).toThrow(shape(field)));

  it('reads a color option, its default lowercased', () => {
    const option = { id: 'tint', kind: 'color', name: 'Tint', default: '#FF8800' };
    expect(read({ options: [option] })[0].options[0]).toEqual({ ...option, default: '#ff8800' });
  });

  it.each(['#ff88', 'ff8800', '#gg0000', 12])('refuses a color option\'s default %o', (value) => {
    const options = [{ id: 'tint', kind: 'color', name: 'Tint', default: value }];
    expect(() => read({ options })).toThrow(shape('solvers[0].options[0]'));
  });

  it('takes an option id with single underscores, 32 characters at most', () => {
    for (const id of ['a_b_c', `a${'_b'.repeat(15)}c`]) {
      expect(read({ options: [{ id, kind: 'checkbox', name: 'A', default: true }] })[0].options[0].id).toBe(id);
    }
  });

  it('refuses no default export, no solvers, two with one id, and a control, combining or wide character in chars', () => {
    expect(() => readScript({})).toThrow(shape('default'));
    expect(() => readScript({ default: { solvers: [] } })).toThrow(shape('default'));
    expect(() => readScript({ default: {} })).toThrow(shape('default'));
    expect(() => readScript({ default: { solvers: [OUTLINE_LIKE, OUTLINE_LIKE] } }))
      .toThrow(expect.objectContaining({ code: 'twoSolvers', detail: { id: 'outlines' } }));
    for (const char of ['\n', '́', '漢']) {
      expect(() => read({ chars: `a${char}` })).toThrow(expect.objectContaining({ code: 'badChar', detail: { char } }));
    }
  });

  it('takes Outlines\' chars: - | / \\ ─ │ ╱ ╲', () => {
    expect(read({ chars: '-|/\\─│╱╲' })[0].chars).toBe('-|/\\─│╱╲');
  });

  it('reads each field once: a getter that changes its answer cannot get a bad value through', () => {
    let reads = 0;
    const tricky = { ...OUTLINE_LIKE, get reach() { return reads++ === 0 ? 1 : 1e9; } };
    const [def] = readScript({ default: { solvers: [tricky] } }).solvers;
    expect(def.reach).toBe(1);
    expect(reads).toBe(1);
  });

  it('copies an array once: a Proxy whose length changes cannot pass the caps', () => {
    let reads = 0;
    const solvers = new Proxy([OUTLINE_LIKE], { get: (target, key) => (key === 'length' && reads++ > 0 ? 1e6 : target[key]) });
    expect(readScript({ default: { solvers } }).solvers).toHaveLength(1);
  });

  it('turns a throwing getter into scriptShape', () => {
    const boom = { ...OUTLINE_LIKE, get name() { throw new Error('no'); } };
    expect(() => readScript({ default: { solvers: [boom] } })).toThrow(shape('solvers[0]'));
    expect(() => readScript({ get default() { throw new Error('no'); } })).toThrow(shape('default'));
  });

  it('refuses an id that is an object with a toString', () => {
    const id = { toString: () => 'ok' };
    expect(() => read({ id })).toThrow(shape('solvers[0].id'));
    expect(() => read({ options: [{ id, kind: 'checkbox', name: 'A', default: true }] })).toThrow(shape('solvers[0].options[0]'));
  });
});

const ICON = '<svg viewBox="0 0 16 16"><path d="M1 1L15 15"/></svg>';
const BRUSH = { id: 'smear', name: 'Smear', icon: ICON, key: 'j', size: 'width', options: [{ id: 'width', kind: 'slider', name: 'Width', min: 1, max: 9, step: 1, default: 3 }], move: () => {} };
const SHAPE = { id: 'star', name: 'Star', icon: ICON, outline: () => [] };
const FILTER = { id: 'glow', name: 'Glow', options: [{ id: 'on', kind: 'checkbox', name: 'On', default: false }], passes: ['void main() {}'] };
const readOf = (kind, item) => readScript({ default: { [kind]: [item] } });

describe('readScript: brushes, shapes and filters', () => {
  it('reads and freezes one of each, a brush\'s key normalized', () => {
    const { solvers, brushes, shapes, filters } = readScript({ default: { brushes: [BRUSH], shapes: [SHAPE], filters: [FILTER] } });
    expect(solvers).toEqual([]);
    expect(brushes[0]).toMatchObject({ id: 'smear', key: 'J', size: 'width', begin: null, end: null, move: BRUSH.move });
    expect(shapes[0].outline).toBe(SHAPE.outline);
    expect(filters[0].passes).toEqual(FILTER.passes);
    expect([brushes[0], brushes[0].options, shapes[0], shapes[0].options, filters[0], filters[0].passes].every(Object.isFrozen)).toBe(true);
    expect(readOf('brushes', { ...BRUSH, key: 'Shift+j' }).brushes[0].key).toBe('Shift+J');
    expect(readOf('brushes', { ...BRUSH, key: undefined, size: undefined }).brushes[0]).toMatchObject({ key: null, size: null });
  });

  it.each([
    ['brushes', { ...BRUSH, move: undefined }, 'brushes[0].move'], ['brushes', { ...BRUSH, key: 'JJ' }, 'brushes[0].key'],
    ['brushes', { ...BRUSH, key: '1' }, 'brushes[0].key'], ['brushes', { ...BRUSH, size: 'nope' }, 'brushes[0].size'],
    ['brushes', { ...BRUSH, icon: '<script>alert(1)</script>' }, 'brushes[0].icon'], ['brushes', { ...BRUSH, icon: 3 }, 'brushes[0].icon'],
    ['brushes', { ...BRUSH, options: [{ id: 'width', kind: 'choice', name: 'W', choices: ['a'], default: 0 }] }, 'brushes[0].size'],
    ['shapes', { ...SHAPE, outline: undefined }, 'shapes[0].outline'],
    ['filters', { ...FILTER, passes: [] }, 'filters[0].passes'], ['filters', { ...FILTER, passes: ['a', 'b', 'c', 'd', 'e'] }, 'filters[0].passes'],
    ['filters', { ...FILTER, passes: ['x'.repeat(64 * 1024 + 1)] }, 'filters[0].passes[0]'],
    ['filters', { ...FILTER, passes: ['a', 'b', 3] }, 'filters[0].passes[2]'],
    // A filter runs only while an option is off its default: with none it never would.
    ['filters', { ...FILTER, options: [] }, 'filters[0].options'], ['filters', { ...FILTER, options: undefined }, 'filters[0].options'],
    // An id begins and ends with a letter or a digit.
    ['filters', { ...FILTER, id: '---' }, 'filters[0].id'], ['brushes', { ...BRUSH, id: '-smear' }, 'brushes[0].id'], ['shapes', { ...SHAPE, id: 'star-' }, 'shapes[0].id'],
    // A name is plain text: no line break, control character or mark that turns its direction.
    ['brushes', { ...BRUSH, name: 'Smear\nOfficial' }, 'brushes[0].name'], ['shapes', { ...SHAPE, name: 'Star\u202Egnp' }, 'shapes[0].name'],
    ['filters', { ...FILTER, name: 'Glow\u0007' }, 'filters[0].name'],
    ['brushes', { ...BRUSH, options: [{ id: 'width', kind: 'slider', name: 'Wid\u2028th', min: 1, max: 9, step: 1, default: 3 }] }, 'brushes[0].options[0]'],
    ['brushes', { ...BRUSH, size: undefined, options: [{ id: 'mode', kind: 'choice', name: 'Mode', choices: ['Soft', 'Hard\u200E'], default: 0 }] }, 'brushes[0].options[0]'],
  ])('refuses %s %#', (kind, item, field) => expect(() => readOf(kind, item)).toThrow(shape(field)));

  it('takes an id with hyphens inside, 40 characters at most, and a name in any script', () => {
    expect(readOf('brushes', { ...BRUSH, id: 'soft-smear-2' }).brushes[0].id).toBe('soft-smear-2');
    expect(readOf('brushes', { ...BRUSH, id: 'a'.repeat(40) }).brushes[0].id).toHaveLength(40);
    expect(() => readOf('brushes', { ...BRUSH, id: 'a'.repeat(41) })).toThrow(shape('brushes[0].id'));
    expect(readOf('brushes', { ...BRUSH, name: 'Étaler 👩\u200D🎨' }).brushes[0].name).toBe('Étaler 👩\u200D🎨');
  });

  it('refuses nine brushes and a repeated brush id', () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ ...BRUSH, id: `b${i}` }));
    expect(() => readScript({ default: { brushes: nine } })).toThrow(shape('brushes'));
    expect(() => readScript({ default: { brushes: [BRUSH, BRUSH] } })).toThrow(shape('brushes[1].id'));
  });

  it('reads a brush\'s fields once and does not call its functions', () => {
    let reads = 0, calls = 0;
    const tricky = { ...BRUSH, get key() { return reads++ === 0 ? 'j' : 'JJ'; }, move: () => { calls++; } };
    expect(readOf('brushes', tricky).brushes[0].key).toBe('J');
    expect([reads, calls]).toEqual([1, 0]);
    const boom = { ...BRUSH, get name() { throw new Error('no'); } };
    expect(() => readOf('brushes', boom)).toThrow(shape('brushes[0]'));
  });
});

describe('readOutlines', () => {
  it('gives every point six numbers, zero handles for a plain one', () => {
    const [outline] = readOutlines([{ closed: true, points: [[0, 0], [1, 0], [0.5, 1, 1, 2, 3, 4]] }]);
    expect(outline.points).toEqual([[0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0], [0.5, 1, 1, 2, 3, 4]]);
    expect(Object.isFrozen(outline) && Object.isFrozen(outline.points[0])).toBe(true);
  });

  const line = { closed: false, points: [[0, 0], [1, 1]] };
  it.each([
    [[]], [Array.from({ length: 201 }, () => line)], [[{ closed: false, points: Array.from({ length: 501 }, () => [0, 0]) }]],
    [[{ closed: false, points: [[0, NaN], [1, 1]] }]], [[{ closed: false, points: [[0, 0, 1], [1, 1]] }]],
    [[{ closed: 'yes', points: line.points }]], [[{ closed: false, points: [[0, 0]] }]], ['x'],
  ])('refuses %# ', (raw) => expect(() => readOutlines(raw)).toThrow(shape('outline')));
});
