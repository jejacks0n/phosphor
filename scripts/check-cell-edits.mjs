// Authored cell map: merge/remove semantics, grid-position keys, (de)serialization and the
// migration of older index-keyed char edits. Run: node scripts/check-cell-edits.mjs
import assert from 'node:assert/strict';
import {
  withCellEdit, mergeEntry, withoutCells, parseKey, serializeCellEdits, deserializeCellEdits, migrateCharEdits,
  normalizeRect, rectCells, pasteBlock, updateRect,
  copyCellLayers, deleteCellLayers, selectionHit, clampOffset,
} from '../src/document/cellEdits.js';

const m0 = new Map();
const m1 = withCellEdit(m0, 3, 2, { char: 'A', fg: '#ffff55' });
assert.notEqual(m1, m0);
assert.deepEqual(m1.get('3,2'), { char: 'A', fg: '#ffff55' });
assert.ok(Object.isFrozen(m1.get('3,2')));
const m2 = withCellEdit(m1, 3, 2, { bg: '#0000aa' });                  // merges
assert.deepEqual(m2.get('3,2'), { char: 'A', fg: '#ffff55', bg: '#0000aa' });
const m3 = withCellEdit(m2, 3, 2, { fg: null, bg: undefined });        // null removes, undefined keeps
assert.deepEqual(m3.get('3,2'), { char: 'A', bg: '#0000aa' });
assert.equal(withCellEdit(m3, 3, 2, { char: 'A' }), m3);               // no change -> same instance
assert.equal(withCellEdit(m3, 3, 2, { char: null, bg: null }).has('3,2'), false); // emptied -> deleted
assert.equal(withoutCells(m3, [{ col: 9, row: 9 }]), m3);
assert.equal(withoutCells(m3, [{ col: 3, row: 2 }]).size, 0);
// keys are grid positions: an entry at col 120 survives any cols value
const far = withCellEdit(new Map(), 120, 0, { char: '#' });
assert.deepEqual(parseKey([...far.keys()][0]), { col: 120, row: 0 });
assert.deepEqual(deserializeCellEdits(serializeCellEdits(m2)), m2);
assert.equal(deserializeCellEdits(undefined).size, 0);
assert.deepEqual([...migrateCharEdits([[5, '#'], [12, '@']], 4)], [['1,1', { char: '#' }], ['0,3', { char: '@' }]]);
assert.equal(migrateCharEdits([[5, '#']], undefined).size, 0);          // no column count: nothing to place
assert.ok(Object.isFrozen(deserializeCellEdits([['0,0', { char: 'x' }]]).get('0,0')));
assert.equal(deserializeCellEdits([['0,0', {}], ['1,0', null]]).size, 0); // empty entries never exist
// Project files are untrusted: only one-character chars, #rrggbb colours and col,row keys load.
const loaded = deserializeCellEdits([
  ['0,0', { char: '<img src=x onerror=alert(1)>' }], ['1,0', { char: 'A', fg: 'javascript:x' }],
  ['2,0', { char: 'B', fg: '#ffffff', bg: '#000000' }], ['x,y', { char: 'C' }], ['3,0', { char: 5 }],
]);
assert.deepEqual([...loaded], [['1,0', { char: 'A' }], ['2,0', { char: 'B', fg: '#ffffff', bg: '#000000' }]]);
assert.equal(withCellEdit(m0, 0, 0, { char: null }), m0);               // no-op on a missing cell
// mergeEntry: the per-cell rule bulk operations share (null = no entry)
assert.equal(mergeEntry(undefined, { char: null }), null);
assert.deepEqual(mergeEntry({ char: 'a' }, { fg: '#000000' }), { char: 'a', fg: '#000000' });
const same = Object.freeze({ char: 'a' });
assert.equal(mergeEntry(same, { char: 'a' }), same);
// Block operations (selection): rects are inclusive and normalized; blocks are row-major.
assert.deepEqual(normalizeRect({ col: 5, row: 4 }, { col: 2, row: 1 }), { c0: 2, r0: 1, c1: 5, r1: 4 });
assert.deepEqual(rectCells({ c0: 1, r0: 0, c1: 2, r1: 1 }), [{ col: 1, row: 0 }, { col: 2, row: 0 }, { col: 1, row: 1 }, { col: 2, row: 1 }]);
const g = new Map([['0,0', { char: 'a' }], ['1,0', { char: 'b' }]]);
const blk = { w: 3, h: 1, entries: [{ char: 'a' }, { char: 'b' }, null] };
const pasted = pasteBlock(new Map(), blk, 78, 24, 80, 25);
assert.deepEqual([...pasted.keys()], ['78,24', '79,24']);                     // clipped to the grid
assert.equal(pasteBlock(new Map([['2,0', { char: 'z' }]]), blk, 0, 0, 80, 25).has('2,0'), false); // a null entry releases
assert.equal(pasteBlock(g, { w: 2, h: 1, entries: [{ char: 'a' }, { char: 'b' }] }, 0, 0, 80, 25), g); // same content: same map
assert.equal(pasteBlock(g, blk, 100, 0, 80, 25), g);                          // entirely off the grid
// updateRect: one Map copy for a whole rect, merging per cell (fill, bake)
const big = updateRect(new Map(), { c0: 0, r0: 0, c1: 299, r1: 149 }, () => ({ char: '#' }));
assert.equal(big.size, 300 * 150);
assert.equal(updateRect(big, { c0: 0, r0: 0, c1: 9, r1: 9 }, () => ({ char: '#' })), big); // nothing changed: same map
const t0 = performance.now();
updateRect(big, { c0: 0, r0: 0, c1: 299, r1: 149 }, (c, r, old) => ({ ...old, fg: '#ffffff' }));
assert.ok(performance.now() - t0 < 250, 'whole-grid update should be one pass');
// Layer-aware copy and delete (the Select tool's layer toggles).
const L = (image, cells, paint = false) => ({ image, cells, paint });
const img = () => ({ char: '#', fg: '#111111', bg: '#222222' });
const m = new Map([['1,0', Object.freeze({ char: 'A' })]]);
const r = { c0: 0, r0: 0, c1: 1, r1: 0 };
assert.deepEqual(copyCellLayers(m, r, L(true, true), img), [img(), { char: 'A', fg: '#111111', bg: '#222222' }]);
assert.deepEqual(copyCellLayers(m, r, L(true, false), img), [img(), img()]);
assert.deepEqual(copyCellLayers(m, r, L(false, true), img), [null, { char: 'A' }]);
assert.deepEqual(copyCellLayers(m, r, L(false, false), img), [null, null]);
assert.ok(copyCellLayers(m, r, L(true, true), img).every(Object.isFrozen));
assert.equal(deleteCellLayers(m, r, L(false, false)), m);
assert.equal(deleteCellLayers(m, r, L(false, true)).size, 0);
// The base layer is erased through its own records (baseRecords.js), not with blank edit cells.
assert.equal(deleteCellLayers(m, r, L(true, false)), m);
assert.equal(deleteCellLayers(m, r, L(true, true)).size, 0);
// The selection's border band: ½ column / ¼ row outside, ¼ column / ⅛ row inside.
const sel = { c0: 2, r0: 2, c1: 5, r1: 4 }; // edges x 2..6, y 2..5
assert.equal(selectionHit(sel, { col: 4, row: 3.5 }), 'inside');
assert.equal(selectionHit(sel, { col: 1.6, row: 3.5 }), 'border');   // just outside the left edge
assert.equal(selectionHit(sel, { col: 2.2, row: 3.5 }), 'border');   // just inside it
assert.equal(selectionHit(sel, { col: 4, row: 5.2 }), 'border');     // just below the bottom edge
assert.equal(selectionHit(sel, { col: 4, row: 5.3 }), 'outside');
assert.equal(selectionHit(sel, { col: 1.4, row: 3.5 }), 'outside');
assert.equal(selectionHit(sel, { col: 2.4, row: 3.5 }), 'inside');   // past the ¼-column inner band
assert.equal(selectionHit(sel, { col: 4, row: 2.1 }), 'border');     // within the ⅛-row inner band at the top
assert.equal(selectionHit(sel, { col: 4, row: 2.2 }), 'inside');
assert.equal(selectionHit({ c0: 0, r0: 0, c1: 0, r1: 0 }, { col: 0.5, row: 0.5 }), 'inside'); // a 1-cell selection still has an inside
// A nudge or outline drag stops at the grid's edge instead of pushing the selection off it.
assert.deepEqual(clampOffset({ c0: 30, r0: 5, c1: 39, r1: 9 }, 1, 0, 40, 25), { dc: 0, dr: 0 });  // already at the right edge
assert.deepEqual(clampOffset({ c0: 30, r0: 5, c1: 38, r1: 9 }, 5, 0, 40, 25), { dc: 1, dr: 0 });
assert.deepEqual(clampOffset({ c0: 0, r0: 0, c1: 3, r1: 3 }, -2, -1, 40, 25), { dc: 0, dr: 0 });
assert.deepEqual(clampOffset({ c0: 2, r0: 2, c1: 3, r1: 3 }, 0, 30, 40, 25), { dc: 0, dr: 21 });
console.log('cell edits ok');
