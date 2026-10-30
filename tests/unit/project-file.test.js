// .phosphor files as readProject reads them: every older layout the loader migrates, and hostile
// files (untrusted input): each either fails with an error or drops exactly the bad part.
import { test, expect } from 'vitest';
import { readProject } from '../../src/document/projectIO.js';
import { buildProjectFile } from '../support/projectFile.js';
import { writePng } from '../support/png.js';

const image = writePng({ width: 2, height: 2, pixels: Array(16).fill(255) });
const paint = writePng({ width: 2, height: 2, pixels: [255, 0, 0, 255, ...Array(12).fill(0)] });
const read = (bytes) => readProject(new File([bytes], 'x.phosphor'));
const project = (json, extra = {}) => buildProjectFile({ json, image, ...extra });
const BASE = { cols: 4, rows: 4, chars: 'ab', seed: 's' };

test('the current layout: edit cells, pins, paint and base pixels', async () => {
  const bytes = buildProjectFile({
    json: { ...BASE, hasPaint: true, cellEdits: [['1,0', { char: '漢', fg: '#ffffff' }], ['3,1', { char: '👍🏽' }]], base: { pins: [['0,0', ' ']] }, baseLength: paint.length },
    image, paint, base: paint,
  });
  const p = await read(bytes);
  expect([...p.editCells.keys()]).toEqual(['1,0', '3,1']);
  expect(p.baseRecords.pins.get('0,0')).toBe(' ');
  expect(p.paintBuffer.byteLength).toBe(paint.length);
  expect(p.baseBuffer.byteLength).toBe(paint.length);
  expect(p.migrated).toBe(false);
});

test('before the cell layer: charEditMap (cell index -> char) becomes edit cells', async () => {
  const p = await read(project({ ...BASE, charEditMap: [[1, 'A'], [5, 'B']] }));
  expect(Object.fromEntries([...p.editCells].map(([k, v]) => [k, v.char]))).toEqual({ '1,0': 'A', '1,1': 'B' });
  expect(p.migrated).toBe(true);
});

test('before hasPaint: a paint section means paint', async () => {
  expect((await read(project({ ...BASE, cellEdits: [] }, { paint }))).paintBuffer.byteLength).toBe(paint.length);
  expect((await read(project({ ...BASE, cellEdits: [], hasPaint: false }, { paint }))).paintBuffer).toBe(null);
});

test('before the base had its own pixels: erased cells come back to be erased', async () => {
  const p = await read(project({ ...BASE, cellEdits: [], base: { erased: ['1,1', '2,2'] } }));
  expect(p.erasedCells).toEqual([{ col: 1, row: 1 }, { col: 2, row: 2 }]);
});

test('an old stored charMode is dropped', async () => {
  expect((await read(project({ ...BASE, cellEdits: [], charMode: 'brightness' }))).settings.charMode).toBeUndefined();
});

test('hostile files fail with an error', async () => {
  await expect(read(new TextEncoder().encode('NOTPHOSP' + 'x'.repeat(40)))).rejects.toThrow(/Not a valid Phosphor project file/);
  await expect(read(new TextEncoder().encode('PHOSPHOR'))).rejects.toThrow(); // truncated after the header
  const badJson = buildProjectFile({ json: {}, image });
  const text = new TextEncoder().encode('{"cols":4,'); // replace the JSON with a broken one of the same length
  badJson.set(text.subarray(0, Math.min(text.length, 2)), 20);
  await expect(read(badJson)).rejects.toThrow();
  const lying = project({ ...BASE, cellEdits: [] });
  new DataView(lying.buffer).setUint32(8, 1e6, true); // a JSON length far past the end
  await expect(read(lying)).rejects.toThrow();
});

test('hostile fields are dropped, and only those', async () => {
  for (const fit of [{ dx: 0, dy: 0, dw: NaN, dh: 4 }, { dx: 0, dy: 0, dw: 1e9, dh: 4 }, { dx: 0, dy: 0, dw: -4, dh: 4 }, 'x']) {
    const p = await read(project({ ...BASE, cellEdits: [], fit }));
    expect(p.settings.fit, JSON.stringify(fit)).toBeUndefined();
    expect(p.settings.cols).toBe(4);
  }
  for (const paintScale of [0, 1.5, 1e9, '2']) {
    expect((await read(project({ ...BASE, cellEdits: [], paintScale }))).settings.paintScale, String(paintScale)).toBeUndefined();
  }
  expect((await read(project({ ...BASE, cellEdits: [], imageIsWorkingCopy: 'yes' }))).settings.imageIsWorkingCopy).toBeUndefined();
  expect((await read(project({ ...BASE, cellEdits: [], imageIsWorkingCopy: true }))).settings.imageIsWorkingCopy).toBe(true);
  // What autosave knows a document by isn't the file's to say.
  const { settings } = await read(project({ ...BASE, cellEdits: [], documentId: 'someone-elses', savedToFile: false }));
  expect(settings).not.toHaveProperty('documentId');
  expect(settings).not.toHaveProperty('savedToFile');
  const cells = (await read(project({ ...BASE, cellEdits: [['0,0', { char: 'ab' }], ['1,0', { char: 'Z', fg: 'red' }], ['x', { char: 'Q' }], ['2,0', { char: '́' }]] }))).editCells;
  expect(Object.fromEntries(cells)).toEqual({ '1,0': { char: 'Z' } }); // a bad color is dropped, the char kept
});
