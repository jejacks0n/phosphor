// The base layer's records: pinned characters, moved with the picture on a grid resize, and saved
// with the project. (Erasing the base is pixels plus a pinned space, so older files' erased cells
// are handed back for the store to apply.)
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { EMPTY_BASE, withPins, withoutPins, movePins, remapBaseRecords, serializeBase, deserializeBase, isCharPin } from '../../src/document/baseRecords.js';
import { resizeTransform } from '../../src/document/PaintLayer.js';

test("The base layer's records: pinned characters, moved with the picture on a grid resize, and saved with the project", async () => {
  const b = withPins(EMPTY_BASE, [{ col: 2, row: 1, char: 'Q' }, { col: 1, row: 1, char: ' ' }]);
  assert.equal(b.pins.get('2,1'), 'Q'); assert.equal(b.pins.get('1,1'), ' ');
  assert.deepEqual(Object.keys(b), ['pins', 'indexes', 'chars']);                     // pins, their colors' indexes, the ▄ that are characters
  assert.equal(withoutPins(b, [{ col: 2, row: 1 }]).pins.size, 1);
  assert.equal(withoutPins(b, [{ col: 9, row: 9 }]), b);
  assert.equal(withPins(b, [{ col: 2, row: 1, char: 'Q' }]), b);                      // the same pin again: same object
  assert.ok(Object.isFrozen(b));

  const t = resizeTransform({ dx: 0, dy: 0, dw: 40, dh: 50 }, { dx: 0, dy: 0, dw: 80, dh: 100 }); // the grid doubles
  const big = remapBaseRecords(b, t, 80, 100);
  assert.equal(big.pins.get('5,3'), 'Q'); assert.equal(big.pins.size, 2);            // a pin goes to the one cell over its center
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

// A pin's 256-color indexes (16 and 231, which 0 and 15 share the colors of) go with it: set and cleared with it, moved on
// a resize, saved, and read back only as whole numbers under 256 beside a pin. A file from before them has none.
test("The base layer's records: a pin's 256-color indexes go where it goes", () => {
  const b = withPins(EMPTY_BASE, [{ col: 0, row: 0, char: 'A', fgIndex: 16 }, { col: 1, row: 0, char: 'B', fgIndex: 15, bgIndex: 231 }, { col: 2, row: 0, char: 'C' }]);
  assert.deepEqual([...b.indexes], [['0,0', { fgIndex: 16 }], ['1,0', { fgIndex: 15, bgIndex: 231 }]]);
  assert.equal(withPins(b, [{ col: 0, row: 0, char: 'A', fgIndex: 16 }]), b);          // the same again: same object
  const changed = withPins(b, [{ col: 0, row: 0, char: 'A' }]);                       // only the index changes: a change
  assert.notEqual(changed, b);
  assert.deepEqual([...changed.indexes.keys()], ['1,0']);
  assert.deepEqual([...withoutPins(b, [{ col: 1, row: 0 }]).indexes.keys()], ['0,0']);

  const t = resizeTransform({ dx: 0, dy: 0, dw: 40, dh: 50 }, { dx: 0, dy: 0, dw: 80, dh: 100 });
  assert.deepEqual([...remapBaseRecords(b, t, 80, 100).indexes], [['1,1', { fgIndex: 16 }], ['3,1', { fgIndex: 15, bgIndex: 231 }]]);

  assert.deepEqual(serializeBase(b), { pins: [['0,0', 'A'], ['1,0', 'B'], ['2,0', 'C']], indexes: [['0,0', { fgIndex: 16 }], ['1,0', { fgIndex: 15, bgIndex: 231 }]] });
  assert.deepEqual(deserializeBase(serializeBase(b)), { records: b, erased: [] });
  assert.equal(deserializeBase({ pins: [['0,0', 'A']] }).records.indexes.size, 0);    // from before indexes
  const read = deserializeBase({ pins: [['0,0', 'A'], ['1,0', 'B']], indexes: [['0,0', { fgIndex: 256, bgIndex: 16 }], ['1,0', { fgIndex: 1.5 }], ['5,5', { fgIndex: 16 }], ['1,0'], 'x', 7] });
  assert.deepEqual([...read.records.indexes], [['0,0', { bgIndex: 16 }]]);
  assert.ok(Object.isFrozen(read.records.indexes.get('0,0')));
});

// docs/model.md R15: a ▄ pin is its cell's two pixels unless it's marked a character (chars), as a laid or typed ▄ is. The
// mark is set and cleared with glyph, kept by a ▄ written over a marked ▄ with glyph left out (a recolor, a flip), dropped by
// any other character, and goes where the pin goes: cleared, moved, remapped, saved, and read back only beside a ▄ pin.
test("The base layer's records: R15, a ▄ pin marked a character goes where the pin goes", () => {
  const b = withPins(EMPTY_BASE, [{ col: 0, row: 0, char: '▄', glyph: true }, { col: 1, row: 0, char: '▄' }, { col: 2, row: 0, char: 'A', glyph: true }]);
  assert.deepEqual([...b.chars.keys()], ['0,0']);                                       // a pixels ▄ and a letter aren't marked
  assert.ok(isCharPin(b, '0,0')); assert.ok(!isCharPin(b, '1,0'));
  assert.equal(withPins(b, [{ col: 0, row: 0, char: '▄' }]), b);                       // a ▄ over it, glyph left out: kept, same object
  assert.equal(withPins(b, [{ col: 0, row: 0, char: '▄', glyph: true }]), b);
  assert.equal(withPins(b, [{ col: 0, row: 0, char: '▄', glyph: false }]).chars.size, 0); // its pixels now
  assert.ok(isCharPin(withPins(b, [{ col: 1, row: 0, char: '▄', glyph: true }]), '1,0'));
  const letter = withPins(b, [{ col: 0, row: 0, char: 'B' }]);                          // another character: no mark
  assert.equal(letter.chars.size, 0);
  assert.ok(!isCharPin(withPins(letter, [{ col: 0, row: 0, char: '▄' }]), '0,0'));
  assert.equal(withoutPins(b, [{ col: 0, row: 0 }]).chars.size, 0);

  assert.deepEqual([...movePins(b, [{ span: { c0: 0, c1: 5, r0: 0, r1: 0 }, from: { c0: 0, c1: 4, r0: 0, r1: 0 }, dx: 1, dy: 0 }]).chars.keys()], ['1,0']);
  const t = resizeTransform({ dx: 0, dy: 0, dw: 40, dh: 50 }, { dx: 0, dy: 0, dw: 80, dh: 100 });
  assert.deepEqual([...remapBaseRecords(b, t, 80, 100).chars.keys()], ['1,1']);

  assert.deepEqual(serializeBase(b).chars, ['0,0']);
  assert.equal(serializeBase(withPins(EMPTY_BASE, [{ col: 0, row: 0, char: '▄' }])).chars, undefined); // none: not written
  assert.deepEqual(deserializeBase(serializeBase(b)), { records: b, erased: [] });
  const read = deserializeBase({ pins: [['0,0', '▄'], ['1,0', 'A']], chars: ['0,0', '1,0', '5,5', 7, null] });
  assert.deepEqual([...read.records.chars.keys()], ['0,0']);                             // only beside a ▄ pin
  assert.equal(deserializeBase({ pins: [['0,0', '▄']] }).records.chars.size, 0);        // from before the mark: pixels
});
