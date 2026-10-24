// .phosphor read/write: round-trips, and reads older files (examples/) the same way the app always has.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readProject, writeProject, PROJECT_EXTENSION } from '../../src/document/projectIO.js';
import { EMPTY_BASE, withPins } from '../../src/document/baseRecords.js';

test('.phosphor read/write: round-trips, and reads older files (examples/) the same way the app always has', async () => {
  assert.equal(PROJECT_EXTENSION, '.phosphor');

  const bytes = (n, seed) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 255).buffer;
  const imageBuffer = bytes(100, 1);
  const fileOf = (json) => { const b = new TextEncoder().encode(JSON.stringify(json)); return new Blob([new TextEncoder().encode('PHOSPHOR'), new Uint32Array([b.byteLength, 0, 0]), b]); };
  const paintBlob = new Blob([bytes(40, 7)], { type: 'image/png' });
  const editCells = new Map([['3,2', { char: 'A', fg: '#ffff55' }]]);

  const blob = await writeProject({ settings: { cols: 80, rows: 50, hasPaint: true }, imageBuffer, paintBlob, editCells });
  const back = await readProject(blob);
  assert.deepEqual(back.settings, { cols: 80, rows: 50 });              // hasPaint/cellEdits/charMode (file keys) are not settings
  assert.deepEqual([...new Uint8Array(back.imageBuffer)], [...new Uint8Array(imageBuffer)]);
  assert.deepEqual([...new Uint8Array(back.paintBuffer)], [...new Uint8Array(await paintBlob.arrayBuffer())]);
  assert.deepEqual([...back.editCells], [['3,2', { char: 'A', fg: '#ffff55' }]]);
  assert.equal(back.migrated, false);
  assert.equal(back.baseRecords, EMPTY_BASE);                             // nothing pinned: none saved
  assert.deepEqual(back.erasedCells, []);

  // The base layer's pinned characters round-trip; older files have none.
  const baseRecords = withPins(EMPTY_BASE, [{ col: 4, row: 2, char: 'Q' }]);
  const withBase = await readProject(await writeProject({ settings: { cols: 80 }, imageBuffer, paintBlob: null, editCells, baseRecords }));
  assert.deepEqual(withBase.baseRecords, baseRecords);
  assert.ok(!('base' in withBase.settings));
  assert.equal(withBase.baseBuffer, null);                                 // no base pixels: none saved
  // The base layer's own pixels round-trip as a section after the paint.
  const basePng = new Blob([bytes(24, 3)], { type: 'image/png' });
  const withPixels = await readProject(await writeProject({ settings: { cols: 80 }, imageBuffer, paintBlob, baseBlob: basePng, editCells }));
  assert.deepEqual([...new Uint8Array(withPixels.baseBuffer)], [...new Uint8Array(await basePng.arrayBuffer())]);
  assert.deepEqual([...new Uint8Array(withPixels.paintBuffer)], [...new Uint8Array(await paintBlob.arrayBuffer())]);
  assert.ok(!('baseLength' in withPixels.settings));
  // Files from before the base had its own pixels kept erased cells as a record: they come back as cells to erase.
  const erasedFile = await readProject(fileOf({ cols: 4, base: { erased: ['1,1'], pins: [['2,0', 'Q']] } }));
  assert.deepEqual(erasedFile.erasedCells, [{ col: 1, row: 1 }]);
  assert.deepEqual([...erasedFile.baseRecords.pins], [['2,0', 'Q']]);

  const noPaint = await readProject(await writeProject({ settings: { cols: 1, hasPaint: false }, imageBuffer, paintBlob: null, editCells: new Map() }));
  assert.equal(noPaint.paintBuffer, null);

  // Older files: aeonflux1 has paint (no hasPaint key -> section presence decides); aeonflux3 says hasPaint:false.
  const example = async (name) => readProject(new Blob([await readFile(new URL(`../../examples/${name}`, import.meta.url))]));
  const a1 = await example('aeonflux1.phosphor');
  assert.ok(a1.paintBuffer && a1.paintBuffer.byteLength > 0);
  assert.equal(a1.settings.cols, 80);
  assert.ok(!('charMode' in a1.settings) && !('charEditMap' in a1.settings) && !('hasPaint' in a1.settings));
  assert.equal((await example('aeonflux3.phosphor')).paintBuffer, null);
  assert.ok(a1.editCells instanceof Map);
  assert.equal(a1.baseRecords, EMPTY_BASE);

  // Files written before the cell layer stored char edits keyed by cell index at the file's column count.
  const oldJson = new TextEncoder().encode(JSON.stringify({ cols: 4, charEditMap: [[5, '#']] }));
  const old = await readProject(new Blob([new TextEncoder().encode('PHOSPHOR'), new Uint32Array([oldJson.byteLength, 0, 0]), oldJson]));
  assert.deepEqual([...old.editCells], [['1,1', { char: '#' }]]);
  assert.equal(old.migrated, true);
  assert.deepEqual(old.settings, { cols: 4 });
  const both = await readProject(fileOf({ cols: 4, cellEdits: [['0,0', { char: 'x' }]], charEditMap: [[5, '#']] })); // the file's key is cellEdits
  assert.deepEqual([...both.editCells], [['0,0', { char: 'x' }]]);       // the cell layer wins over older char edits
  assert.equal(both.migrated, false);
  assert.equal((await readProject(fileOf({ charEditMap: [[5, '#']] }))).migrated, false); // nothing could be placed

  await assert.rejects(readProject(new Blob([new Uint8Array(32)])), /Not a valid Phosphor project file/);
});
