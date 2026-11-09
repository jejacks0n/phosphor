// .phosphor read/write: round-trips, and reads older files (examples/) the same way the app always has.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readProject, writeProject, fileStem, timestamped, isProjectFile, PROJECT_EXTENSION } from '../../src/document/projectIO.js';
import { EMPTY_BASE, withPins } from '../../src/document/baseRecords.js';
import { MAX_COLS, maxRowsBeside } from '../../src/lib/Cells.js';

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

  // Untrusted: a grid size from a hand-edited file is brought within the limits; one that fits is kept.
  assert.deepEqual((await readProject(fileOf({ cols: 10_000, rows: 10_000 }))).settings, { cols: MAX_COLS, rows: maxRowsBeside(MAX_COLS) });
  assert.deepEqual((await readProject(fileOf({ cols: 80, rows: 2000 }))).settings, { cols: 80, rows: 2000 });
  assert.deepEqual((await readProject(fileOf({ cols: 'x', rows: -4 }))).settings, { cols: 1, rows: 1 });

  await assert.rejects(readProject(new Blob([new Uint8Array(32)])), /Not a valid Phosphor project file/);
});

test('A typed filename: trimmed, its extension (if typed) dropped, slashes made dashes', () => {
  assert.equal(fileStem('  my art  ', 'ans'), 'my art');
  assert.equal(fileStem('my art.ans', 'ans'), 'my art');
  assert.equal(fileStem('my art.ANS', 'ans'), 'my art');
  assert.equal(fileStem('scene.phosphor', 'phosphor'), 'scene');
  assert.equal(fileStem('v1.2', 'ans'), 'v1.2');        // a dot that isn't the extension stays
  assert.equal(fileStem('a/b\\c', 'ans'), 'a-b-c');
  assert.equal(fileStem('   ', 'ans'), '');
  assert.equal(fileStem('.ans', 'ans'), '');
});

// Every way in (the file input, a drop, a project opened over another) asks isProjectFile.
test('a project is a file named .phosphor, in any case: ART.PHOSPHOR opens', () => {
  assert.ok(isProjectFile('ART.PHOSPHOR'));
  assert.ok(isProjectFile('art.Phosphor'));
  assert.ok(isProjectFile('live-main.phosphor'));
  assert.ok(!isProjectFile('art.phosphor.png'));
  assert.ok(!isProjectFile('art.ans'));
});

test('the name offered has the local time, in place of any it had', () => {
  const at = new Date(2026, 0, 2, 3, 4, 5);
  assert.equal(timestamped('art', at), 'art-20260102-030405');
  assert.equal(timestamped('art-20251231-235959', at), 'art-20260102-030405');
  assert.equal(timestamped('art-2', at), 'art-2-20260102-030405');   // only a whole time goes
  assert.equal(timestamped('v1.2', at), 'v1.2-20260102-030405');
});

test('a project file keeps its shapes, and a file with a bad shape opens without shapes', async () => {
  const { rectShape } = await import('../../src/document/shapes.js');
  const imageBuffer = new ArrayBuffer(4), shape = rectShape(1, 2, 9, 7, { fill: '#ff0000', stroke: '#00ff00', width: 2 });
  const shapes = new Map([['v:abc', shape]]);
  const back = await readProject(await writeProject({ settings: { cols: 20 }, imageBuffer, paintBlob: null, editCells: new Map(), shapes }));
  assert.deepEqual([...back.shapes], [['v:abc', shape]]);
  const none = await readProject(await writeProject({ settings: { cols: 20 }, imageBuffer, paintBlob: null, editCells: new Map() }));
  assert.equal(none.shapes.size, 0);
  const fileOf = (json) => { const b = new TextEncoder().encode(JSON.stringify(json)); return new Blob([new TextEncoder().encode('PHOSPHOR'), new Uint32Array([b.byteLength, 0, 0]), b]); };
  const bad = await readProject(fileOf({ cols: 4, shapes: [['v:abc', { ...shape, width: 'wide' }]] }));
  assert.equal(bad.shapes.size, 0);
  assert.equal((await readProject(fileOf({ cols: 4, shapes: 'x' }))).shapes.size, 0);
});

test('.phosphor read/write: the layers key round-trips, and is not a setting', async () => {
  const imageBuffer = new Uint8Array(8).buffer;
  const layers = { edit: { name: 'Logo', hidden: true } };
  const back = await readProject(await writeProject({ settings: { cols: 80 }, imageBuffer, paintBlob: null, editCells: new Map(), layers }));
  assert.deepEqual(back.layers, layers);
  assert.deepEqual(back.settings, { cols: 80 });
  const none = await readProject(await writeProject({ settings: { cols: 80 }, imageBuffer, paintBlob: null, editCells: new Map(), layers: null }));
  assert.equal(none.layers, undefined); // a file without changes is as it was
});

// A drawing with more layers than the old form has: the stack form, under its own magic word, so older copies refuse it.
const STACK = [
  { id: 'base', kind: 'cells', n: 1, name: null, hidden: false },
  { id: 'edit', kind: 'cells', n: 1, name: null, hidden: false },
  { id: 'vector', kind: 'vector', n: 1, name: null, hidden: false },
  { id: 'L2', kind: 'cells', n: 2, name: 'Logo', hidden: true },
];
const magicOf = async (blob) => new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 8));
const pngOf = (n, seed) => new Blob([Uint8Array.from({ length: n }, (_, i) => (i * 17 + seed) & 255)], { type: 'image/png' });
const stackFile = (stack, more = {}) => writeProject({
  settings: { cols: 20, rows: 20 }, imageBuffer: new ArrayBuffer(4), stack: stack.map((layer) => ({ ...layer, editCells: new Map() })), ...more,
});
// A stack file's JSON as written, changed by edit, and written back.
async function editedStack(edit) {
  const buffer = await (await stackFile(STACK)).arrayBuffer(), view = new DataView(buffer);
  const jsonLen = view.getUint32(8, true);
  const json = JSON.parse(new TextDecoder().decode(buffer.slice(20, 20 + jsonLen)));
  edit(json);
  const b = new TextEncoder().encode(JSON.stringify(json));
  return new Blob([buffer.slice(0, 8), new Uint32Array([b.byteLength, view.getUint32(12, true), view.getUint32(16, true)]), b, buffer.slice(20 + jsonLen)]);
}

test('a stack round-trips', async () => {
  const { rectShape } = await import('../../src/document/shapes.js');
  const shapes = new Map([['v:a', rectShape(1, 1, 5, 5, { fill: '#ff0000' })]]);
  const editPaint = pngOf(30, 1), logoPaint = pngOf(50, 2), basePng = pngOf(12, 3);
  const animation = { frames: [{ kind: 'blank', hold: 0, changes: [['1,1', { char: 'a' }, 0, 0], ['L2:2,2', { char: 'b' }, 0, 0]], stays: ['L2:2,2'] }], frame: 0, fps: 10 };
  const back = await readProject(await writeProject({
    settings: { cols: 20, rows: 20, hasPaint: true, paintScale: 2 }, imageBuffer: new Uint8Array([9, 8, 7]).buffer, baseBlob: basePng, shapes, animation,
    stack: [
      { ...STACK[0] },
      { ...STACK[1], editCells: new Map([['1,1', { char: 'E' }]]), paintBlob: editPaint },
      { ...STACK[2] },
      { ...STACK[3], editCells: new Map([['2,2', { char: 'L' }]]), paintBlob: logoPaint },
    ],
  }));
  assert.deepEqual(back.stack, STACK);
  assert.equal(back.layers, undefined);
  assert.deepEqual([...back.layerParts.get('edit').editCells], [['1,1', { char: 'E' }]]);
  assert.deepEqual([...back.layerParts.get('L2').editCells], [['2,2', { char: 'L' }]]);
  assert.equal(back.layerParts.get('edit').paintBuffer.byteLength, 30);
  assert.equal(back.layerParts.get('L2').paintBuffer.byteLength, 50);
  assert.deepEqual([...new Uint8Array(back.layerParts.get('L2').paintBuffer)], [...new Uint8Array(await logoPaint.arrayBuffer())]);
  assert.deepEqual([...new Uint8Array(back.baseBuffer)], [...new Uint8Array(await basePng.arrayBuffer())]);
  assert.deepEqual([...new Uint8Array(back.imageBuffer)], [9, 8, 7]);
  assert.deepEqual([...back.shapes], [...shapes]);
  assert.deepEqual(back.settings, { cols: 20, rows: 20, paintScale: 2 });
  assert.equal(back.paintBuffer, null);
  assert.equal(back.editCells.size, 0);
  // A movie's frames keep the keys of every layer (they used to be lost on open).
  assert.equal(back.framesLost, false);
  assert.deepEqual([...back.animation.frames[0].changes.keys()], ['1,1', 'L2:2,2']);
  // A layer with nothing on it has no cells and no paint.
  const empty = await readProject(await stackFile(STACK));
  assert.equal(empty.layerParts.get('L2').editCells.size, 0);
  assert.equal(empty.layerParts.get('L2').paintBuffer, null);
  // A shape on another vector layer says which.
  const onL5 = new Map([['v:b', { ...rectShape(1, 1, 5, 5, { fill: '#00ff00' }), layer: 'L5' }]]);
  const withL5 = await readProject(await stackFile([...STACK, { id: 'L5', kind: 'vector', n: 2, name: null, hidden: false }], { shapes: onL5 }));
  assert.equal(withL5.shapes.get('v:b').layer, 'L5');
});

test('a stack file starts with PHOSPHR2 and an old one with PHOSPHOR', async () => {
  assert.equal(await magicOf(await stackFile(STACK)), 'PHOSPHR2');
  assert.equal(await magicOf(await writeProject({ settings: { cols: 20 }, imageBuffer: new ArrayBuffer(4), paintBlob: null, editCells: new Map() })), 'PHOSPHOR');
});

test('untrusted stacks are refused', async () => {
  const { rectShape } = await import('../../src/document/shapes.js');
  const cases = {
    "an id '../x'": (json) => { json.stack[1].id = '../x'; },
    'two edits': (json) => { json.stack[3].id = 'edit'; },
    'a vector bottom': (json) => { json.stack[0].kind = 'vector'; },
    'the bottom second': (json) => { json.stack = [json.stack[1], json.stack[0], ...json.stack.slice(2)]; },
    'no stack': (json) => { delete json.stack; },
    'a shape on L9': (json) => { json.shapes = [['v:a', { ...rectShape(1, 1, 5, 5, { fill: '#ff0000' }), layer: 'L9' }]]; },
    'a shape on a cells layer': (json) => { json.shapes = [['v:a', { ...rectShape(1, 1, 5, 5, { fill: '#ff0000' }), layer: 'L2' }]]; },
    'a frame key L9:1,1': (json) => Object.assign(json, { frames: [{ kind: 'blank', hold: 0, changes: [['L9:1,1', { char: 'x' }, 0, 0]] }], frame: 0, fps: 10 }),
    'a frame key on the vector layer': (json) => Object.assign(json, { frames: [{ kind: 'blank', hold: 0, changes: [['vector:1,1', { char: 'x' }, 0, 0]] }], frame: 0, fps: 10 }),
  };
  for (const [name, edit] of Object.entries(cases)) {
    await assert.rejects(readProject(await editedStack(edit)), /Not a valid Phosphor project file/, name);
  }
  // A shape on the vector layer itself carries no layer, and one that names it is no shape (it opens without them, as any bad shape).
  assert.equal((await readProject(await editedStack((json) => { json.shapes = [['v:a', { ...rectShape(1, 1, 5, 5, { fill: '#ff0000' }), layer: 'vector' }]]; }))).shapes.size, 0);
});

test('old-form files read back unchanged', async () => {
  const { readdir } = await import('node:fs/promises');
  const dir = new URL('../fixtures/projects/', import.meta.url);
  for (const name of (await readdir(dir)).filter((n) => n.endsWith('.phosphor'))) {
    const read = await readProject(new Blob([await readFile(new URL(name, dir))]));
    assert.equal(read.stack, undefined, name);
    assert.equal(read.layers, undefined, name); // none of them has a layers key
    assert.equal(read.layerParts, undefined, name);
  }
  // A shape that names a layer isn't one the old form has: the file opens without its shapes, as it does in older copies.
  const { rectShape } = await import('../../src/document/shapes.js');
  const shapes = new Map([['v:a', { ...rectShape(1, 1, 5, 5, { fill: '#ff0000' }), layer: 'L5' }]]);
  assert.equal((await readProject(await writeProject({ settings: { cols: 20 }, imageBuffer: new ArrayBuffer(4), paintBlob: null, editCells: new Map(), shapes }))).shapes.size, 0);
});

test("a layer's own chars make the stack form and round-trip", async () => {
  const { legacySlots } = await import('../../src/document/layerInfo.js');
  const base = { chars: '░▒▓', charsAscii: ' .:', seed: 's', charChoice: 'random', charChoiceAscii: 'weight', solids: 25, patternLight: 100 };
  const own = { ...base, chars: '#', charChoice: 'best', solids: 60 };
  const stack = [STACK[0], { ...STACK[1], chars: own }];
  assert.equal(legacySlots(stack, base), null); // the old shape, but its own characters: only the stack form can say so
  const back = await readProject(await stackFile(stack));
  assert.deepEqual(back.stack[1].chars, own);
  assert.equal(back.stack[0].chars, undefined);
});

test('bad chars in a stack are refused', async () => {
  const cases = {
    'solids 900': (json) => { json.stack[1].chars = { solids: 900 }; },
    'a number for characters': (json) => { json.stack[1].chars = { chars: 7 }; },
    'not an object': (json) => { json.stack[1].chars = 'x'; },
  };
  for (const [name, edit] of Object.entries(cases)) {
    await assert.rejects(readProject(await editedStack(edit)), /Not a valid Phosphor project file/, name);
  }
});
