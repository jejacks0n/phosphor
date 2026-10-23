// The base layer's records: erased cells and pinned characters (erasing drops a pin, pinning
// un-erases), moved with the picture on a grid resize, and saved with the project.
// Run: node scripts/check-base-records.mjs
import assert from 'node:assert/strict';
import { EMPTY_BASE, withErased, withPins, withoutPins, remapBaseRecords, serializeBase, deserializeBase } from '../src/document/baseRecords.js';
import { resizeTransform } from '../src/document/PaintLayer.js';

const a = withErased(EMPTY_BASE, [{ col: 1, row: 1 }, { col: 2, row: 1 }]);
assert.deepEqual([...a.erased], ['1,1', '2,1']);
assert.equal(withErased(a, [{ col: 1, row: 1 }]), a);                          // nothing changed: same object
const b = withPins(a, [{ col: 2, row: 1, char: 'Q' }]);
assert.deepEqual([...b.erased], ['1,1']); assert.equal(b.pins.get('2,1'), 'Q');  // pinning un-erases
assert.equal(withErased(b, [{ col: 2, row: 1 }]).pins.has('2,1'), false);        // erasing drops the pin
assert.equal(withoutPins(b, [{ col: 2, row: 1 }]).pins.size, 0);
assert.equal(withoutPins(b, [{ col: 9, row: 9 }]), b);
assert.ok(Object.isFrozen(b));

const t = resizeTransform({ dx: 0, dy: 0, dw: 40, dh: 50 }, { dx: 0, dy: 0, dw: 80, dh: 100 }); // the grid doubles
const big = remapBaseRecords(b, t, 80, 100);
assert.deepEqual([...big.erased].sort(), ['2,2', '2,3', '3,2', '3,3']);           // an erased cell covers its whole area, like paint
assert.equal(big.pins.get('5,3'), 'Q'); assert.equal(big.pins.size, 1);          // a pin goes to the one cell over its centre
const small = remapBaseRecords(withPins(withErased(EMPTY_BASE, [{ col: 0, row: 0 }]), [{ col: 1, row: 0, char: 'Z' }]),
  resizeTransform({ dx: 0, dy: 0, dw: 40, dh: 50 }, { dx: 0, dy: 0, dw: 20, dh: 25 }), 20, 25);
assert.deepEqual([...small.erased], []); assert.equal(small.pins.get('0,0'), 'Z');  // halved: the new cell's centre isn't on the erased one
const block = withErased(EMPTY_BASE, [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }]);
assert.deepEqual([...remapBaseRecords(block, resizeTransform({ dx: 0, dy: 0, dw: 40, dh: 50 }, { dx: 0, dy: 0, dw: 20, dh: 25 }), 20, 25).erased], ['0,0']); // a 2x2 block halves to one cell
assert.equal(remapBaseRecords(withErased(EMPTY_BASE, [{ col: 0, row: 0 }]), resizeTransform({ dx: 0, dy: 0, dw: 40, dh: 50 }, { dx: -5, dy: 0, dw: 40, dh: 50 }), 40, 50).erased.size, 0); // pushed off the left: dropped
assert.equal(remapBaseRecords(withErased(EMPTY_BASE, [{ col: 39, row: 24 }]),
  resizeTransform({ dx: 0, dy: 0, dw: 40, dh: 50 }, { dx: -10, dy: 0, dw: 40, dh: 50 }), 20, 50).erased.size, 0); // lands at col 29 of 20: dropped
assert.equal(remapBaseRecords(EMPTY_BASE, t, 80, 100), EMPTY_BASE);

assert.equal(serializeBase(EMPTY_BASE), null);
assert.deepEqual(deserializeBase(serializeBase(b)), b);
assert.equal(deserializeBase(undefined), EMPTY_BASE);
assert.equal(deserializeBase(null), EMPTY_BASE);
assert.equal(deserializeBase({}), EMPTY_BASE);
// Project files are untrusted: malformed records are skipped, not thrown on.
const odd = deserializeBase({ erased: ['1,1', 'x', 5, '-1,2'], pins: [['2,2', 'A'], ['3,3', 'AB'], ['4,4', 5], 'bad', ['zz', 'B']] });
assert.deepEqual([...odd.erased], ['1,1']); assert.deepEqual([...odd.pins], [['2,2', 'A']]);
assert.equal(deserializeBase({ erased: 5, pins: 'x' }), EMPTY_BASE);
assert.equal(withPins(b, [{ col: 2, row: 1, char: 'Q' }]), b);                      // the same pin again: same object
console.log('base records ok');
