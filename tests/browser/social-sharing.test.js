// A project store connected to a room: an edit goes out as it happens, a change heard is written, and
// undo asks the host. The room itself isn't here: send is a plain function, and what the host would
// number these tests number by hand.
import { test, expect, vi, afterEach } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { eachPixel } from '@/document/changes.js';
import { TILE } from '@/document/History.js';
import { MOST_CHANGE_BYTES, CHUNK_BYTES } from '@/social/wire.js';
import { editLayerActions } from '@/store/project/editLayer.js';
import { selectionActions } from '@/store/project/selection.js';
import { mergingActions } from '@/store/project/merging.js';
import { baseLayerActions } from '@/store/project/baseLayer.js';
import { DRAWING_ACTIONS, HELD_FLOAT_MS, HOST_ONLY_ACTIONS } from '@/store/project/sharing.js';
import { cellIndex } from '@/lib/Cells';
import { guarded } from '@/store/project/combineActions.js';
import { createApp } from 'vue';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { typeAtCursor } from '@/composables/useTextTool.js';
import { toastMessage } from '@/composables/useToast.js';
import eraser from '@/tools/eraser';
import flip from '@/tools/flip';
import bucket from '@/tools/bucket';
import pencil from '@/tools/pencil';

const RED = 0xff0000ff, BLUE = 0x0000ffff;
const INK = { fg: '#ffffff', bg: '#000000' };
const THEM = Object.freeze({ char: 'T' }), OTHER = Object.freeze({ char: 'O' });
const RED_PIXEL = { r: 255, g: 0, b: 0, a: 1 }, BLUE_PIXEL = { r: 0, g: 0, b: 255, a: 1 };

let open = [];
afterEach(() => {
  for (const project of open) project.stopSharing();
  open = [];
  vi.useRealTimers();
});

async function drawing(role, size = 40) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: size, rows: size });
  project.ensureLayer();
  const sent = [];
  if (role) {
    project.startSharing({ send: (message) => sent.push(message), role, me: 'mine' });
    open.push(project);
  }
  return { project, workspace, sent };
}

const dab = (project, x, y, color = '#ff0000') => project.paintStroke([{ x, y, alpha: 1 }], color);
const char = (project, col, row) => project.editCellAt(col, row)?.char;
const painted = (project, x, y) => project.paintLayer.pixelAt(x, y);
const changes = (sent) => sent.filter(({ t }) => t === 'change' || t === 'numbered');
const allRuns = (messages) => {
  const pixels = [];
  for (const { runs } of messages) eachPixel(runs, (x, y, rgba) => pixels.push([x, y, rgba]));
  return pixels;
};

// What a host would send: someone else's change, or an echo of mine.
let number = 100;
const heard = (cells = [], runs = [], by = 'them', stroke = 'theirs') => ({ n: ++number, by, stroke, cells, runs });
const echo = (message, n = ++number) => ({ n, by: 'mine', stroke: message.stroke, cells: message.cells, runs: message.runs });

test('with no sharing, nothing is sent', async () => {
  const { project, sent } = await drawing();
  dab(project, 3, 3);
  project.sendSlice();
  project.typeAt(1, 1, 'A', INK);
  project.commitEdit();
  project.undo();
  project.redo();
  expect(sent).toEqual([]);
  expect(project._sharing).toBe(null);
  expect(painted(project, 3, 3)).toEqual(RED_PIXEL);
});

test('alone, a stroke slices into the ledger only at its end, as one lump', async () => {
  const { project } = await drawing();
  const submit = vi.spyOn(project._ledger, 'submit');
  dab(project, 3, 3);
  dab(project, 4, 3);
  expect(submit).not.toHaveBeenCalled();
  project.commitEdit();
  expect(submit).toHaveBeenCalledTimes(1);
});

test('a stroke sends slices with one stroke id, and only what changed', async () => {
  const { project, sent } = await drawing('artist');
  project.editCell(1, 1, { char: 'A' });
  project.sendSlice();
  project.sendSlice(); // nothing new: nothing goes
  project.editCell(2, 1, { char: 'B' });
  project.sendSlice();
  project.editCell(3, 1, { char: 'C' });
  project.commitEdit();
  const out = changes(sent);
  expect(out.map(({ t }) => t)).toEqual(['change', 'change', 'change']);
  expect(new Set(out.map(({ stroke }) => stroke)).size).toBe(1);
  expect(out[0].stroke.length).toBeLessThanOrEqual(40);
  expect(out.map(({ cells }) => cells.map(([key]) => key))).toEqual([['1,1'], ['2,1'], ['3,1']]);
});

test('slices go out every 100 ms while an edit is open', async () => {
  const { project, sent } = await drawing('artist');
  project.editCell(1, 1, { char: 'A' });
  expect(changes(sent)).toEqual([]);
  await expect.poll(() => changes(sent).length, { timeout: 1000 }).toBe(1);
  project.commitEdit();
});

test('a typing run stays one stroke across keys and slices, until undo ends it', async () => {
  const { project, sent } = await drawing('artist');
  project.typeAt(1, 1, 'A', INK);
  project.sendSlice();
  project.typeAt(2, 1, 'B', INK);
  project.sendSlice();
  const first = changes(sent).map(({ stroke }) => stroke);
  expect(first.length).toBe(2);
  expect(first[0]).toBe(first[1]);
  expect(project._stroke?.typing).toBe(true);

  project.undo(); // closes it: no slice of this id ever follows its undo
  expect(sent.at(-1)).toEqual({ t: 'undo', stroke: first[0] });
  project.typeAt(3, 1, 'C', INK);
  project.commitEdit();
  const after = changes(sent).at(-1);
  expect(after.stroke).not.toBe(first[0]);
  expect(after.cells.map(([key]) => key)).toEqual(['3,1']);
});

test('a stroke of paint sends pixel runs covering only its own pixels', async () => {
  const { project, sent } = await drawing('artist');
  const k = project.paintLayer.scale;
  dab(project, 2, 2);
  project.sendSlice();
  dab(project, 3, 2);
  project.commitEdit();
  const [one, two] = changes(sent);
  const box = (x, y) => {
    const list = [];
    for (let py = y * k; py < (y + 1) * k; py++) for (let px = x * k; px < (x + 1) * k; px++) list.push([px, py, RED]);
    return list;
  };
  expect(allRuns([one])).toEqual(box(2, 2));
  expect(allRuns([two])).toEqual(box(3, 2));
});

test('strokeSlice costs only the tiles touched since the last slice', async () => {
  const { project } = await drawing('artist', 300);
  const layer = project.paintLayer, k = layer.scale;
  project.ensureLayer();
  // A tile apart, in grid pixels.
  const apart = Math.ceil(2 * TILE / k);
  dab(project, 1, 1);
  dab(project, 1 + apart, 1);
  project.sendSlice();
  dab(project, 2, 1);
  const read = vi.spyOn(CanvasRenderingContext2D.prototype, 'getImageData');
  const slice = layer.strokeSlice();
  expect(read).toHaveBeenCalledTimes(slice.length);
  expect(slice.length).toBe(1);
  read.mockRestore();
  expect(layer.strokeSlice()).toEqual([]);
  project.commitEdit();
});

test('a slice that wrote cells doesn\'t scan the map, and a writer that says nothing still gets sent', async () => {
  const { project, sent } = await drawing('artist');
  project.editCell(1, 1, { char: 'A' });
  project.writeEditCells([{ col: 2, row: 1, attrs: { char: 'B' } }]);
  project.typing(() => project.shiftCells(1, 0, 1));
  const scan = vi.spyOn(project.editCells, Symbol.iterator);
  project.sendSlice();
  expect(scan).not.toHaveBeenCalled();
  expect(changes(sent)[0].cells.map(([key]) => key).sort()).toEqual(['2,1', '3,1']); // moved along one: 1,1 was never there to send

  // Noted, then a write that doesn't note: the slice falls back on the scan.
  sent.length = 0;
  project.editCell(5, 1, { char: 'D' });
  project.editCells = new Map(project.editCells).set('6,1', Object.freeze({ char: 'E' }));
  project.commitEdit();
  expect(changes(sent)[0].cells.map(([key]) => key).sort()).toEqual(['5,1', '6,1']);
});

test('an artist\'s Pending has a position\'s value from before the stroke, not what\'s painted', async () => {
  const { project, sent } = await drawing('artist');
  const k = project.paintLayer.scale;
  project.applyNumbered(heard([['9,9', OTHER]]));
  project.editCell(9, 9, { char: 'A' });
  dab(project, 2, 2);
  project.commitEdit();
  const [mine] = changes(sent);
  // A change numbered before mine goes under it; when my echo comes the agreed value is the one the host has.
  project.applyNumbered(heard([['9,9', THEM]], [[2 * k, 2 * k, 1, BLUE]]));
  expect(char(project, 9, 9)).toBe('A');
  expect(project.paintLayer.pixelAt(2, 2)).toEqual(RED_PIXEL);
  project.applyNumbered(echo(mine));
  // The sum is what the check would compare: over what the host has, which is mine in the end.
  expect(project._sharing.pending.sum).toBe(project.editLayerSum());
});

test('Pending\'s and the ledger\'s sums follow the scan, on a layer with paint and cells to start', async () => {
  const { project, sent } = await drawing();
  dab(project, 5, 5);
  project.commitEdit();
  project.typeAt(4, 4, 'Z', INK);
  project.commitEdit();
  project.startSharing({ send: (m) => sent.push(m), role: 'host', me: 'mine' });
  open.push(project);
  const scanned = project.editLayerSum();
  expect(project._ledger.sum).toBe(scanned);
  expect(scanned).not.toBe(0);

  dab(project, 6, 6);
  project.sendSlice();
  project.editCell(7, 7, { char: 'Y' });
  project.commitEdit();
  expect(project._ledger.sum).toBe(project.editLayerSum());
  project.undo();
  expect(project._ledger.sum).toBe(project.editLayerSum());

  const artist = await drawing();
  dab(artist.project, 5, 5);
  artist.project.commitEdit();
  artist.project.startSharing({ send: () => {}, role: 'artist', me: 'mine' });
  open.push(artist.project);
  expect(artist.project._sharing.pending.sum).toBe(artist.project.editLayerSum());
});

test('a host\'s stroke goes in the ledger slice by slice and comes out numbered, and undoes as one', async () => {
  const { project, sent } = await drawing('host');
  dab(project, 2, 2);
  project.sendSlice();
  expect(project._ledger.kept().stacks.strokes.size).toBe(1);
  dab(project, 3, 2);
  project.commitEdit();
  const out = changes(sent);
  expect(out.map(({ t, by }) => [t, by])).toEqual([['numbered', 'mine'], ['numbered', 'mine']]);
  expect(out[1].n).toBe(out[0].n + 1);
  expect(out[0].stroke).toBe(out[1].stroke);
  expect(project._ledger.kept().stacks.strokes.size).toBe(1);

  project.undo();
  expect(painted(project, 2, 2)).toBe(null);
  expect(painted(project, 3, 2)).toBe(null);
  expect(sent.at(-1).t).toBe('numbered');
  expect(sent.at(-1).stroke).toBe(out[0].stroke);
  expect(sent.at(-1).n).toBe(out[1].n + 1);
  project.redo();
  expect(painted(project, 2, 2)).toEqual(RED_PIXEL);
  expect(sent.at(-1).n).toBe(out[1].n + 2);
});

test('a position first touched in a later slice starts the stack with what was truly beneath', async () => {
  const { project } = await drawing('host');
  dab(project, 2, 2);
  project.editCell(1, 1, { char: 'A' });
  project.sendSlice();
  dab(project, 3, 2); // same tile as the first slice's
  project.editCell(2, 1, { char: 'B' });
  const far = Math.ceil(2 * TILE / project.paintLayer.scale);
  dab(project, 3 + far, 2, '#0000ff'); // a tile not touched till now
  project.commitEdit();
  project.undo();
  for (const [x, y] of [[2, 2], [3, 2], [3 + far, 2]]) expect(painted(project, x, y)).toBe(null);
  expect(char(project, 1, 1)).toBe(undefined);
  expect(char(project, 2, 1)).toBe(undefined);
  expect(project.hasPaint).toBe(false);
});

test('a slice too big for one message is split, each part a message of the same stroke', async () => {
  const { project, sent } = await drawing('artist', 200);
  project.writeEditCells(Array.from({ length: 200 * 40 }, (_, i) => ({ col: i % 200, row: Math.floor(i / 200), attrs: { char: 'x', fg: '#123456', bg: '#654321' } })));
  project.commitEdit();
  const out = changes(sent);
  expect(out.length).toBeGreaterThan(1);
  expect(new Set(out.map(({ stroke }) => stroke)).size).toBe(1);
  for (const message of out) expect(new TextEncoder().encode(JSON.stringify(message)).length).toBeLessThanOrEqual(CHUNK_BYTES);
  expect(out.flatMap(({ cells }) => cells).length).toBe(200 * 40);
  // One echo per message clears them all.
  expect(project._sharing.pending.size).toBe(out.length);
  for (const message of out) project.applyNumbered(echo(message));
  expect(project._sharing.pending.size).toBe(0);
});

test('a host\'s big stroke and its undo go out in parts that each fit, each with its own number', async () => {
  const { project, sent } = await drawing('host', 200);
  project.writeEditCells(Array.from({ length: 200 * 40 }, (_, i) => ({ col: i % 200, row: Math.floor(i / 200), attrs: { char: 'x', fg: '#123456', bg: '#654321' } })));
  project.commitEdit();
  project.undo();
  const out = changes(sent);
  expect(out.length).toBeGreaterThan(2);
  out.forEach((message, i) => {
    expect(new TextEncoder().encode(JSON.stringify(message)).length).toBeLessThanOrEqual(CHUNK_BYTES);
    expect(message.parts).toBe(undefined);
    if (i) expect(message.n).toBe(out[i - 1].n + 1);
  });
  expect(project._ledger.n).toBe(out.at(-1).n);
  expect(project._ledger.tail.items.map(({ n }) => n)).toEqual(out.map(({ n }) => n));
  expect(MOST_CHANGE_BYTES).toBeLessThan(CHUNK_BYTES);
});

test('another\'s change in my open stroke doesn\'t end up in my stroke', async () => {
  const { project, sent } = await drawing('artist');
  const k = project.paintLayer.scale;
  project.editCell(1, 1, { char: 'A' });
  dab(project, 2, 2);
  project.sendSlice();
  sent.length = 0;
  // Theirs lands beside mine, in a tile my stroke has open.
  project.applyNumbered(heard([['5,5', THEM]], [[3 * k, 2 * k, 1, BLUE]]));
  expect(sent).toEqual([]); // nothing of mine was unsent
  expect(char(project, 5, 5)).toBe('T');
  dab(project, 2, 3);
  project.commitEdit();
  const pixels = allRuns(changes(sent));
  expect(pixels.length).toBeGreaterThan(0);
  expect(pixels.some(([x, y]) => x === 3 * k && y === 2 * k)).toBe(false);
  expect(changes(sent).every(({ cells }) => cells.every(([key]) => key !== '5,5'))).toBe(true);
});

test('what I\'ve drawn so far goes out before another\'s change is written', async () => {
  const { project, sent } = await drawing('artist');
  project.editCell(1, 1, { char: 'A' });
  expect(changes(sent)).toEqual([]);
  project.applyNumbered(heard([['1,1', THEM]]));
  expect(changes(sent).length).toBe(1); // sent, so it's held, so mine stays until the host's order says
  expect(char(project, 1, 1)).toBe('A');
  project.commitEdit();
});

test('a host writes an artist\'s change and its own open stroke leaves it out', async () => {
  const { project, sent } = await drawing('host');
  const k = project.paintLayer.scale;
  dab(project, 2, 2);
  project.sendSlice(); // as the room does before it numbers someone's change
  const numbered = project._ledger.submit('them', 'theirs', { cells: [['5,5', THEM]], runs: [[3 * k, 2 * k, 1, BLUE]] });
  project.applyNumbered(numbered);
  expect(char(project, 5, 5)).toBe('T');
  dab(project, 2, 3);
  project.commitEdit();
  expect(allRuns(changes(sent)).some(([x, y]) => x === 3 * k && y === 2 * k)).toBe(false);
  project.undo(); // mine goes, theirs stays
  expect(painted(project, 2, 2)).toBe(null);
  expect(char(project, 5, 5)).toBe('T');
  expect(project.paintLayer.readTile(0, 0)[(2 * k * TILE + 3 * k) * 4 + 2]).toBe(255);
});

test('another\'s change during my typing run doesn\'t end the run, and undo leaves theirs', async () => {
  for (const role of ['artist', 'host']) {
    const { project, sent } = await drawing(role);
    const version = project.history.version;
    project.typeAt(1, 1, 'A', INK);
    const stroke = project._stroke;
    project.applyNumbered(role === 'host'
      ? (project.sendSlice(), project._ledger.submit('them', 'theirs', { cells: [['5,5', THEM]] }))
      : heard([['5,5', THEM]]));
    expect(project._stroke).toBe(stroke);
    expect(project._stroke.typing).toBe(true);
    expect(project.history.version).toBe(version);
    project.typeAt(2, 1, 'B', INK);
    expect(project._stroke).toBe(stroke);
    project.undo();
    expect(char(project, 5, 5)).toBe('T');
    if (role === 'host') {
      expect(char(project, 1, 1)).toBe(undefined);
      expect(char(project, 2, 1)).toBe(undefined);
    } else {
      // Nothing moves until the number comes back.
      expect(sent.at(-1).t).toBe('undo');
      expect(char(project, 1, 1)).toBe('A');
      for (const message of changes(sent)) project.applyNumbered(echo(message));
      project.applyNumbered({ n: ++number, by: 'mine', stroke: sent.at(-1).stroke, cells: [['1,1', null], ['2,1', null]], runs: [] });
      expect(char(project, 1, 1)).toBe(undefined);
      expect(char(project, 5, 5)).toBe('T');
    }
    project.stopSharing();
  }
});

test('a change heard counts as unsaved and isn\'t an undo step or a selection step', async () => {
  const { project } = await drawing('artist');
  project.markSaved();
  const version = project.history.version, edits = project.editVersion;
  project.applyNumbered(heard([['5,5', THEM]]));
  expect(project.editVersion).toBe(edits + 1);
  expect(project.isDirty).toBe(true);
  expect(project.history.version).toBe(version);
  expect(project.canUndo).toBe(false);
});

test('my own echo is not written again and doesn\'t count as a new edit', async () => {
  const { project, sent } = await drawing('artist');
  project.editCell(1, 1, { char: 'A' });
  project.commitEdit();
  const map = project.editCells, edits = project.editVersion;
  project.applyNumbered(echo(changes(sent)[0]));
  expect(project.editCells).toBe(map);
  expect(project.editVersion).toBe(edits);
  expect(project._sharing.pending.size).toBe(0);
});

test('another\'s change under my floating selection survives placing it', async () => {
  // The host's own float moves through the ledger.
  {
    const { project, workspace } = await drawing('host');
    project.editCell(1, 1, { char: 'A' });
    project.commitEdit();
    const layers = { base: false, edit: true };
    let rect = { c0: 1, r0: 1, c1: 1, r1: 1 };
    rect = project.floatSelection(rect, layers, 2, 0); // over 3,1
    workspace.selection = rect;
    const version = project.history.version;
    project.sendSlice();
    project.applyNumbered(project._ledger.submit('them', 'theirs', { cells: [['3,1', THEM], ['5,1', THEM]] }));
    expect(project.history.version).toBe(version);
    expect(project._float).not.toBe(null);
    project.floatSelection(rect, layers, 3, 0); // and on to 6,1: same run
    expect(project._float.dc).toBe(5);
    expect(char(project, 3, 1)).toBe('T');
    expect(char(project, 5, 1)).toBe('T');
    expect(char(project, 6, 1)).toBe('A');
    expect(char(project, 1, 1)).toBe(undefined);
    project.stopSharing();
  }
  // An artist's stays home until it's placed, since its moves take back the last synchronously.
  const { project, workspace, sent } = await drawing('artist');
  project.editCell(1, 1, { char: 'A' });
  project.commitEdit();
  project.applyNumbered(echo(changes(sent)[0]));
  sent.length = 0;
  const layers = { base: false, edit: true };
  let rect = { c0: 1, r0: 1, c1: 1, r1: 1 };
  rect = project.floatSelection(rect, layers, 2, 0); // over 3,1
  workspace.selection = rect;
  expect(char(project, 3, 1)).toBe('A');
  expect(char(project, 1, 1)).toBe(undefined);
  const version = project.history.version;

  project.applyNumbered(heard([['3,1', THEM], ['5,1', THEM]]));
  expect(project._float).not.toBe(null);
  expect(project.history.version).toBe(version);
  expect(char(project, 3, 1)).toBe('A');     // mine will go on top: the host hasn't had it yet
  expect(char(project, 5, 1)).toBe('T');

  rect = project.floatSelection(rect, layers, 3, 0); // on to 6,1: the same run
  workspace.selection = rect;
  expect(project._float.dc).toBe(5);
  expect(char(project, 3, 1)).toBe('T');     // what it covered comes back: theirs, not what was there
  expect(char(project, 6, 1)).toBe('A');
  expect(char(project, 1, 1)).toBe(undefined);
  expect(sent).toEqual([]);

  // Placing it: the selection goes, and one change goes out, leaving theirs alone.
  project.changeSelection((space) => { space.selection = null; });
  const out = changes(sent);
  expect(out.length).toBe(1);
  expect(out[0].cells.map(([key]) => key).sort()).toEqual(['1,1', '6,1']);
  expect(char(project, 3, 1)).toBe('T');
  expect(char(project, 5, 1)).toBe('T');
  project.applyNumbered(echo(out[0]));
  expect(project._sharing.pending.size).toBe(0);
  expect(project._sharing.pending.sum).toBe(project.editLayerSum());
});

test('an artist\'s float back where it started leaves nothing to send, and redo sends it then', async () => {
  const { project, sent } = await drawing('artist');
  project.editCell(1, 1, { char: 'A' });
  project.commitEdit();
  project.applyNumbered(echo(changes(sent)[0]));
  sent.length = 0;
  const layers = { base: false, edit: true };
  const start = { c0: 1, r0: 1, c1: 1, r1: 1 };
  const moved = project.floatSelection(start, layers, 2, 0);
  project.floatSelection(moved, layers, -2, 0);
  expect(char(project, 1, 1)).toBe('A');
  expect(char(project, 3, 1)).toBe(undefined);
  expect(project._sharing.pending.size).toBe(0);
  expect(sent).toEqual([]);
  project.redo();
  expect(char(project, 3, 1)).toBe('A');
  expect(char(project, 1, 1)).toBe(undefined);
  expect(changes(sent).length).toBe(1);
});

// Stamp (and a paste onto what's already there) changes nothing, so nothing goes out, and the run goes on.
const inks = (project, ...keys) => keys.map((key) => project.editCells.get(key)?.char);

test('an artist\'s Stamp then a move leaves the copy where it was, as it does alone and for a host', async () => {
  for (const role of [undefined, 'host', 'artist']) {
    const { project, sent } = await drawing(role);
    dab(project, 2, 2);
    project.editCell(1, 1, { char: 'A' });
    project.commitEdit();
    sent.length = 0;
    const rect = { c0: 1, r0: 1, c1: 1, r1: 1 }, layers = { base: false, edit: true };
    const stamped = project.stampSelection(rect, layers);
    project.floatSelection(stamped, layers, 2, 0);
    expect([role, ...inks(project, '1,1', '3,1')]).toEqual([role, 'A', 'A']);
    if (role === 'artist') {
      expect(sent.filter(({ t }) => t === 'undo' || t === 'redo')).toEqual([]);
      project.changeSelection((space) => { space.selection = null; });
      expect(changes(sent).map(({ cells }) => cells.map(([key]) => key))).toEqual([['3,1']]);
    }
    project.stopSharing();
  }
});

test('an artist\'s Stamp then Delete takes away the block, not the original', async () => {
  for (const role of [undefined, 'host', 'artist']) {
    const { project, sent } = await drawing(role);
    project.editCell(1, 1, { char: 'A' });
    project.commitEdit();
    sent.length = 0;
    const layers = { base: false, edit: true };
    const stamped = project.stampSelection({ c0: 1, r0: 1, c1: 1, r1: 1 }, layers);
    project.deleteSelection(stamped, layers);
    expect([role, ...inks(project, '1,1')]).toEqual([role, 'A']);
    expect(sent.filter(({ t }) => t === 'undo' || t === 'change')).toEqual([]);
    project.stopSharing();
  }
});

test('an artist\'s paste onto the same content, then a move, leaves what was there', async () => {
  const { project, sent } = await drawing('artist');
  project.editCell(1, 1, { char: 'A' });
  project.commitEdit();
  sent.length = 0;
  const layers = { base: false, edit: true };
  const block = project.copySelection({ c0: 1, r0: 1, c1: 1, r1: 1 }, layers);
  const pasted = project.pasteSelection(block, 1, 1);
  project.floatSelection(pasted, layers, 4, 0);
  expect(inks(project, '1,1', '5,1')).toEqual(['A', 'A']);
  expect(sent).toEqual([]);
});

test('Stamp, a save, then a move still leaves the copy: nothing had gone out', async () => {
  const { project, sent } = await drawing('artist');
  project.editCell(1, 1, { char: 'A' });
  project.commitEdit();
  sent.length = 0;
  const layers = { base: false, edit: true };
  const stamped = project.stampSelection({ c0: 1, r0: 1, c1: 1, r1: 1 }, layers);
  project.commitPending();
  project.floatSelection(stamped, layers, 2, 0);
  expect(inks(project, '1,1', '3,1')).toEqual(['A', 'A']);
});

test('a stroke that never went out sends no undo or redo', async () => {
  const { project, sent } = await drawing('artist');
  dab(project, 2, 2);
  project.commitEdit();
  sent.length = 0;
  dab(project, 2, 2); // the same again: an undo step alone, with nothing in it
  project.commitEdit();
  expect(sent).toEqual([]);
  expect(project.canUndo).toBe(true);
  project.undo();
  project.redo();
  expect(sent).toEqual([]);
});

test('startSharing again stops the last one first: one timer, and only the new send', async () => {
  const { project, sent } = await drawing('host');
  const clear = vi.spyOn(globalThis, 'clearInterval');
  const { timer } = project._sharing;
  const later = [];
  project.startSharing({ send: (message) => later.push(message), role: 'host', me: 'mine' });
  expect(clear).toHaveBeenCalledWith(timer);
  clear.mockRestore();
  sent.length = 0;
  dab(project, 2, 2);
  project.commitEdit();
  expect(sent).toEqual([]);
  expect(changes(later).length).toBe(1);
});

test('keys while paused: an arrow key keeps the selection', async () => {
  const { project, workspace } = await drawing('artist');
  project.editCell(5, 5, { char: 'A' });
  project.commitEdit();
  workspace.editorTab = 'output';
  workspace.selectAll({ c0: 5, r0: 5, c1: 5, r1: 5 });
  const held = workspace.selection;
  const app = createApp({ setup() { useKeyboardShortcuts(project, workspace); return () => null; } });
  app.mount(document.createElement('div'));
  project.setPaused(true);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
  app.unmount();
  expect(workspace.selection).toEqual(held);
  expect(char(project, 5, 5)).toBe('A');
});

test('keys while paused: a refused type says nothing and the cursor stays', async () => {
  const { project, workspace } = await drawing('artist');
  project.setPaused(true);
  workspace.textCursor = { col: 39, row: 3 };
  toastMessage.value = null;
  typeAtCursor(project, workspace, '漢'); // wouldn't fit, if it were asked
  expect(workspace.textCursor).toEqual({ col: 39, row: 3 });
  expect(toastMessage.value).toBe(null);
  project.setPaused(false);
  typeAtCursor(project, workspace, '漢');
  expect(toastMessage.value).toContain('No room');
});

test('an artist\'s float that has gone out starts a new run, since it can\'t be taken back at once', async () => {
  const { project, sent } = await drawing('artist');
  project.editCell(1, 1, { char: 'A' });
  project.commitEdit();
  project.applyNumbered(echo(changes(sent)[0]));
  sent.length = 0;
  const layers = { base: false, edit: true };
  const moved = project.floatSelection({ c0: 1, r0: 1, c1: 1, r1: 1 }, layers, 2, 0);
  project.commitPending(); // a save, say: it goes out
  expect(changes(sent).length).toBe(1);
  const landed = project.floatSelection(moved, layers, 2, 0);
  expect(landed.c0).toBe(5);
  expect(sent.filter(({ t }) => t === 'undo')).toEqual([]);
  expect(char(project, 5, 1)).toBe('A');
});

test('an artist\'s block left where it is goes out once it\'s been still a while, the timer starting over with each move', async () => {
  const { project, sent } = await drawing('artist');
  project.editCell(1, 1, { char: 'A' });
  project.commitEdit();
  project.applyNumbered(echo(changes(sent)[0]));
  sent.length = 0;
  vi.useFakeTimers();
  const layers = { base: false, edit: true };
  let rect = project.floatSelection({ c0: 1, r0: 1, c1: 1, r1: 1 }, layers, 1, 0);
  vi.advanceTimersByTime(HELD_FLOAT_MS - 1);
  rect = project.floatSelection(rect, layers, 1, 0);
  vi.advanceTimersByTime(HELD_FLOAT_MS - 1);
  expect(changes(sent)).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(changes(sent).map(({ cells }) => cells.map(([key]) => key).sort())).toEqual([['1,1', '3,1']]);
  expect(project._sharing.held).toBe(null);
  expect(HELD_FLOAT_MS).toBe(2000);

  // A later move starts a new run and a new undo step, and what the block covered stays covered.
  const steps = project.history.version;
  project.applyNumbered(echo(changes(sent)[0]));
  sent.length = 0;
  project.floatSelection(rect, layers, 1, 0);
  expect(sent.filter(({ t }) => t === 'undo')).toEqual([]);
  expect(project.history.version).toBeGreaterThan(steps);
  vi.advanceTimersByTime(HELD_FLOAT_MS);
  expect(changes(sent).map(({ cells }) => cells.map(([key]) => key).sort())).toEqual([['3,1', '4,1']]);
  project.undo();
  expect(sent.filter(({ t }) => t === 'undo').map(({ stroke }) => stroke)).toEqual([changes(sent)[0].stroke]);
});

test('an artist\'s paste left where it is goes out too, and a nudge starts its timer over', async () => {
  const { project, sent } = await drawing('artist');
  vi.useFakeTimers();
  const layers = { base: false, edit: true };
  const rect = project.pasteSelection({ w: 1, h: 1, cells: [Object.freeze({ char: 'P' })] }, 2, 2);
  vi.advanceTimersByTime(HELD_FLOAT_MS - 1);
  project.floatSelection(rect, layers, 0, 1);
  vi.advanceTimersByTime(HELD_FLOAT_MS - 1);
  expect(changes(sent)).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(changes(sent).length).toBe(1);
  expect(changes(sent)[0].cells.map(([key]) => key)).toEqual(['2,3']);
});

test('a block placed or undone before its time sends what it does now, and the timer adds nothing', async () => {
  const { project, sent } = await drawing('artist');
  project.editCell(1, 1, { char: 'A' });
  project.commitEdit();
  project.applyNumbered(echo(changes(sent)[0]));
  sent.length = 0;
  vi.useFakeTimers();
  const layers = { base: false, edit: true };
  const rect = project.floatSelection({ c0: 1, r0: 1, c1: 1, r1: 1 }, layers, 2, 0);
  project.commitPending();
  expect(changes(sent).length).toBe(1);
  vi.advanceTimersByTime(HELD_FLOAT_MS * 2);
  expect(changes(sent).length).toBe(1);

  project.applyNumbered(echo(changes(sent)[0]));
  sent.length = 0;
  project.floatSelection(rect, layers, 1, 0);
  project.undo();   // it goes, then its undo is asked
  expect(sent.map(({ t }) => t)).toEqual(['change', 'undo']);
  vi.advanceTimersByTime(HELD_FLOAT_MS * 2);
  expect(sent.length).toBe(2);
});

test('a block\'s timer doesn\'t fire once the room\'s gone or the person went back to watching', async () => {
  const { project, sent } = await drawing('artist');
  project.editCell(1, 1, { char: 'A' });
  project.commitEdit();
  project.applyNumbered(echo(changes(sent)[0]));
  vi.useFakeTimers();
  project.floatSelection({ c0: 1, r0: 1, c1: 1, r1: 1 }, { base: false, edit: true }, 2, 0);
  const send = vi.spyOn(project, 'sendHeld');
  project.stopSharing();
  send.mockClear();
  const count = sent.length;
  vi.advanceTimersByTime(HELD_FLOAT_MS * 2);
  expect(send).not.toHaveBeenCalled();
  expect(sent.length).toBe(count);
});

test('a host\'s float isn\'t held, so it has no timer to wait for', async () => {
  const { project, sent } = await drawing('host');
  project.editCell(1, 1, { char: 'A' });
  project.commitEdit();
  sent.length = 0;
  vi.useFakeTimers();
  project.floatSelection({ c0: 1, r0: 1, c1: 1, r1: 1 }, { base: false, edit: true }, 2, 0);
  const out = sent.length;
  expect(out).toBeGreaterThan(0);
  vi.advanceTimersByTime(HELD_FLOAT_MS);
  expect(sent.length).toBe(out);
});

test('an edit after an artist\'s float sends the float first, and undo then asks the host', async () => {
  const { project, sent } = await drawing('artist');
  project.editCell(1, 1, { char: 'A' });
  project.commitEdit();
  sent.length = 0;
  const moved = project.floatSelection({ c0: 1, r0: 1, c1: 1, r1: 1 }, { base: false, edit: true }, 2, 0);
  expect(moved).toBeTruthy();
  project.editCell(9, 9, { char: 'B' });
  project.commitEdit();
  const out = changes(sent);
  expect(out.map(({ cells }) => cells.map(([key]) => key).sort())).toEqual([['1,1', '3,1'], ['9,9']]);
  project.undo();
  project.undo();
  expect(sent.filter(({ t }) => t === 'undo').map(({ stroke }) => stroke)).toEqual([out[1].stroke, out[0].stroke]);
});

test('undo sends a request and changes nothing until the number comes back', async () => {
  const { project, sent } = await drawing('artist');
  project.editCell(1, 1, { char: 'A' });
  dab(project, 2, 2);
  project.commitEdit();
  const [mine] = changes(sent);
  project.applyNumbered(echo(mine));

  const map = project.editCells;
  project.undo();
  expect(sent.at(-1)).toEqual({ t: 'undo', stroke: mine.stroke });
  expect(project.editCells).toBe(map);
  expect(painted(project, 2, 2)).toEqual(RED_PIXEL);
  expect(project.canRedo).toBe(true);

  project.applyNumbered({ n: ++number, by: 'mine', stroke: mine.stroke, cells: [['1,1', null]], runs: mine.runs.map(([x, y, length]) => [x, y, length, 0]) });
  expect(char(project, 1, 1)).toBe(undefined);
  expect(painted(project, 2, 2)).toBe(null);

  project.redo();
  expect(sent.at(-1)).toEqual({ t: 'redo', stroke: mine.stroke });
  expect(char(project, 1, 1)).toBe(undefined);
});

test('a stroke drawn alone can still be undone by the host once sharing starts', async () => {
  const { project, sent } = await drawing();
  dab(project, 3, 3);
  project.commitEdit();
  project.typeAt(1, 1, 'A', INK); // open when sharing starts: it's recorded as alone
  project.startSharing({ send: (m) => sent.push(m), role: 'host', me: 'mine' });
  open.push(project);
  expect(sent).toEqual([]);
  expect(project._stroke).toBe(null);
  expect(project._by).toBe('mine');
  expect([...project._ledger.kept().stacks.strokes.values()].map(({ by }) => by)).toEqual(['mine', 'mine']);
  project.undo();
  expect(char(project, 1, 1)).toBe(undefined);
  expect(sent.at(-1).t).toBe('numbered');
  project.undo();
  expect(painted(project, 3, 3)).toBe(null);
});

test('strokes held under a merge drawn alone come back undoable once sharing has started', async () => {
  const { project, sent } = await drawing();
  dab(project, 3, 3);
  project.commitEdit();
  project.clearEditLayer();
  project.startSharing({ send: (m) => sent.push(m), role: 'host', me: 'mine' });
  open.push(project);
  project.undo();
  expect(painted(project, 3, 3)).toEqual(RED_PIXEL);
  project.undo();
  expect(painted(project, 3, 3)).toBe(null);
});

test('limits are on while sharing, and stopping leaves the document', async () => {
  const host = await drawing();
  expect(host.project._ledger.limits).toBe(false);
  host.project.startSharing({ send: () => {}, role: 'host', me: 'mine' });
  expect(host.project._ledger.limits).toBe(true);
  dab(host.project, 3, 3);
  host.project.commitEdit();
  host.project.stopSharing();
  expect(host.project._ledger.limits).toBe(false);
  expect(host.project._sharing).toBe(null);
  expect(painted(host.project, 3, 3)).toEqual(RED_PIXEL);
  expect(host.project.canUndo).toBe(true);
  const tail = host.project._ledger.tail.items.length;
  host.project.undo(); // undo carries on
  expect(painted(host.project, 3, 3)).toBe(null);
  expect(host.project._ledger.tail.items.length).toBe(tail); // and drawing alone pays for no tail

  const artist = await drawing('artist');
  dab(artist.project, 3, 3);
  artist.project.commitEdit();
  expect(artist.project.canUndo).toBe(true);
  artist.project.stopSharing();
  expect(artist.project._sharing).toBe(null);
  expect(artist.project.canUndo).toBe(false);
  expect(painted(artist.project, 3, 3)).toEqual(RED_PIXEL);
  expect(artist.project._ledger.limits).toBe(false);
  // An ordinary document now: a stroke undoes at once.
  dab(artist.project, 4, 4);
  artist.project.commitEdit();
  artist.project.undo();
  expect(painted(artist.project, 4, 4)).toBe(null);
  expect(painted(artist.project, 3, 3)).toEqual(RED_PIXEL);
});

test('stopping sends what\'s still open or held first', async () => {
  const { project, sent } = await drawing('artist');
  project.editCell(1, 1, { char: 'A' });
  project.commitEdit();
  sent.length = 0;
  const moved = project.floatSelection({ c0: 1, r0: 1, c1: 1, r1: 1 }, { base: false, edit: true }, 2, 0);
  expect(moved).toBeTruthy();
  project.typeAt(9, 9, 'B', INK);
  project.stopSharing();
  expect(changes(sent).map(({ cells }) => cells.map(([key]) => key).sort())).toEqual([['1,1', '3,1'], ['9,9']]);
});

test('a stroke a pinch interrupts is taken back the same way, once any of it has gone out', async () => {
  const host = await drawing('host');
  dab(host.project, 3, 3);
  host.project.sendSlice();
  host.project.cancelEdit();
  expect(painted(host.project, 3, 3)).toBe(null);
  expect(host.project._stroke).toBe(null);
  expect(host.sent.at(-1).t).toBe('numbered');
  expect(host.sent.at(-1).n).toBe(changes(host.sent)[0].n + 1);

  const artist = await drawing('artist');
  dab(artist.project, 3, 3);
  artist.project.sendSlice();
  const [slice] = changes(artist.sent);
  artist.project.cancelEdit();
  expect(artist.sent.at(-1)).toEqual({ t: 'undo', stroke: slice.stroke });

  // None of it out yet: it just goes, and no one hears of it.
  artist.sent.length = 0;
  dab(artist.project, 5, 5);
  artist.project.cancelEdit();
  expect(painted(artist.project, 5, 5)).toBe(null);
  expect(artist.sent).toEqual([]);
});

test('an artist\'s Merge, Bake, slider, Clear and base paste do nothing', async () => {
  const { project, workspace, sent } = await drawing('artist');
  project.brightness = 120;
  await settle(project);
  dab(project, 3, 3);
  project.commitEdit();
  project.applyNumbered(echo(changes(sent)[0]));
  sent.length = 0;
  const edits = project.editCells, version = project.history.version;

  project.mergeUp();
  project.mergeDown();
  await project.mergeIntoPicture();
  await project.bake();
  project.setSlider('brightness', 50);
  project.commitSliders();
  project.resetSliders();
  project.resetGroup('adjust');
  project.clearEditLayer();
  const block = project.copySelection({ c0: 1, r0: 1, c1: 2, r1: 2 }, { base: true, edit: false });
  expect(block.base).toBeTruthy(); // copying the base is a read
  const pins = project.baseRecords;
  project.pasteBase(block, 10, 10);
  project.eraseBase([{ col: 8, row: 8 }]);
  project.eraseBasePixels([{ x: 8, y: 8 }]);
  project.flipBase([{ col: 8, row: 8 }]);
  project.writeBase([{ x: 8, y: 8, hex: '#ffffff' }]);
  project.updateCols(10);
  project.updateRows(10);
  await project.setBlankCanvas();
  project.clearImage();
  project.randomizeSeed();

  expect(project.image).toBeTruthy();
  expect(project.cols).toBe(40);
  expect(project.brightness).toBe(120);
  expect(project.editCells).toBe(edits);
  expect(project.baseRecords).toBe(pins);
  expect(project.baseLayer.hasPaint).toBe(false);
  expect(painted(project, 3, 3)).toEqual(RED_PIXEL);
  expect(project.history.version).toBe(version);
  expect(sent).toEqual([]);

  // A pasted block with a base brings only its drawing.
  const both = { w: 1, h: 1, cells: [Object.freeze({ char: 'P' })], base: block.base };
  project.pasteSelection(both, 12, 12);
  expect(char(project, 12, 12)).toBe('P');
  expect(project.baseLayer.hasPaint).toBe(false);
  expect(project.baseRecords).toBe(pins);
  workspace.selection = null;
});

test('a host\'s Merge and slider still work', async () => {
  const { project } = await drawing('host');
  project.setSlider('brightness', 50);
  project.commitSliders();
  expect(project.brightness).toBe(50);
  project.mergeUp();
  expect(project.editCells.size).toBeGreaterThan(0);
});

test('every way of opening a document is refused for an artist', async () => {
  const { project } = await drawing('artist');
  const image = project.image;
  const blob = await (await fetch('/tests/fixtures/images/gradient.png')).blob();
  await project.setImageFromFile(new File([blob], 'gradient.png', { type: blob.type }));
  await project.loadProject(new File([blob], 'x.phosphor'));
  await project.openParts({}, {});
  await project.restoreDocument({}, {});
  project.replaceImage(null, null);
  project.newDocument();
  expect(project.image).toBe(image);
});

test('an artist\'s eraser removes drawing and leaves the picture', async () => {
  const { project, workspace, sent } = await drawing('artist');
  workspace.editEraserSize = 1;
  project.editCell(3, 3, { char: 'A' });
  dab(project, 3, 6);
  project.commitEdit();
  sent.length = 0;

  workspace.eraseLayers = { base: true, edit: true };
  const ctx = { project, workspace, view: 'output' };
  eraser.begin(ctx, { x: 3.5, y: 6.5 });
  eraser.end(ctx);
  expect(char(project, 3, 3)).toBe(undefined);
  expect(painted(project, 3, 6)).toBe(null);
  expect(project.baseRecords.pins.size).toBe(0);
  expect(project.baseLayer.hasPaint).toBe(false);

  // Base alone lit: it's still the drawing that goes.
  project.editCell(5, 5, { char: 'B' });
  project.commitEdit();
  workspace.eraseLayers = { base: true, edit: false };
  eraser.begin({ ...ctx, view: 'input' }, { x: 5.5, y: 10.5 });
  eraser.end(ctx);
  eraser.begin(ctx, { x: 5.5, y: 10.5 });
  eraser.end(ctx);
  expect(char(project, 5, 5)).toBe(undefined);
  expect(project.baseLayer.hasPaint).toBe(false);
});

test('an artist\'s selection and flip act on the drawing, whatever layers are lit', async () => {
  const { project, workspace } = await drawing('artist');
  project.editCell(3, 3, { char: 'A', fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  const baseOnly = { base: true, edit: false };

  // Select tool's Layers on Base: moving and deleting still take the drawing, never the picture.
  const moved = project.floatSelection({ c0: 3, r0: 3, c1: 3, r1: 3 }, baseOnly, 2, 0);
  expect(char(project, 5, 3)).toBe('A');
  project.deleteSelection(moved, baseOnly);
  expect(project.editCells.has('5,3')).toBe(false);
  expect(project.baseRecords.pins.size).toBe(0);
  expect(project.baseLayer.hasPaint).toBe(false);

  project.editCell(7, 7, { char: 'B', fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  workspace.flipLayers = baseOnly;
  const ctx = { project, workspace, view: 'output' };
  flip.begin(ctx, { x: 7.5, y: 14.5 });
  flip.end(ctx);
  expect(project.editCellAt(7, 7).fg.toLowerCase()).toBe('#000000');
  expect(project.baseLayer.hasPaint).toBe(false);

  project.recolorSelection({ c0: 7, r0: 7, c1: 7, r1: 7 }, 'output', baseOnly, { fg: '#ff0000' });
  expect(project.editCellAt(7, 7).fg.toLowerCase()).toBe('#ff0000');
  expect(project.baseLayer.hasPaint).toBe(false);
});

test('while paused, drawing does nothing and changes heard still land', async () => {
  const { project, sent } = await drawing('artist');
  project.typeAt(1, 1, 'A', INK);
  project.setPaused(true);
  expect(project._stroke).toBe(null); // what was open went out
  expect(changes(sent).length).toBe(1);
  sent.length = 0;

  const before = project.editCells;
  dab(project, 3, 3);
  project.editCell(2, 2, { char: 'x' });
  expect(project.typeAt(4, 4, 'y', INK)).toBe(undefined); // not false: that's "no room", which callers say out loud
  project.undo();
  project.redo();
  const refused = { c0: 1, r0: 1, c1: 1, r1: 1 };
  expect(project.floatSelection(refused, { base: false, edit: true }, 2, 0)).toBe(undefined); // callers keep the selection they had
  expect(project.backspaceAt(2, 1, INK)).toBe(undefined);
  project.clearEditLayer();
  expect(project.editCells).toBe(before);
  expect(painted(project, 3, 3)).toBe(null);
  expect(sent).toEqual([]);

  project.applyNumbered(heard([['5,5', THEM]]));
  expect(char(project, 5, 5)).toBe('T');
  project.applySettings({ brightness: 77 });
  expect(project.brightness).toBe(77);

  project.setPaused(false);
  project.editCell(2, 2, { char: 'x' });
  project.commitEdit();
  expect(char(project, 2, 2)).toBe('x');
});

test('applySettings takes only the document\'s saved settings', async () => {
  const { project } = await drawing('artist');
  const sharing = project._sharing;
  project.applySettings({ brightness: 77, _sharing: null, cols: 10, editCells: new Map() });
  expect(project.brightness).toBe(77);
  expect(project._sharing).toBe(sharing);
  expect(project.cols).toBe(40);
  expect(project.editCells.size).toBe(0);
});

test('a settings message with a bad value is refused whole, and what\'s fine goes on', async () => {
  const { project } = await drawing('artist');
  const before = project.brightness;
  project.hearDrawing({ t: 'settings', n: 1, values: { brightness: before + 1, chars: 7 } });
  project.flushHeard();
  expect(project.brightness).toBe(before);
  expect(project._sharing.pending.n).toBe(0);
  project.hearDrawing({ t: 'settings', n: 1, values: { brightness: before + 1 } });
  project.flushHeard();
  expect(project.brightness).toBe(before + 1);
});

test('a throw on one message heard doesn\'t lose the rest, and asks for the project', async () => {
  const { project, sent } = await drawing('artist');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(project, 'applyBase').mockImplementationOnce(() => { throw new Error('no'); });
  project.hearDrawing({ t: 'base', n: 1, runs: [], records: {} });
  project.hearDrawing({ t: 'numbered', n: 2, by: 'them', stroke: 'theirs', cells: [['4,4', THEM]], runs: [] });
  project.flushHeard();
  expect(char(project, 4, 4)).toBe('T');
  expect(project._sharing.pending.n).toBe(2);
  expect(sent.filter(({ t }) => t === 'artist-hello')).toEqual([{ t: 'artist-hello', has: -1, epoch: null }]);
});

test('applyBase writes the base\'s pixels and pins, refreshing their cells, and an open stroke leaves them alone', async () => {
  const { project, sent } = await drawing('artist');
  await settle(project);
  const render = vi.spyOn(project, 'render');
  const k = project.baseLayer.scale;
  project.editCell(1, 1, { char: 'A' });
  project.sendSlice();
  const pins = Object.freeze({ pins: new Map([['8,8', 'Q']]) });
  const edits = project.editVersion;
  project.applyBase([[8 * k, 16 * k, k, BLUE], [8 * k, 16 * k + 1, k, BLUE]], pins);
  expect(project.baseRecords).toBe(pins);
  expect(project.renderer.baseRecords).toBe(pins);
  expect(project.cells[cellIndex(8, 8, 40)].char).toBe('Q');
  expect(project.baseLayer.pixelAt(8, 16)).toEqual(BLUE_PIXEL);
  expect(project.editVersion).toBe(edits + 1);
  expect(render).not.toHaveBeenCalled();
  project.commitEdit();
  expect(project.baseRecords).toBe(pins);
  project.undo(); // the artist's undo asks; it doesn't put the pins back
  expect(project.baseRecords).toBe(pins);
  expect(sent.at(-1).t).toBe('undo');
});

test('an applied change refreshes only its cells', async () => {
  const { project } = await drawing('artist');
  await settle(project);
  const k = project.paintLayer.scale;
  const render = vi.spyOn(project, 'render');
  const refresh = vi.spyOn(project, 'refreshCells');
  const map = vi.spyOn(project, 'applyChange');
  project.applyNumbered(heard([['5,5', THEM], ['6,5', OTHER]], [[2 * k, 2 * k, k, RED], [2 * k, 2 * k + 1, k, RED]]));
  await settle(project);
  expect(render).not.toHaveBeenCalled();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(map).toHaveBeenCalledTimes(1);
  const pixels = refresh.mock.calls[0][0];
  expect(pixels.length).toBeLessThan(40 * 40 / 4);
  expect(project.cells[cellIndex(5, 5, 40)].char).toBe('T');
  expect(project.cells[cellIndex(6, 5, 40)].char).toBe('O');
  expect(painted(project, 2, 2)).toEqual(RED_PIXEL);
  expect(project.hasPaint).toBe(true);
});

test('a change with many cells and runs is one write and one refresh, not one per position', async () => {
  const { project, sent } = await drawing('artist', 100);
  await settle(project);
  const k = project.paintLayer.scale;
  const cells = Array.from({ length: 300 }, (_, i) => [`${i % 100},${Math.floor(i / 100)}`, THEM]);
  const runs = Array.from({ length: 20 }, (_, i) => [0, 40 * k + i, 20 * k, BLUE]);
  const seen = vi.spyOn(project, 'refreshCells');
  const writes = vi.spyOn(project.paintLayer, 'writeRuns');
  const before = project.editCells;
  project.applyNumbered(heard(cells, runs));
  expect(seen).toHaveBeenCalledTimes(1);
  expect(writes).toHaveBeenCalledTimes(1);
  expect(project.editCells).not.toBe(before);
  expect(project.editCells.size).toBe(300);
  expect(sent).toEqual([]);
  expect(project._sharing.pending.sum).toBe(project.editLayerSum());
  // A duplicate in one change goes in order, and the sum follows it.
  project.applyNumbered(heard([['0,50', THEM], ['0,50', OTHER]]));
  expect(char(project, 0, 50)).toBe('O');
  expect(project._sharing.pending.sum).toBe(project.editLayerSum());
});

test('Fill, Connect and the picker read another\'s work like your own', async () => {
  const { project, workspace } = await createTestApp();
  project.cols = 30;
  project.rows = 30;
  await project.setBlankCanvas();
  project.render();
  await settle(project);
  project.ensureLayer();
  project.startSharing({ send: () => {}, role: 'artist', me: 'mine' });
  open.push(project);
  const k = project.paintLayer.scale;

  // The picker: their paint is the color at that pixel.
  project.applyNumbered(heard([], Array.from({ length: 30 * k }, (_, i) => [10 * k, i, k, RED])));
  expect(project.rawColorAt(10, 5)).toBe('#ff0000');
  expect(project.underlyingAt(10, 1).fg).toBe('#ff0000');

  // Fill: their wall stops it.
  await settle(project);
  Object.assign(workspace, { editFillTolerance: 0, editFillContiguous: true, editFillFeather: 0, editorTab: 'input', editBrushOpacity: 100, editFgColor: '#00ff00' });
  bucket.begin({ project, workspace, view: 'input' }, { x: 5, y: 5 }, { stopPropagation() {} });
  expect(project.rawColorAt(5, 5)).toBe('#00ff00');
  expect(project.rawColorAt(15, 5)).not.toBe('#00ff00');

  // Connect: my line joins theirs.
  Object.assign(workspace, { pencilDrawWith: 'single', pencilConnect: true, editFgColor: '#ffffff', editBgNone: true });
  const line = Array.from({ length: 9 }, (_, i) => [`20,${i + 1}`, Object.freeze({ char: '│', fg: '#ffffff' })]);
  project.applyNumbered(heard(line));
  const ctx = { project, workspace, view: 'output' };
  const at = (col, row) => ({ x: col + 0.5, y: 2 * row + 1 });
  pencil.begin(ctx, at(18, 5), {});
  pencil.move(ctx, at(18, 5), at(22, 5));
  pencil.end(ctx);
  expect(project.cells[cellIndex(20, 5, project.cols)].char).toBe('┼');
});

test('an action added to the edit layer or selection is listed or known to only read', () => {
  const READS = ['completeAt', 'copySelection', 'basePixelsOf', 'baseColorsOf', 'hasCharacters', 'changeSelection'];
  for (const name of [...Object.keys(editLayerActions), ...Object.keys(selectionActions)]) {
    expect([name, DRAWING_ACTIONS.includes(name) || READS.includes(name)]).toEqual([name, true]);
  }
  expect(DRAWING_ACTIONS).toEqual(expect.arrayContaining(['undo', 'redo']));
  for (const name of [...Object.keys(mergingActions), ...Object.keys(baseLayerActions), 'pasteBase', 'clearEditLayer', 'setSlider', 'commitSliders', 'resetSliders', 'resetGroup', 'updateCols', 'updateRows', 'setImageFromFile', 'setBlankCanvas', 'loadProject', 'restoreDocument', 'openParts', 'replaceImage', 'newDocument', 'clearImage']) {
    expect([name, HOST_ONLY_ACTIONS.includes(name)]).toEqual([name, true]);
  }
});

test('guarded refuses a name that isn\'t an action, which would guard nothing', () => {
  expect(() => guarded({ real() {} }, ['misspelled'], () => true)).toThrow('misspelled');
});

test('back on a new connection, only what never got a number goes, oldest first', async () => {
  const { project, sent } = await drawing('artist');
  project.typeAt(1, 1, 'a');
  project.commitPending();
  project.typeAt(2, 1, 'b');
  project.commitPending();
  const [first, second] = sent.filter((m) => m.t === 'change');
  project.applyNumbered(echo(first, 1));
  project.flushHeard();

  project.newConnection();
  sent.length = 0;
  project.resendPending();
  expect(sent).toEqual([{ t: 'change', stroke: second.stroke, cells: second.cells, runs: second.runs }]);
  project.applyNumbered(echo(second, 2));
  project.flushHeard();
  expect(project._sharing.pending.size).toBe(0);
});

test('a float still held isn\'t sent by a resend: it goes when it\'s placed', async () => {
  const { project, sent } = await drawing('artist');
  project.typeAt(3, 3, 'x');
  project.commitPending();
  const typed = sent.at(-1);
  project.floatSelection({ c0: 3, r0: 3, c1: 3, r1: 3 }, { base: false, edit: true }, 1, 0);
  expect(project._sharing.held.parts.length).toBeGreaterThan(0);
  expect(project._sharing.pending.size).toBeGreaterThan(1);
  sent.length = 0;
  project.resendPending();
  expect(sent).toEqual([{ t: 'change', stroke: typed.stroke, cells: typed.cells, runs: typed.runs }]);
});

test('what\'s waiting is a box for each stroke, in grid pixels', async () => {
  const { project } = await drawing('artist');
  project.typeAt(2, 3, 'x');
  project.commitPending();
  expect(project.waitingBoxes()).toEqual([{ x0: 2, y0: 6, x1: 3, y1: 8 }]);
  project.stopSharing();
  expect(project.waitingBoxes()).toEqual([]);
});

test('an artist leaving keeps the last agreed picture: what got no number is gone', async () => {
  const { project } = await drawing('artist');
  project.typeAt(4, 4, 'x');
  project.commitPending();
  expect(char(project, 4, 4)).toBe('x');
  project.dropWaiting();
  project.stopSharing();
  expect(char(project, 4, 4)).toBeUndefined();
});

test('leaving lands what the host already numbered first: an echo in the queue keeps its stroke', async () => {
  const { project, sent } = await drawing('artist');
  project.typeAt(4, 4, 'x');
  project.commitPending();
  project.typeAt(5, 4, 'y');
  project.commitPending();
  const [numbered] = changes(sent);
  project.hearDrawing({ t: 'numbered', ...echo(numbered, 1) });   // heard, and waiting for the next frame
  project.dropWaiting();
  project.stopSharing();
  expect(char(project, 4, 4)).toBe('x');
  expect(char(project, 5, 4)).toBeUndefined();
});

