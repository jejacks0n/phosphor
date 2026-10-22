// Authored cell map: merge/remove semantics, grid-position keys, (de)serialization and the
// migration of older index-keyed char edits. Run: node scripts/check-cell-edits.mjs
import assert from 'node:assert/strict';
import {
  withCellEdit, mergeEntry, withoutCells, parseKey, serializeCellEdits, deserializeCellEdits, migrateCharEdits,
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
assert.equal(withCellEdit(m0, 0, 0, { char: null }), m0);               // no-op on a missing cell
// mergeEntry: the per-cell rule bulk operations share (null = no entry)
assert.equal(mergeEntry(undefined, { char: null }), null);
assert.deepEqual(mergeEntry({ char: 'a' }, { fg: '#000000' }), { char: 'a', fg: '#000000' });
const same = Object.freeze({ char: 'a' });
assert.equal(mergeEntry(same, { char: 'a' }), same);
console.log('cell edits ok');
