// The ledger: numbering every change, a stack per position, and undo that takes back one person's stroke.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Ledger, keptForWire, keptFromWire } from '../../src/document/ledger.js';
import { hashCell, hashPixel, eachPixel, Tail } from '../../src/document/changes.js';
import { TILE } from '../../src/document/History.js';

// The ledger's own: 64 MB in a room, and what a cell counts for.
const MOST_BYTES = 64 * 1024 * 1024, CELL_BYTES = 128;

const RED = 0xff0000ff, GREEN = 0x00ff00ff, BLUE = 0x0000ffff, GRAY = 0x80808080;
const cell = (char) => Object.freeze({ char });
const X = cell('x'), Y = cell('y'), Z = cell('z'), START = cell('s');

// A picture over Maps, as a store would be: reads for the ledger, and apply for what comes back.
function picture({ cells = [], pixels = [] } = {}) {
  const held = { cells: new Map(cells), pixels: new Map(pixels), tileReads: 0 };
  return Object.assign(held, {
    readCell: (key) => held.cells.get(key),
    readTile(x, y) {
      held.tileReads++;
      const data = new Uint8ClampedArray(TILE * TILE * 4);
      for (const [at, rgba] of held.pixels) {
        const [px, py] = at.split(',').map(Number);
        if (px < x || py < y || px >= x + TILE || py >= y + TILE) continue;
        const i = ((py - y) * TILE + (px - x)) * 4;
        data.set([rgba >>> 24, (rgba >>> 16) & 0xff, (rgba >>> 8) & 0xff, rgba & 0xff], i);
      }
      return data;
    },
    apply({ cells: changed, runs }) {
      for (const [key, entry] of changed) {
        if (entry) held.cells.set(key, entry);
        else held.cells.delete(key);
      }
      eachPixel(runs, (x, y, rgba) => {
        if (rgba) held.pixels.set(`${x},${y}`, rgba);
        else held.pixels.delete(`${x},${y}`);
      });
    },
    px: (x, y) => held.pixels.get(`${x},${y}`) ?? 0,
    // The check, worked out the slow way.
    sum() {
      let sum = 0;
      for (const [key, entry] of held.cells) sum ^= hashCell(key, entry);
      for (const [at, rgba] of held.pixels) {
        const [x, y] = at.split(',').map(Number);
        sum ^= hashPixel(x, y, rgba);
      }
      return sum;
    },
  });
}

// A ledger over a picture whose every result is applied at once, as a caller does.
function setup(start, options) {
  const pic = picture(start);
  const ledger = new Ledger({ readCell: pic.readCell, readTile: pic.readTile, sum: pic.sum(), ...options });
  const go = (numbered) => { if (numbered) pic.apply(numbered); return numbered; };
  return {
    pic,
    ledger,
    go,
    drawCell: (by, stroke, key, entry) => go(ledger.submit(by, stroke, { cells: [[key, entry]], runs: [] })),
    drawRuns: (by, stroke, runs) => go(ledger.submit(by, stroke, { cells: [], runs })),
    undo: (by, stroke) => go(ledger.undo(by, stroke)),
    redo: (by, stroke) => go(ledger.redo(by, stroke)),
  };
}

test('changes get the next number, in order', () => {
  const { ledger, drawCell, undo, redo } = setup();
  assert.equal(drawCell('a', 's1', '0,0', X).n, 1);
  assert.equal(drawCell('b', 's2', '1,0', Y).n, 2);
  assert.equal(ledger.note(), 3);
  assert.equal(undo('a', 's1').n, 4);
  assert.equal(redo('a', 's1').n, 5);
  assert.equal(ledger.n, 5);

  const later = setup(undefined, { n: 41 });
  assert.deepEqual(later.drawCell('a', 's', '0,0', X), { n: 42, by: 'a', stroke: 's', cells: [['0,0', X]], runs: [] });
});

test('what\'s numbered goes in the tail, but a note leaves that to its caller', () => {
  const { ledger, drawCell, undo, redo } = setup(undefined, { tail: new Tail() });
  const one = drawCell('a', 's', '0,0', X), two = undo('a', 's'), three = redo('a', 's');
  assert.deepEqual(ledger.tail.since(0), [one, two, three]);
  ledger.note();
  assert.deepEqual(ledger.tail.since(0), [one, two, three]);
});

test('if I draw over you and undo, yours comes back', () => {
  const { pic, drawCell, undo } = setup({ cells: [['0,0', START]] });
  drawCell('you', 'yours', '0,0', X);
  drawCell('me', 'mine', '0,0', Y);
  assert.deepEqual(undo('me', 'mine').cells, [['0,0', X]]);
  assert.equal(pic.cells.get('0,0'), X);
});

test('if you draw over me and I undo, yours stays and mine is gone from beneath it', () => {
  const { pic, drawCell, undo } = setup({ cells: [['0,0', START]] });
  drawCell('me', 'mine', '0,0', X);
  drawCell('you', 'yours', '0,0', Y);
  assert.deepEqual(undo('me', 'mine').cells, []); // nothing visible changes
  assert.equal(pic.cells.get('0,0'), Y);
  assert.deepEqual(undo('you', 'yours').cells, [['0,0', START]]); // what it started with, not mine
});

test('a position that started empty goes back to empty', () => {
  const { pic, drawCell, undo } = setup();
  drawCell('a', 's', '0,0', X);
  assert.deepEqual(undo('a', 's').cells, [['0,0', null]]);
  assert.equal(pic.cells.has('0,0'), false);
});

test('undoing a stroke of many slices takes back all of them', () => {
  const { pic, drawCell, drawRuns, undo } = setup({ cells: [['1,0', START]] });
  drawCell('a', 's', '0,0', X);
  drawRuns('a', 's', [[0, 0, 2, RED]]);
  drawCell('a', 's', '1,0', Y);
  drawRuns('a', 's', [[70, 0, 1, BLUE]]);
  undo('a', 's');
  assert.equal(pic.cells.has('0,0'), false);
  assert.equal(pic.cells.get('1,0'), START);
  assert.equal(pic.pixels.size, 0);
});

test('a slice writing a position its stroke already wrote still undoes in one step', () => {
  const { pic, drawCell, drawRuns, undo } = setup({ cells: [['0,0', START]], pixels: [['5,5', GRAY]] });
  drawCell('a', 's', '0,0', X);
  drawCell('a', 's', '0,0', Y);
  drawRuns('a', 's', [[5, 5, 1, RED]]);
  drawRuns('a', 's', [[5, 5, 1, BLUE]]);
  const undone = undo('a', 's');
  assert.deepEqual(undone.cells, [['0,0', START]]);
  assert.deepEqual(undone.runs, [[5, 5, 1, GRAY]]);
  assert.equal(pic.px(5, 5), GRAY);
});

test('a stroke writing again over someone who drew between comes out on top, and undoes past both of its values', () => {
  const { pic, drawCell, drawRuns, undo } = setup({ cells: [['0,0', START]] });
  drawCell('a', 'as', '0,0', X);
  drawRuns('a', 'as', [[5, 5, 2, RED]]);
  drawCell('b', 'bs', '0,0', Y);
  drawRuns('b', 'bs', [[5, 5, 1, GREEN]]);
  drawCell('a', 'as', '0,0', Z);
  drawRuns('a', 'as', [[5, 5, 1, BLUE]]);
  assert.equal(pic.px(5, 5), BLUE);

  undo('a', 'as');
  assert.equal(pic.cells.get('0,0'), Y);
  assert.equal(pic.px(5, 5), GREEN);
  assert.equal(pic.px(6, 5), 0);
  undo('b', 'bs');
  assert.equal(pic.cells.get('0,0'), START);
  assert.equal(pic.px(5, 5), 0);
});

test('nobody can undo another person\'s stroke', () => {
  const { ledger, pic, drawCell } = setup();
  drawCell('a', 's', '0,0', X);
  assert.equal(ledger.undo('b', 's'), null);
  assert.equal(ledger.undo('a', 'unknown'), null);
  assert.equal(ledger.n, 1);
  assert.equal(pic.cells.get('0,0'), X);
  ledger.undo('a', 's');
  assert.equal(ledger.redo('b', 's'), null);
  assert.equal(ledger.undo('a', 's'), null); // already undone
});

test('nobody can add to another person\'s stroke, or to one that was undone', () => {
  const { ledger, drawCell, undo } = setup();
  drawCell('a', 's', '0,0', X);
  assert.equal(ledger.submit('b', 's', { cells: [['0,0', Y]], runs: [] }), null);
  undo('a', 's');
  assert.equal(ledger.submit('a', 's', { cells: [['0,0', Y]], runs: [] }), null);
  assert.equal(ledger.n, 2);
});

test('redo puts the stroke on top again, even over what was drawn since', () => {
  const { pic, drawCell, drawRuns, undo, redo } = setup();
  drawCell('a', 'as', '0,0', X);
  drawRuns('a', 'as', [[1, 1, 3, RED]]);
  undo('a', 'as');
  drawCell('b', 'bs', '0,0', Y);
  drawRuns('b', 'bs', [[2, 1, 1, GREEN]]);
  const redone = redo('a', 'as');
  assert.deepEqual(redone.cells, [['0,0', X]]);
  assert.deepEqual(redone.runs, [[1, 1, 3, RED]]);
  assert.equal(pic.cells.get('0,0'), X);
  assert.equal(pic.px(2, 1), RED);

  undo('a', 'as'); // a redone stroke undoes again, and b's is what's beneath
  assert.equal(pic.cells.get('0,0'), Y);
  assert.equal(pic.px(2, 1), GREEN);
  assert.equal(pic.px(1, 1), 0);
});

test('an undo lists only the positions that visibly change', () => {
  const { drawCell, drawRuns, undo } = setup({ pixels: [['0,0', RED]] });
  drawRuns('a', 's', [[0, 0, 1, RED], [1, 0, 1, RED]]); // the first pixel was already this color
  drawCell('b', 'bs', '0,0', X);
  drawCell('a', 't', '0,0', { char: 'x' }); // reads the same as what's beneath, though another object
  assert.deepEqual(undo('a', 't').cells, []);
  assert.deepEqual(undo('a', 's').runs, [[1, 0, 1, 0]]);
});

test('paint: two strokes apart in one tile each undo alone', () => {
  const { pic, drawRuns, undo } = setup({ pixels: [['20,20', GRAY]] });
  drawRuns('a', 'as', [[1, 1, 4, RED]]);
  drawRuns('b', 'bs', [[10, 10, 4, GREEN]]);
  assert.deepEqual(undo('a', 'as').runs, [[1, 1, 4, 0]]);
  assert.equal(pic.px(10, 10), GREEN);
  assert.equal(pic.px(1, 1), 0);
  assert.deepEqual(undo('b', 'bs').runs, [[10, 10, 4, 0]]);
  assert.equal(pic.px(20, 20), GRAY);
});

test('paint: a stroke over part of another reveals only the part it covered', () => {
  const { pic, drawRuns, undo } = setup();
  drawRuns('a', 'as', [[0, 0, 6, RED]]);
  drawRuns('b', 'bs', [[2, 0, 2, GREEN]]);
  assert.deepEqual(undo('b', 'bs').runs, [[2, 0, 2, RED]]);
  assert.equal(pic.px(0, 0), RED);
  assert.equal(pic.px(2, 0), RED);
});

test('paint: undoing a stroke under part of another leaves that part alone', () => {
  const { pic, drawRuns, undo } = setup();
  drawRuns('a', 'as', [[0, 0, 6, RED]]);
  drawRuns('b', 'bs', [[2, 0, 2, GREEN]]);
  assert.deepEqual(undo('a', 'as').runs, [[0, 0, 2, 0], [4, 0, 2, 0]]);
  assert.equal(pic.px(2, 0), GREEN);
  assert.deepEqual(undo('b', 'bs').runs, [[2, 0, 2, 0]]);
});

test('paint: erasing is a value, and undoing it brings back what it erased', () => {
  const { pic, drawRuns, undo } = setup({ pixels: [['3,3', GRAY]] });
  drawRuns('a', 'as', [[3, 3, 1, RED]]);
  drawRuns('b', 'bs', [[3, 3, 1, 0]]);
  assert.equal(pic.px(3, 3), 0);
  assert.deepEqual(undo('b', 'bs').runs, [[3, 3, 1, RED]]);
  assert.deepEqual(undo('a', 'as').runs, [[3, 3, 1, GRAY]]);
});

test('a run across tiles lands in each of them', () => {
  const { pic, drawRuns, undo } = setup();
  drawRuns('a', 's', [[TILE - 2, TILE - 1, 4, RED]]);
  undo('a', 's');
  assert.equal(pic.pixels.size, 0);
});

test('each position\'s start is read once, at its first touch, before the change is applied', () => {
  const { pic, drawRuns, undo } = setup({ pixels: [['1,1', GRAY]] });
  drawRuns('a', 's', [[1, 1, 1, RED]]);
  drawRuns('b', 't', [[2, 2, 1, RED]]);
  assert.equal(pic.tileReads, 1);
  drawRuns('b', 't', [[TILE, 0, 1, RED]]);
  assert.equal(pic.tileReads, 2);
  assert.deepEqual(undo('a', 's').runs, [[1, 1, 1, GRAY]]);
});

// A soft brush: every pixel a different color, so runs and per-pixel objects would be at their worst.
function softBrushRuns(width, height) {
  const runs = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) runs.push([x, y, 1, ((x * 40503 + y * 2654435) << 8 | (x % 255) + 1) >>> 0]);
  return runs;
}

// What's really held: an array reached twice is one array.
const typedBytes = (value, seen = new Set()) => {
  if (!value || typeof value !== 'object' || seen.has(value)) return 0;
  seen.add(value);
  if (ArrayBuffer.isView(value)) return value.byteLength;
  const inside = value instanceof Map ? [...value.keys(), ...value.values()] : Object.values(value);
  return inside.reduce((sum, item) => sum + typedBytes(item, seen), 0);
};

test('a soft-brush stroke across the layer holds no more than its tiles would have', () => {
  const { ledger, drawRuns } = setup();
  drawRuns('a', 's', softBrushRuns(TILE * 4, TILE * 4));
  const tiles = 16, beforeAndAfter = tiles * 2 * TILE * TILE * 4;
  const held = ledger.kept();
  assert.ok(typedBytes(held) <= beforeAndAfter, `holds ${typedBytes(held)} bytes`);
  assert.ok(ledger.bytesOf('s') <= beforeAndAfter, `counts ${ledger.bytesOf('s')} bytes`);
  assert.ok(ledger.bytesOf('s') >= typedBytes(held), 'counts at least what it holds');
});

test('a small mark in a tile costs its tile, and undoing everything lets go of the tile', () => {
  const { ledger, drawRuns, undo } = setup();
  drawRuns('a', 's', [[0, 0, 1, RED]]);
  const held = ledger.kept();
  assert.ok(typedBytes(held) <= 2 * TILE * TILE * 4);
  undo('a', 's');
  ledger.forget('s');
  assert.equal(typedBytes(ledger.kept()), 0);
  assert.equal(ledger.bytesOf('s'), 0);
});

test('with limits off a person\'s 51st-oldest stroke still undoes', () => {
  const { pic, drawCell, undo } = setup();
  for (let i = 0; i < 51; i++) drawCell('a', `s${i}`, `${i},0`, X);
  assert.ok(undo('a', 's0'));
  assert.equal(pic.cells.has('0,0'), false);
});

test('past 50 strokes a person\'s oldest can\'t be undone, and what it drew stays', () => {
  const { ledger, pic, drawCell, undo } = setup(undefined, { limits: true });
  drawCell('b', 'theirs', '99,0', Y);
  for (let i = 0; i < 51; i++) drawCell('a', `s${i}`, `${i},0`, X);
  assert.equal(ledger.undo('a', 's0'), null);
  assert.equal(pic.cells.get('0,0'), X);
  assert.ok(undo('a', 's1')); // the next oldest still can
  assert.ok(undo('b', 'theirs')); // and someone else's count is their own
  assert.equal(ledger.redo('a', 's0'), null);
});

test('setLimits turns the limits on and off, and applies at once', () => {
  const { ledger, pic, drawCell, undo } = setup();
  for (let i = 0; i < 52; i++) drawCell('a', `s${i}`, `${i},0`, X);
  ledger.setLimits(true);
  assert.equal(ledger.undo('a', 's1'), null);
  assert.equal(pic.cells.get('1,0'), X);
  assert.ok(undo('a', 's2'));
  ledger.setLimits(false);
  for (let i = 52; i < 120; i++) drawCell('a', `s${i}`, `${i},0`, X);
  assert.ok(undo('a', 's3'));
});

test('past 64 MB in all the oldest stroke goes first, and the newest stays however big', () => {
  const { ledger, pic, drawRuns, undo } = setup(undefined, { limits: true });
  // A pixel in each of 1000 tiles, on two rows of tiles: 32 MB counted, before and after.
  const stroke = (y) => Array.from({ length: 1000 }, (_, i) => [(i % 500) * TILE, y + Math.floor(i / 500) * TILE, 1, RED]);
  drawRuns('a', 'old', stroke(0));
  drawRuns('b', 'mid', stroke(TILE * 2));
  assert.ok(ledger.bytesOf('old') > 0);
  drawRuns('a', 'new', stroke(TILE * 4));
  assert.equal(ledger.undo('a', 'old'), null);
  assert.equal(pic.px(0, 0), RED);
  assert.equal(ledger.bytesOf('old'), 0);
  assert.ok(undo('a', 'new'));
  assert.ok(undo('b', 'mid'));

  const alone = setup(undefined, { limits: true });
  alone.drawRuns('a', 'huge', [...stroke(0), ...stroke(TILE * 2), ...stroke(TILE * 4)]);
  assert.ok(alone.undo('a', 'huge'));
});

test('a stroke that keeps writing past 50 strokes is never the oldest, and undoes whole', () => {
  const { ledger, pic, drawCell, undo } = setup(undefined, { limits: true });
  drawCell('a', 'open', '0,0', X);
  for (let i = 1; i <= 60; i++) {
    drawCell('a', `s${i}`, `${i},1`, Y);
    drawCell('a', 'open', `${i},0`, X);
  }
  assert.equal(ledger.undo('a', 's1'), null); // the others went in its place
  undo('a', 'open');
  for (let i = 0; i <= 60; i++) assert.equal(pic.cells.has(`${i},0`), false);
});

test('a stroke that keeps writing past 64 MB is never the oldest, and undoes whole', () => {
  const { ledger, pic, drawRuns, undo } = setup(undefined, { limits: true });
  const tiles = (row) => Array.from({ length: 1100 }, (_, i) => [i * TILE, row * TILE, 1, GREEN]); // 35 MB counted
  drawRuns('a', 'open', [[0, 0, 1, RED]]);
  drawRuns('b', 'first', tiles(1));
  drawRuns('a', 'open', [[1, 0, 1, RED]]);
  drawRuns('b', 'second', tiles(2));
  assert.equal(ledger.undo('b', 'first'), null);
  assert.deepEqual(undo('a', 'open').runs, [[0, 0, 2, 0]]);
  assert.equal(pic.px(0, 0), 0);
});

test('a stroke quiet past a limit goes like any other, and what it writes after that undoes alone', () => {
  const { ledger, pic, drawCell, undo } = setup(undefined, { limits: true });
  drawCell('a', 'quiet', '0,0', X);
  for (let i = 1; i <= 50; i++) drawCell('a', `s${i}`, `${i},1`, Y);
  assert.equal(ledger.bytesOf('quiet'), 0);
  drawCell('a', 'quiet', '1,0', X);
  assert.deepEqual(undo('a', 'quiet').cells, [['1,0', null]]);
  assert.equal(pic.cells.get('0,0'), X);
});

test('the running sum matches a sum over the positions from scratch, after draw, undo and redo', () => {
  const { pic, ledger, drawCell, drawRuns, undo, redo } = setup({ cells: [['0,0', START]], pixels: [['1,1', GRAY]] });
  const agrees = () => assert.equal(ledger.sum, pic.sum());
  agrees();
  drawCell('a', 'as', '0,0', X); agrees();
  drawRuns('a', 'as', [[1, 1, 3, RED]]); agrees();
  drawCell('b', 'bs', '0,0', Y); agrees();
  drawRuns('b', 'bs', [[2, 1, 5, GREEN]]); agrees();
  drawRuns('a', 'as', [[1, 1, 1, 0]]); agrees();
  undo('a', 'as'); agrees();
  redo('a', 'as'); agrees();
  undo('b', 'bs'); agrees();
  undo('a', 'as'); agrees();
  assert.notEqual(ledger.sum, 0);
});

test('seeding the sum leaves the stacks alone, and it follows the picture from there', () => {
  const { pic, ledger, drawCell, drawRuns, undo } = setup({ cells: [['0,0', START]], pixels: [['1,1', GRAY]] }, { sum: 0 });
  drawCell('a', 'before', '0,0', X);
  drawRuns('a', 'before', [[1, 1, 1, RED]]);
  assert.notEqual(ledger.sum, pic.sum());

  ledger.seedSum(pic.sum());
  assert.equal(ledger.sum, pic.sum());
  drawCell('b', 'after', '0,0', Y);
  drawRuns('b', 'after', [[1, 1, 2, GREEN]]);
  assert.equal(ledger.sum, pic.sum());
  undo('b', 'after');
  assert.equal(ledger.sum, pic.sum());
  assert.deepEqual(undo('a', 'before').cells, [['0,0', START]]); // and what came before still undoes
  assert.equal(ledger.sum, pic.sum());
});

test('the sum already holds a change when it\'s returned, before anyone applies it', () => {
  const { pic, ledger } = setup();
  const numbered = ledger.submit('a', 's', { cells: [['0,0', X]], runs: [[0, 0, 1, RED]] });
  assert.equal(pic.cells.size, 0);
  const sum = ledger.sum;
  pic.apply(numbered);
  assert.equal(sum, pic.sum());
});

test('kept() and restore() give a ledger that undoes the same', () => {
  const { pic, ledger, drawCell, drawRuns, undo } = setup({ cells: [['0,0', START]], pixels: [['1,1', GRAY]] }, { epoch: 'e1' });
  drawCell('a', 'as', '0,0', X);
  drawRuns('a', 'as', [[1, 1, 3, RED]]);
  drawCell('b', 'bs', '0,0', Y);
  drawRuns('b', 'bs', [[2, 1, 1, GREEN]]);
  drawCell('c', 'cs', '5,5', Z);
  undo('c', 'cs');

  const back = Ledger.restore(structuredClone(ledger.kept()), { readCell: pic.readCell, readTile: pic.readTile });
  assert.equal(back.n, ledger.n);
  assert.equal(back.epoch, 'e1');
  assert.equal(back.sum, ledger.sum);
  assert.deepEqual(back.tail.since(1), ledger.tail.since(1));

  assert.equal(back.undo('c', 'as'), null);
  assert.equal(back.redo('c', 'as'), null);
  const first = back.undo('a', 'as');
  assert.deepEqual(first, ledger.undo('a', 'as'));
  pic.apply(first);
  assert.equal(back.sum, pic.sum());
  const second = back.undo('b', 'bs');
  assert.deepEqual(second.cells, [['0,0', START]]);
  assert.deepEqual(second.runs, [[2, 1, 1, 0]]);
  pic.apply(second);
  const third = back.redo('c', 'cs');
  assert.deepEqual(third.cells, [['5,5', Z]]);
  assert.equal(back.submit('z', 'next', { cells: [], runs: [] }).n, third.n + 1);
});

test('restore keeps which stroke was written longest ago', () => {
  const { pic, ledger, drawCell } = setup(undefined, { limits: true });
  for (let i = 0; i < 50; i++) drawCell('a', `s${i}`, `${i},0`, X);
  drawCell('a', 's0', '0,1', X);
  const back = Ledger.restore(structuredClone(ledger.kept()), { readCell: pic.readCell, readTile: pic.readTile });
  back.submit('a', 'one more', { cells: [['60,0', X]], runs: [] });
  assert.equal(back.undo('a', 's1'), null);
  assert.ok(back.undo('a', 's0'));
});

test('restore keeps whether the limits are on', () => {
  const { pic, ledger, drawCell } = setup(undefined, { limits: true });
  for (let i = 0; i < 50; i++) drawCell('a', `s${i}`, `${i},0`, X);
  const back = Ledger.restore(structuredClone(ledger.kept()), { readCell: pic.readCell, readTile: pic.readTile });
  back.submit('a', 'one more', { cells: [['60,0', X]], runs: [] });
  assert.equal(back.undo('a', 's0'), null);
});

test('reset drops the stacks and keeps counting', () => {
  const { pic, ledger, drawCell, drawRuns, undo } = setup(undefined, { epoch: 'e1' });
  drawCell('a', 's', '0,0', X);
  drawRuns('a', 's', [[0, 0, 1, RED]]);
  ledger.reset({ epoch: 'e2', sum: pic.sum() });
  assert.equal(ledger.epoch, 'e2');
  assert.equal(ledger.n, 2);
  assert.equal(ledger.sum, pic.sum());
  assert.equal(ledger.undo('a', 's'), null);
  assert.equal(drawCell('a', 't', '0,0', Y).n, 3);
  assert.deepEqual(undo('a', 't').cells, [['0,0', X]]); // what was there at the reset is now what's beneath
});

test('reset changes the sum only when it\'s given one', () => {
  const { pic, ledger, drawCell } = setup();
  drawCell('a', 's', '0,0', X);
  const sum = pic.sum();
  ledger.reset();
  assert.equal(ledger.sum, sum);
  ledger.reset({ sum: 0 });
  assert.equal(ledger.sum, 0);
});

test('takeStacks and putStacks bring undo back as it was', () => {
  const { pic, ledger, drawCell, drawRuns, undo, redo } = setup({ cells: [['0,0', START]] });
  drawCell('a', 'before', '0,0', X);
  drawRuns('a', 'before', [[0, 0, 1, RED]]);
  const sum = ledger.sum, cells = new Map(pic.cells), pixels = new Map(pic.pixels);

  // A merge: the layer empties, and its stacks wait in the merge's entry.
  const merged = ledger.takeStacks();
  pic.cells.clear();
  pic.pixels.clear();
  assert.equal(ledger.undo('a', 'before'), null);
  assert.equal(ledger.sum, sum); // not the stacks' to change: a merge in a room is followed by a project, which seeds
  drawCell('a', 'after', '1,1', Y);
  undo('a', 'after');

  // Undoing the merge swaps: what's there now waits for a redo of the merge.
  const later = ledger.takeStacks();
  ledger.putStacks(merged);
  pic.cells = cells;
  pic.pixels = pixels;
  assert.equal(ledger.sum, sum);
  const undone = undo('a', 'before');
  assert.deepEqual(undone.cells, [['0,0', START]]);
  assert.deepEqual(undone.runs, [[0, 0, 1, 0]]);
  redo('a', 'before');
  assert.equal(pic.cells.get('0,0'), X);

  ledger.takeStacks();
  ledger.putStacks(later);
  assert.equal(ledger.undo('a', 'before'), null);
  assert.ok(ledger.redo('a', 'after'));
});

test('forget leaves the picture alone, and strokes above it still undo', () => {
  const { pic, ledger, drawCell, drawRuns, undo } = setup({ cells: [['0,0', START]] });
  drawCell('a', 'below', '0,0', X);
  drawRuns('a', 'below', [[0, 0, 2, RED]]);
  drawCell('b', 'gone', '0,0', Y);
  drawRuns('b', 'gone', [[0, 0, 2, GREEN]]);
  drawCell('c', 'above', '0,0', Z);
  drawRuns('c', 'above', [[1, 0, 1, BLUE]]);
  const sum = ledger.sum;

  ledger.forget('gone');
  assert.equal(ledger.sum, sum);
  assert.equal(pic.cells.get('0,0'), Z);
  assert.equal(ledger.undo('b', 'gone'), null);

  assert.deepEqual(undo('c', 'above').cells, [['0,0', Y]]); // what it drew is part of what's beneath now
  assert.equal(pic.px(1, 0), GREEN);
  assert.deepEqual(undo('a', 'below').cells, []); // beneath what can't go, so nothing shows
  assert.deepEqual(undo('a', 'below'), null);
  assert.equal(pic.cells.get('0,0'), Y);
  assert.equal(pic.px(0, 0), GREEN);
});

test('forget of an undone stroke lets go of it: its undo stays and redo is off', () => {
  const { pic, ledger, drawCell, undo } = setup({ cells: [['0,0', START]] });
  drawCell('a', 's', '0,0', X);
  undo('a', 's');
  ledger.forget('s');
  assert.equal(pic.cells.get('0,0'), START);
  assert.equal(ledger.redo('a', 's'), null);
});

test('forget of a stroke nobody knows does nothing', () => {
  const { ledger } = setup();
  ledger.forget('never');
  assert.equal(ledger.sum, 0);
});

// The same rules the slow way, one object per position, against the ledger through a long random run.
test.each([1, 2, 3, 4, 5, 6])('many hands, in any order, end as position-by-position stacks would (seed %i)', (seed) => {
  let state = seed * 2654435761;
  const random = (under) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % under;
  };

  const startCells = [['0,0', START]], startPixels = [['2,2', GRAY], [`${TILE + 1},2`, GRAY]];
  const { pic, ledger, go } = setup({ cells: startCells, pixels: startPixels });
  const positions = new Map();
  for (let i = 0; i < 4; i++) positions.set(`${i},0`, { cell: true, base: i ? null : START, stack: [] });
  for (const x of [1, 2, 3, TILE - 1, TILE, TILE + 1]) for (const y of [2, 3]) {
    positions.set(`p${x},${y}`, { x, y, base: pic.px(x, y), stack: [] });
  }
  const strokes = new Map(); // id: { by, undone, values: Map<position, value> }
  const pixelValues = [RED, GREEN, BLUE, 0], cellValues = [X, Y, Z, null];
  const names = [...positions.keys()];
  const shown = (spot) => (spot.stack.length ? strokes.get(spot.stack.at(-1)).values.get(spot.name) : spot.base);
  for (const [name, spot] of positions) spot.name = name;
  const removeFrom = (spot, id) => { spot.stack = spot.stack.filter((other) => other !== id); };

  for (let step = 0; step < 400; step++) {
    const live = [...strokes].filter(([, s]) => !s.undone), undone = [...strokes].filter(([, s]) => s.undone);
    const roll = random(10);
    if (roll < 5 || !strokes.size) {
      const carryOn = live.length && random(2);
      const id = carryOn ? live[random(live.length)][0] : `s${step}`;
      const by = carryOn ? strokes.get(id).by : `person${random(3)}`;
      if (!strokes.has(id)) strokes.set(id, { by, undone: false, values: new Map() });
      const stroke = strokes.get(id), change = { cells: [], runs: [] };
      for (let i = random(4) + 1; i > 0; i--) {
        const name = names[random(names.length)], spot = positions.get(name);
        const value = spot.cell ? cellValues[random(4)] : pixelValues[random(4)];
        if (spot.cell) change.cells.push([name, value]);
        else change.runs.push([spot.x, spot.y, 1, value]);
        removeFrom(spot, id);
        spot.stack.push(id);
        stroke.values.set(name, value);
      }
      go(ledger.submit(by, id, change));
    } else if (roll < 7 && live.length) {
      const [id, stroke] = live[random(live.length)];
      const before = new Map(names.map((name) => [name, shown(positions.get(name))]));
      for (const spot of positions.values()) removeFrom(spot, id);
      stroke.undone = true;
      const numbered = go(ledger.undo(stroke.by, id));
      const listed = numbered.cells.length + numbered.runs.reduce((sum, run) => sum + run[2], 0);
      const changed = names.filter((name) => {
        const a = before.get(name), b = shown(positions.get(name));
        return positions.get(name).cell ? JSON.stringify(a) !== JSON.stringify(b) : a !== b;
      }).length;
      assert.equal(listed, changed, 'an undo lists exactly what changes');
    } else if (roll < 9 && undone.length) {
      const [id, stroke] = undone[random(undone.length)];
      stroke.undone = false;
      for (const name of stroke.values.keys()) positions.get(name).stack.push(id);
      go(ledger.redo(stroke.by, id));
    } else if (strokes.size) {
      const ids = [...strokes.keys()], id = ids[random(ids.length)], stroke = strokes.get(id);
      if (!stroke.undone) {
        for (const [name, value] of stroke.values) {
          const spot = positions.get(name), at = spot.stack.indexOf(id);
          for (const lower of spot.stack.slice(0, at)) strokes.get(lower).values.delete(name);
          spot.stack = spot.stack.slice(at + 1);
          spot.base = value;
        }
      }
      strokes.delete(id);
      ledger.forget(id);
    }

    for (const [name, spot] of positions) {
      if (spot.cell) assert.deepEqual(pic.cells.get(name) ?? null, shown(spot), `cell ${name} at step ${step}`);
      else assert.equal(pic.px(spot.x, spot.y), shown(spot), `pixel ${name} at step ${step}`);
    }
    assert.equal(ledger.sum, pic.sum(), `sum at step ${step}`);
  }
});

test('off numbering, the tail stays empty and the sum still, until startNumbering seeds it', () => {
  const ledger = new Ledger({ readCell: () => null, readTile: () => new Uint8ClampedArray(TILE * TILE * 4), numbering: false });
  const cell = { char: 'a' };
  ledger.submit('me', 's', { cells: [['0,0', cell]], runs: [[1, 1, 2, 0xff0000ff]] });
  ledger.undo('me', 's');
  ledger.redo('me', 's');
  assert.deepEqual(ledger.tail.items, []);
  assert.equal(ledger.sum, 0);
  assert.equal(ledger.n, 3);

  ledger.startNumbering({ sum: 7 });
  assert.equal(ledger.sum, 7);
  const numbered = ledger.submit('me', 's', { cells: [['0,0', { char: 'b' }]] });
  assert.deepEqual(ledger.tail.items, [numbered]);
  assert.equal(ledger.sum, 7 ^ hashCell('0,0', cell) ^ hashCell('0,0', { char: 'b' }));
});

test('rename: the same person under another name keeps their strokes', () => {
  const pic = picture();
  const ledger = new Ledger({ readCell: pic.readCell, readTile: pic.readTile });
  ledger.submit('me', 's1', { cells: [['1,1', X]] });
  ledger.submit('them', 's2', { cells: [['2,2', Y]] });
  ledger.rename('me', 'sub');
  assert.equal(ledger.undo('me', 's1'), null);
  assert.deepEqual(ledger.undo('sub', 's1').cells, [['1,1', null]]);
  assert.equal(ledger.undo('sub', 's2'), null);
});

test('stopNumbering: from there on the tail and the sum stand still, and numbers still count', () => {
  const pic = picture();
  const ledger = new Ledger({ readCell: pic.readCell, readTile: pic.readTile });
  ledger.submit('a', 's1', { cells: [['1,1', X]] });
  const { sum } = ledger;
  ledger.stopNumbering();
  const numbered = ledger.submit('a', 's2', { cells: [['2,2', Y]] });
  assert.equal(numbered.n, 2);
  assert.equal(ledger.sum, sum);
  assert.equal(ledger.tail.items.length, 1);
});

test('a change too big for mostBytes takes several numbers, all in the tail; alone it is one', () => {
  const pic = picture();
  const cells = Array.from({ length: 200 }, (_, i) => [`${i},0`, X]);
  const small = new Ledger({ readCell: pic.readCell, readTile: pic.readTile, mostBytes: 1000 });
  const whole = small.submit('a', 's1', { cells });
  assert.ok(whole.parts.length > 1);
  assert.deepEqual(whole.cells, cells); // the caller writes the whole of it, and sends the parts
  assert.equal(whole.n, small.n);
  whole.parts.forEach((part, i) => {
    assert.equal(part.stroke, 's1');
    assert.equal(part.n, whole.n - whole.parts.length + 1 + i);
    assert.ok(JSON.stringify({ cells: part.cells, runs: part.runs }).length <= 1000);
  });
  assert.deepEqual(whole.parts.flatMap((part) => part.cells), cells);
  assert.deepEqual(small.tail.items.map(({ n }) => n), whole.parts.map(({ n }) => n));

  const undone = small.undo('a', 's1');
  assert.ok(undone.parts.length > 1);
  assert.equal(small.tail.items.at(-1).n, undone.n);

  const fits = small.submit('a', 's2', { cells: [['9,9', Y]] });
  assert.equal(fits.parts, undefined);

  const alone = new Ledger({ readCell: pic.readCell, readTile: pic.readTile, mostBytes: 1000, numbering: false });
  assert.equal(alone.submit('a', 's1', { cells }).parts, undefined);
});

test('a ledger with as many strokes as its limits leave passes keptFromWire, and one more can\'t be from a ledger', () => {
  const { ledger, drawCell } = setup({}, { limits: true, epoch: 'e' });
  for (let person = 0; person < 64; person++) for (let i = 0; i < 51; i++) drawCell(`p${person}`, `s${person}-${i}`, `${person},${i}`, { char: 'x' });
  const full = keptForWire(ledger.kept());
  assert.equal(full.strokes.length, 64 * 50);
  assert.ok(keptFromWire(full));
  const stroke = { id: 'one-more', by: 'p64', undone: false, bytes: 0, cells: [], paint: [] };
  assert.throws(() => keptFromWire({ ...full, strokes: [...full.strokes, stroke] }), /Not a ledger/);
});

test('a ledger with as many cells as its bytes hold passes keptFromWire, and one more can\'t be from a ledger', () => {
  const { ledger } = setup({}, { limits: true, epoch: 'e' });
  const strokes = 16, each = MOST_BYTES / CELL_BYTES / strokes;
  for (let s = 0; s < strokes; s++) ledger.submit('ann', `s${s}`, { cells: Array.from({ length: each }, (_, i) => [`${i},${s}`, { char: 'x' }]), runs: [] });
  const full = keptForWire(ledger.kept());
  assert.equal(full.cells.length, MOST_BYTES / CELL_BYTES);
  assert.ok(keptFromWire(full));
  assert.throws(() => keptFromWire({ ...full, cells: [...full.cells, ['0,99', null, []]] }), /Not a ledger/);
  ledger.submit('ann', 'more', { cells: [['0,99', { char: 'y' }]], runs: [] });
  assert.ok(keptFromWire(keptForWire(ledger.kept())));   // past its bytes, the oldest went
});
