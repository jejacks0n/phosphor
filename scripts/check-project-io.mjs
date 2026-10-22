// .phosphor read/write: round-trips, and reads older files (examples/) the same way the app always has.
// Run: node scripts/check-project-io.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readProject, writeProject, PROJECT_EXTENSION } from '../src/document/projectIO.js';

assert.equal(PROJECT_EXTENSION, '.phosphor');

const bytes = (n, seed) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 255).buffer;
const imageBuffer = bytes(100, 1);
const paintBlob = new Blob([bytes(40, 7)], { type: 'image/png' });
const charEdits = new Map([[5, '#'], [12, '@']]);

const blob = await writeProject({ settings: { cols: 80, rows: 50, hasPaint: true }, imageBuffer, paintBlob, charEdits });
const back = await readProject(blob);
assert.deepEqual(back.settings, { cols: 80, rows: 50 });              // hasPaint/charEditMap/charMode are not settings
assert.deepEqual([...new Uint8Array(back.imageBuffer)], [...new Uint8Array(imageBuffer)]);
assert.deepEqual([...new Uint8Array(back.paintBuffer)], [...new Uint8Array(await paintBlob.arrayBuffer())]);
assert.deepEqual([...back.charEdits], [[5, '#'], [12, '@']]);

const noPaint = await readProject(await writeProject({ settings: { cols: 1, hasPaint: false }, imageBuffer, paintBlob: null, charEdits: new Map() }));
assert.equal(noPaint.paintBuffer, null);

// Older files: aeonflux1 has paint (no hasPaint key -> section presence decides); aeonflux3 says hasPaint:false.
const example = async (name) => readProject(new Blob([await readFile(new URL(`../examples/${name}`, import.meta.url))]));
const a1 = await example('aeonflux1.phosphor');
assert.ok(a1.paintBuffer && a1.paintBuffer.byteLength > 0);
assert.equal(a1.settings.cols, 80);
assert.ok(!('charMode' in a1.settings) && !('charEditMap' in a1.settings) && !('hasPaint' in a1.settings));
assert.equal((await example('aeonflux3.phosphor')).paintBuffer, null);

await assert.rejects(readProject(new Blob([new Uint8Array(32)])), /Not a valid Phosphor project file/);
console.log('project io ok');
