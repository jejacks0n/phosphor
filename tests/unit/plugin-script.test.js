// A script's default export read into checked, frozen solvers.
import { describe, expect, it } from 'vitest';
import { readSolvers } from '@/plugins/script';

const OUTLINE_LIKE = {
  id: 'outlines', name: 'Outlines', styles: ['ansi', 'ascii'], reach: 1, chars: '/\\-|',
  options: [{ id: 'threshold', kind: 'slider', name: 'Threshold', min: 0, max: 100, step: 1, default: 40 }],
  solve: () => ({ char: '-', fg: 0, bg: 0 }),
};
const read = (change) => readSolvers({ default: { solvers: [{ ...OUTLINE_LIKE, ...change }] } });
const shape = (field) => expect.objectContaining({ code: 'scriptShape', detail: { field } });

describe('readSolvers', () => {
  it('checks a solver\'s shape and freezes it', () => {
    const [def] = readSolvers({ default: { solvers: [OUTLINE_LIKE] } });
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
    [{ id: 'Bad Id' }, 'solvers[0].id'], [{ shader: { solve: 3 } }, 'solvers[0].shader'],
  ])('refuses %o at %s', (change, field) => expect(() => read(change)).toThrow(shape(field)));

  it('refuses no default export, no solvers, two with one id, and a control, combining or wide character in chars', () => {
    expect(() => readSolvers({})).toThrow(shape('default'));
    expect(() => readSolvers({ default: { solvers: [] } })).toThrow(shape('solvers'));
    expect(() => readSolvers({ default: { solvers: [OUTLINE_LIKE, OUTLINE_LIKE] } }))
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
    const [def] = readSolvers({ default: { solvers: [tricky] } });
    expect(def.reach).toBe(1);
    expect(reads).toBe(1);
  });

  it('copies an array once: a Proxy whose length changes cannot pass the caps', () => {
    let reads = 0;
    const solvers = new Proxy([OUTLINE_LIKE], { get: (target, key) => (key === 'length' && reads++ > 0 ? 1e6 : target[key]) });
    expect(readSolvers({ default: { solvers } })).toHaveLength(1);
  });

  it('turns a throwing getter into scriptShape', () => {
    const boom = { ...OUTLINE_LIKE, get name() { throw new Error('no'); } };
    expect(() => readSolvers({ default: { solvers: [boom] } })).toThrow(shape('solvers[0]'));
    expect(() => readSolvers({ get default() { throw new Error('no'); } })).toThrow(shape('default'));
  });

  it('refuses an id that is an object with a toString', () => {
    const id = { toString: () => 'ok' };
    expect(() => read({ id })).toThrow(shape('solvers[0].id'));
    expect(() => read({ options: [{ id, kind: 'checkbox', name: 'A', default: true }] })).toThrow(shape('solvers[0].options[0]'));
  });
});
