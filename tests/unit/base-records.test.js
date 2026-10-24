// The base layer's records: pinned characters, moved with the picture on a grid resize, and saved
// with the project. (Erasing the base is pixels plus a pinned space, so older files' erased cells
// are handed back for the store to apply.)
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { EMPTY_BASE, withPins, withoutPins, remapBaseRecords, serializeBase, deserializeBase } from '../../src/document/baseRecords.js';
import { resizeTransform } from '../../src/document/PaintLayer.js';

test("The base layer's records: pinned characters, moved with the picture on a grid resize, and saved with the project", async () => {
  const b = withPins(EMPTY_BASE, [{ col: 2, row: 1, char: 'Q' }, { col: 1, row: 1, char: ' ' }]);
  assert.equal(b.pins.get('2,1'), 'Q'); assert.equal(b.pins.get('1,1'), ' ');
  assert.deepEqual(Object.keys(b), ['pins']);                                         // pins are the only record
  assert.equal(withoutPins(b, [{ col: 2, row: 1 }]).pins.size, 1);
  assert.equal(withoutPins(b, [{ col: 9, row: 9 }]), b);
  assert.equal(withPins(b, [{ col: 2, row: 1, char: 'Q' }]), b);                      // the same pin again: same object
  assert.ok(Object.isFrozen(b));

  const t = resizeTransform({ dx: 0, dy: 0, dw: 40, dh: 50 }, { dx: 0, dy: 0, dw: 80, dh: 100 }); // the grid doubles
  const big = remapBaseRecords(b, t, 80, 100);
  assert.equal(big.pins.get('5,3'), 'Q'); assert.equal(big.pins.size, 2);            // a pin goes to the one cell over its centre
  assert.equal(remapBaseRecords(withPins(EMPTY_BASE, [{ col: 0, row: 0, char: 'Z' }]),
    resizeTransform({ dx: 0, dy: 0, dw: 40, dh: 50 }, { dx: -5, dy: 0, dw: 40, dh: 50 }), 40, 50).pins.size, 0); // pushed off the left: dropped
  assert.equal(remapBaseRecords(EMPTY_BASE, t, 80, 100), EMPTY_BASE);

  assert.equal(serializeBase(EMPTY_BASE), null);
  assert.deepEqual(serializeBase(b), { pins: [['2,1', 'Q'], ['1,1', ' ']] });
  assert.deepEqual(deserializeBase(serializeBase(b)), { records: b, erased: [] });
  for (const json of [undefined, null, {}]) assert.deepEqual(deserializeBase(json), { records: EMPTY_BASE, erased: [] });
  // Older files' erased cells come back as cells (a pin on the same cell wins); untrusted input is
  // skipped, not thrown on.
  const old = deserializeBase({ erased: ['1,1', '3,3', 'x', 5, '-1,2'], pins: [['3,3', 'A'], ['4,4', 'AB'], ['5,5', 5], 'bad', ['zz', 'B']] });
  assert.deepEqual(old.erased, [{ col: 1, row: 1 }]); assert.deepEqual([...old.records.pins], [['3,3', 'A']]);
  assert.deepEqual(deserializeBase({ erased: 5, pins: 'x' }), { records: EMPTY_BASE, erased: [] });
  assert.deepEqual([...deserializeBase({ pins: [['1,1', '☺\uFE0F'], ['2,2', '漢字']] }).records.pins.keys()], ['1,1']); // a cluster pins; two characters don't
});
