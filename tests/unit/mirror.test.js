import { describe, it, expect } from 'vitest';
import { mirrorAxes, mirrorOps, mirrorPixels, mirrorCells, mirrorPoint, strokeMirror, withMirror, eachSide } from '@/lib/mirror';

const mark = (axes, clip = null) => ({ axes, clip });

describe('mirrorAxes', () => {
  it('folds the middle until the rulers move', () => {
    expect(mirrorAxes({ x: 0, y: 0 }, 80)).toEqual({ x: 40, y: null });
    expect(mirrorAxes({ x: 0, y: 0 }, 41)).toEqual({ x: 20.5, y: null });
    expect(mirrorAxes({ x: 12, y: 0 }, 80)).toEqual({ x: 12, y: null });
    expect(mirrorAxes({ x: 0, y: 5.5 }, 80)).toEqual({ x: 40, y: 5.5 });
  });
  it('lists the ops', () => {
    expect(mirrorOps({ x: 40, y: null })).toEqual([['h']]);
    expect(mirrorOps({ x: 40, y: 5 })).toEqual([['h'], ['v'], ['h', 'v']]);
  });
});

describe('mirrorPixels', () => {
  it('mirrors across', () => {
    const m = mark({ x: 40, y: null });
    expect(mirrorPixels([{ x: 0, y: 3, c: 'a' }], m, 80, 10)).toEqual([[{ x: 79, y: 3, c: 'a' }]]);
    expect(mirrorPixels([{ x: 39, y: 0 }], m, 80, 10)).toEqual([[{ x: 40, y: 0 }]]);
  });
  it('drops a spot that maps onto itself', () => {
    expect(mirrorPixels([{ x: 20, y: 0 }], mark({ x: 20.5, y: null }), 41, 10)).toEqual([[]]);
  });
  it('mirrors down', () => {
    const m = mark({ x: 40, y: 5 });
    expect(mirrorPixels([{ x: 0, y: 0 }], m, 80, 10)[1]).toEqual([{ x: 0, y: 19 }]);
    expect(mirrorPixels([{ x: 0, y: 9 }], m, 80, 10)[1]).toEqual([{ x: 0, y: 10 }]);
    expect(mirrorPixels([{ x: 0, y: 8 }], mark({ x: 40, y: 4.5 }), 80, 10)[1]).toEqual([{ x: 0, y: 9 }]);
  });
  // A Brush move lays a pixel once for each dab that reaches it, and they add up: the copy is laid as often, or it
  // comes out fainter. Only the original's spots and an earlier copy's are taken.
  it('keeps a pixel laid more than once as often across', () => {
    const m = mark({ x: 40, y: 5 });
    const [across, down, both] = mirrorPixels([{ x: 0, y: 0, alpha: 0.2 }, { x: 0, y: 0, alpha: 0.3 }], m, 80, 10);
    expect(across).toEqual([{ x: 79, y: 0, alpha: 0.2 }, { x: 79, y: 0, alpha: 0.3 }]);
    expect(down).toHaveLength(2);
    expect(both).toHaveLength(2);
  });
  it('drops copies off the grid', () => {
    expect(mirrorPixels([{ x: 5, y: 0 }], mark({ x: 70, y: null }), 80, 10)).toEqual([[]]);
  });
  it('drops copies the clip refuses', () => {
    const clip = { pixel: (x) => x < 40, cell: (c) => c < 40 };
    expect(mirrorPixels([{ x: 5, y: 0 }], mark({ x: 40, y: null }, clip), 80, 10)).toEqual([[]]);
  });
});

describe('mirrorCells', () => {
  it('turns characters four ways', () => {
    const out = mirrorCells([{ col: 0, row: 0, attrs: { char: '┌' } }], mark({ x: 40, y: 5 }), 80, 10);
    expect(out).toEqual([
      [{ col: 79, row: 0, attrs: { char: '┐' } }],
      [{ col: 0, row: 9, attrs: { char: '└' } }],
      [{ col: 79, row: 9, attrs: { char: '┘' } }],
    ]);
  });
  it('turns blocks and keeps letters', () => {
    const m = mark({ x: 40, y: 5 });
    expect(mirrorCells([{ col: 1, row: 1, attrs: { char: '▀' } }], m, 80, 10)[1][0].attrs.char).toBe('▄');
    expect(mirrorCells([{ col: 1, row: 1, attrs: { char: '▌' } }], m, 80, 10)[0][0].attrs.char).toBe('▐');
    expect(mirrorCells([{ col: 1, row: 1, attrs: { char: 'A' } }], m, 80, 10)[0][0].attrs.char).toBe('A');
  });
  it('keeps a paint block', () => {
    const out = mirrorCells([{ col: 1, row: 1, attrs: { char: '▄' } }], mark({ x: 40, y: 5 }), 80, 10);
    expect(out[1][0].attrs.char).toBe('▄');
  });
  it('drops a copy whose second half falls off the grid', () => {
    expect(mirrorCells([{ col: 1, row: 0, attrs: { char: '日' } }], mark({ x: 40, y: null }), 80, 10)[0][0].col).toBe(77);
    expect(mirrorCells([{ col: 5, row: 0, attrs: { char: '日' } }], mark({ x: 80, y: null }), 80, 10)).toEqual([[]]);
  });
  it('drops a copy landing where an earlier one went', () => {
    const cells = [{ col: 0, row: 4, attrs: { char: 'A' } }, { col: 79, row: 4, attrs: { char: 'A' } }];
    const out = mirrorCells(cells, mark({ x: 40, y: 5 }), 80, 10);
    expect(out[0]).toEqual([]); // each lands on the other
    expect(out[1].map((c) => [c.col, c.row])).toEqual([[0, 5], [79, 5]]);
    expect(out[2]).toEqual([]); // both already taken by the down copies
  });
  it('drops cell copies the clip refuses and adds no char to a cell without one', () => {
    const clip = { pixel: () => true, cell: (c) => c < 40 };
    expect(mirrorCells([{ col: 5, row: 0, attrs: { char: 'A' } }], mark({ x: 40, y: null }, clip), 80, 10)).toEqual([[]]);
    expect(mirrorCells([{ col: 5, row: 0, attrs: { fg: 1 } }], mark({ x: 40, y: null }), 80, 10)[0][0].attrs).toEqual({ fg: 1 });
  });
  it('lands a wide character with its lead at the mirrored pair', () => {
    expect(mirrorCells([{ col: 0, row: 0, attrs: { char: '日' } }], mark({ x: 40, y: null }), 80, 10)[0][0].col).toBe(78);
  });
});

describe('mirrorPoint', () => {
  it('goes to the mirrored pixel center', () => {
    expect(mirrorPoint({ x: 3.2, y: 7.9 }, ['h'], { x: 40, y: null })).toEqual({ x: 76.5, y: 7.9 });
    expect(mirrorPoint({ x: 3.2, y: 7.9 }, ['v'], { x: 40, y: 5 })).toEqual({ x: 3.2, y: 12.5 });
  });
});

describe('strokeMirror', () => {
  const project = { cols: 80 };
  it('is null unless mirror and the tool mirrors', () => {
    expect(strokeMirror({ mirror: false, rulerZero: { x: 0, y: 0 } }, project, { mirrors: true })).toBeNull();
    expect(strokeMirror({ mirror: true, rulerZero: { x: 0, y: 0 } }, project, {})).toBeNull();
  });
  it('gives the axes and the clip', () => {
    const selection = { c0: 0, r0: 0, c1: 3, r1: 3 };
    const got = strokeMirror({ mirror: true, rulerZero: { x: 0, y: 0 }, selection }, project, { mirrors: true });
    expect(got.axes).toEqual({ x: 40, y: null });
    expect(got.clip.cell(2, 2)).toBe(true);
    expect(got.clip.cell(9, 2)).toBe(false);
  });
});

describe('withMirror', () => {
  it('restores the earlier mark after fn throws', () => {
    const project = { _mirror: 'before' };
    expect(withMirror(project, 'now', () => project._mirror)).toBe('now');
    expect(() => withMirror(project, 'x', () => { throw new Error('no'); })).toThrow('no');
    expect(project._mirror).toBe('before');
  });
});

describe('eachSide', () => {
  const run = (project, kind, items) => {
    const calls = [];
    eachSide(project, items, (i) => calls.push({ i, mirroring: project._mirroring }), kind);
    return calls;
  };
  it('steps once with no mark or while mirroring', () => {
    expect(run({ cols: 80, rows: 10 }, 'pixels', [{ x: 0, y: 0 }])).toHaveLength(1);
    expect(run({ cols: 80, rows: 10, _mirror: mark({ x: 40, y: null }), _mirroring: true }, 'pixels', [{ x: 0, y: 0 }])).toHaveLength(1);
  });
  it('steps for each copy with _mirroring set, then clears it', () => {
    const project = { cols: 80, rows: 20, _mirror: mark({ x: 40, y: 5 }) }; // rows: grid-pixel rows, 10 cell rows
    const calls = run(project, 'pixels', [{ x: 0, y: 0 }]);
    expect(calls.map((c) => c.mirroring)).toEqual([true, true, true, true]);
    expect(calls[1].i).toEqual([{ x: 79, y: 0 }]);
    expect(project._mirroring).toBe(false);
  });
  it('drops copies past the bottom: the grid\'s rows are grid pixels, two to a cell row', () => {
    const project = { cols: 80, rows: 10, _mirror: mark({ x: 40, y: 5 }) }; // 5 cell rows: the zero is the bottom edge
    expect(run(project, 'pixels', [{ x: 0, y: 0 }])).toHaveLength(2);
    expect(run(project, 'cells', [{ col: 0, row: 0, attrs: { char: 'a' } }])).toHaveLength(2);
  });
  it('mirrors cells', () => {
    const calls = run({ cols: 80, rows: 10, _mirror: mark({ x: 40, y: null }) }, 'cells', [{ col: 0, row: 0, attrs: { char: '(' } }]);
    expect(calls[1].i[0]).toMatchObject({ col: 79, attrs: { char: ')' } });
  });
});
