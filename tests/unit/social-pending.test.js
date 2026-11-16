// Pending: an artist's own strokes shown before the host has numbered them, and the screens ending up the same.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Pending } from '../../src/social/pending.js';
import { Ledger } from '../../src/document/ledger.js';
import { eachPixel, hashCell, hashPixel } from '../../src/document/changes.js';
import { TILE } from '../../src/document/History.js';
import { keyLayer, layerKey } from '../../src/document/layerInfo.js';

const RED = 0xff0000ff, GREEN = 0x00ff00ff, BLUE = 0x0000ffff;
const cell = (char) => Object.freeze({ char });
const MINE = cell('m'), THEIRS = cell('t'), START = cell('s'), MORE = cell('+');

const cellsOf = (...cells) => ({ cells, runs: [] });
const runsOf = (...runs) => ({ cells: [], runs });
const from = (by, stroke, n, change) => ({ n, by, stroke, cells: [], runs: [], ...change });

// A screen over Maps, as a store would be. A cell position is its key; a pixel's is [x, y, id], kept under its layer's key
// for 'x,y' (layerKey: the edit layer's bare).
const pixelKey = ([x, y, id]) => layerKey(id, `${x},${y}`);
function screen({ cells = [], pixels = [] } = {}) {
  const shown = { cells: new Map(cells), pixels: new Map(pixels) };
  return Object.assign(shown, {
    read: (at) => (typeof at === 'string' ? shown.cells.get(at) ?? null : shown.pixels.get(pixelKey(at)) ?? 0),
    write(at, value) {
      const [map, key] = typeof at === 'string' ? [shown.cells, at] : [shown.pixels, pixelKey(at)];
      if (value) map.set(key, value);
      else map.delete(key);
    },
    show({ cells: changed = [], runs = [] }) {
      for (const [key, entry] of changed) shown.write(key, entry);
      eachPixel(runs, (x, y, rgba, id = 'edit') => shown.write([x, y, id], rgba));
    },
    px: (x, y, id = 'edit') => shown.pixels.get(pixelKey([x, y, id])) ?? 0,
    readTile(x, y, id = 'edit') {
      const data = new Uint8ClampedArray(TILE * TILE * 4);
      for (const [name, rgba] of shown.pixels) {
        const { id: on, key } = keyLayer(name), [px, py] = key.split(',').map(Number);
        if (on !== id || px < x || py < y || px >= x + TILE || py >= y + TILE) continue;
        data.set([rgba >>> 24, (rgba >>> 16) & 0xff, (rgba >>> 8) & 0xff, rgba & 0xff], ((py - y) * TILE + (px - x)) * 4);
      }
      return data;
    },
    // The check, worked out the slow way.
    sum() {
      let sum = 0;
      for (const [key, entry] of shown.cells) sum ^= hashCell(key, entry);
      for (const [name, rgba] of shown.pixels) {
        const { id, key } = keyLayer(name), [x, y] = key.split(',').map(Number);
        sum ^= hashPixel(x, y, rgba, id);
      }
      return sum;
    },
  });
}

// One artist: a screen and a Pending. A stroke goes into pending, then shows.
function artist(me, start) {
  const own = screen(start);
  const pending = new Pending({ me, read: own.read, write: own.write });
  pending.seedSum(own.sum());
  return {
    me, own, pending,
    draw(stroke, change) {
      pending.add(stroke, change);
      own.show(change);
    },
  };
}

// The host: a real Ledger over its own screen, and everything it has numbered in order.
function host(start) {
  const own = screen(start);
  const ledger = new Ledger({ readCell: (key) => own.cells.get(key), readTile: own.readTile, sum: own.sum() });
  const numbered = [];
  const take = (message) => {
    if (!message) return null; // refused
    own.show(message);
    numbered.push(message);
    return message;
  };
  return {
    own, ledger, numbered,
    submit: (by, stroke, change) => take(ledger.submit(by, stroke, change)),
    undo: (by, stroke) => take(ledger.undo(by, stroke)),
  };
}

const same = (a, b, label) => {
  assert.deepEqual(Object.fromEntries(a.cells), Object.fromEntries(b.cells), `${label}: cells`);
  assert.deepEqual(Object.fromEntries(a.pixels), Object.fromEntries(b.pixels), `${label}: pixels`);
};

test('my stroke shows at once and another\'s earlier change doesn\'t cover it', () => {
  const me = artist('me');
  me.draw('s1', { cells: [['0,0', MINE]], runs: [[0, 0, 1, RED]] });
  assert.equal(me.own.cells.get('0,0'), MINE);

  me.pending.heard(from('them', 't1', 1, { cells: [['0,0', THEIRS], ['1,0', THEIRS]], runs: [[0, 0, 2, GREEN]] }));

  assert.equal(me.own.cells.get('0,0'), MINE, 'held');
  assert.equal(me.own.px(0, 0), RED, 'held');
  assert.equal(me.own.cells.get('1,0'), THEIRS, 'not held');
  assert.equal(me.own.px(1, 0), GREEN, 'not held');
});

test('heard says what reached the screen, and an echo changed nothing there', () => {
  const me = artist('me');
  me.draw('s1', { cells: [['0,0', MINE]], runs: [[1, 0, 1, RED]] });

  const { applied } = me.pending.heard(from('them', 't1', 1, { cells: [['0,0', THEIRS], ['1,0', THEIRS]], runs: [[0, 0, 3, GREEN]] }));
  assert.deepEqual(applied, { cells: [['1,0', THEIRS]], runs: [[0, 0, 1, GREEN], [2, 0, 1, GREEN]] });

  const echo = me.pending.heard(from('me', 's1', 2, { cells: [['0,0', MINE]], runs: [[1, 0, 1, RED]] }));
  assert.deepEqual(echo.applied, { cells: [], runs: [] });
  assert.equal(me.pending.size, 0);
});

test('the two screens match whichever order the host chose', () => {
  const orders = { aFirst: ['a', 'b'], bFirst: ['b', 'a'] };
  const finals = {};
  for (const [name, order] of Object.entries(orders)) {
    const a = artist('a'), b = artist('b'), hosting = host();
    const strokes = {
      a: { stroke: 'sa', cells: [['0,0', MINE]], runs: [[TILE - 1, 0, 2, RED]] },
      b: { stroke: 'sb', cells: [['0,0', THEIRS]], runs: [[TILE - 1, 0, 2, GREEN]] },
    };
    a.draw('sa', strokes.a);
    b.draw('sb', strokes.b);
    for (const who of order) hosting.submit(who, strokes[who].stroke, strokes[who]);
    for (const numbered of hosting.numbered) {
      a.pending.heard(numbered);
      b.pending.heard(numbered);
    }
    same(a.own, hosting.own, `${name} a`);
    same(b.own, hosting.own, `${name} b`);
    assert.equal(a.pending.size + b.pending.size, 0);
    assert.equal(a.pending.sum, hosting.ledger.sum);
    finals[name] = hosting.own.cells.get('0,0');
  }
  // Whoever the host numbered second is on top: one of the two artists saw theirs flip.
  assert.equal(finals.aFirst, THEIRS);
  assert.equal(finals.bFirst, MINE);
});

test('dropAll goes back to the last agreed picture, including what my stroke had hidden', () => {
  const me = artist('me', { cells: [['0,0', START]], pixels: [['0,0', BLUE]] });
  me.draw('s1', { cells: [['0,0', MINE], ['1,0', MINE]], runs: [[0, 0, 2, RED]] });
  me.draw('s2', { cells: [['0,0', MORE]], runs: [[0, 0, 1, GREEN]] });
  me.pending.heard(from('them', 't1', 1, cellsOf(['1,0', THEIRS])));
  me.pending.heard(from('them', 't2', 2, runsOf([1, 0, 1, BLUE])));

  me.pending.dropAll();

  assert.equal(me.own.cells.get('0,0'), START, 'beneath both of my strokes');
  assert.equal(me.own.px(0, 0), BLUE);
  assert.equal(me.own.cells.get('1,0'), THEIRS, 'heard while my stroke hid it');
  assert.equal(me.own.px(1, 0), BLUE);
  assert.equal(me.pending.size, 0);
  assert.deepEqual(me.pending.resend(), []);
});

test('sum follows the agreed picture, not the one on screen', () => {
  const start = { cells: [['0,0', START]], pixels: [['0,0', BLUE]] };
  const me = artist('me', start), hosting = host(start);
  assert.equal(me.pending.sum, hosting.ledger.sum);

  const before = me.pending.sum;
  const mine = { cells: [['0,0', MINE]], runs: [[0, 0, 1, RED]] };
  me.draw('s1', mine);
  assert.equal(me.pending.sum, before, 'pending isn\'t agreed');

  me.pending.heard(hosting.submit('them', 't1', { cells: [['0,0', THEIRS], ['1,0', THEIRS]], runs: [[0, 0, 2, GREEN]] }));
  assert.equal(me.pending.sum, hosting.ledger.sum, 'theirs is agreed, even where mine covers it');
  assert.notEqual(me.pending.sum, me.own.sum());

  me.pending.heard(hosting.submit('me', 's1', mine));
  assert.equal(me.pending.sum, hosting.ledger.sum);
  assert.equal(me.pending.sum, me.own.sum());
});

test('paint: pending pixels hold; neighbors in the same tile take the other artist\'s change', () => {
  const me = artist('me');
  me.draw('s1', runsOf([5, 5, 2, RED]));
  me.pending.heard(from('them', 't1', 1, runsOf([4, 5, 4, GREEN], [5, 6, 1, GREEN])));

  assert.equal(me.own.px(4, 5), GREEN);
  assert.equal(me.own.px(5, 5), RED);
  assert.equal(me.own.px(6, 5), RED);
  assert.equal(me.own.px(7, 5), GREEN);
  assert.equal(me.own.px(5, 6), GREEN);
});

test('paint on two layers at one spot is kept apart', () => {
  const me = artist('me'), hosting = host();
  const mine = { cells: [], runs: [[0, 0, 1, RED]] }, above = { cells: [], runs: [[0, 0, 1, GREEN, 'L2']] };
  me.draw('s1', mine);
  me.draw('s2', above);
  assert.equal(me.own.px(0, 0), RED);
  assert.equal(me.own.px(0, 0, 'L2'), GREEN);
  me.pending.heard(hosting.submit('me', 's1', mine));
  me.pending.heard(hosting.submit('them', 't1', runsOf([0, 0, 1, BLUE])));
  me.pending.heard(hosting.submit('them', 't2', runsOf([0, 0, 1, BLUE, 'L2'])));
  assert.equal(me.own.px(0, 0), BLUE, 'the edit layer\'s pixel is no longer held');
  assert.equal(me.own.px(0, 0, 'L2'), GREEN, 'L2\'s still is');
  me.pending.heard(hosting.submit('me', 's2', above));
  same(me.own, hosting.own, 'after the echo');
  assert.equal(me.pending.size, 0);
  assert.equal(me.pending.sum, hosting.ledger.sum);
  assert.equal(me.pending.sum, me.own.sum());
});

test('a transparent pixel is a value: it can be pending, and it can be what\'s agreed beneath', () => {
  const me = artist('me', { pixels: [['0,0', BLUE]] });
  me.draw('s1', runsOf([0, 0, 2, 0]));
  me.pending.heard(from('them', 't1', 1, runsOf([0, 0, 1, GREEN])));
  assert.equal(me.own.px(0, 0), 0, 'my erasing holds');

  me.pending.heard(from('them', 't2', 2, runsOf([0, 0, 1, 0])));
  me.pending.heard(from('them', 't3', 3, runsOf([1, 0, 1, RED])));
  me.pending.dropAll();
  assert.equal(me.own.px(0, 0), 0);
  assert.equal(me.own.px(1, 0), RED);
});

test('resend gives the unechoed changes in their order', () => {
  const me = artist('me');
  const first = cellsOf(['0,0', MINE]), second = runsOf([0, 0, 1, RED]), third = cellsOf(['1,0', MINE]);
  me.draw('s1', first);
  me.draw('s1', second);
  me.draw('s2', third);
  me.pending.heard(from('me', 's1', 1, first));

  assert.deepEqual(me.pending.resend(), [{ stroke: 's1', ...second }, { stroke: 's2', ...third }]);
  assert.equal(me.pending.size, 2);
});

test('resend starts the count over: the host counts what it gets on this connection afresh', () => {
  const me = artist('me');
  const first = cellsOf(['0,0', MINE]), second = cellsOf(['1,0', MINE]);
  me.draw('s1', first);
  me.pending.newConnection();   // what was sent is older than this connection now
  me.draw('s1', second);
  assert.deepEqual(me.pending.resend(), [{ stroke: 's1', ...first }, { stroke: 's1', ...second }]);

  // Project took 1, so the first is theirs; had resend left the count, it would be taken from the wrong end.
  me.pending.dropTaken(1);
  assert.deepEqual(me.pending.waiting, [{ stroke: 's1', ...second }]);
});

test('the echo of my undo is an ordinary change: held beneath my newer stroke, written elsewhere', () => {
  const me = artist('me', { cells: [['0,0', START], ['1,0', START]] });
  const hosting = host({ cells: [['0,0', START], ['1,0', START]] });
  const older = cellsOf(['0,0', MINE], ['1,0', MINE]), newer = cellsOf(['0,0', MORE]);

  me.draw('old', older);
  me.pending.heard(hosting.submit('me', 'old', older));
  me.draw('new', newer);

  const undone = hosting.undo('me', 'old');
  me.pending.heard(undone);
  assert.equal(me.pending.size, 1, 'it isn\'t the echo of what\'s pending');
  assert.equal(me.own.cells.get('0,0'), MORE, 'my newer stroke holds');
  assert.equal(me.own.cells.get('1,0'), START, 'nothing pending here: it\'s written');
  assert.equal(me.pending.sum, hosting.ledger.sum);

  me.pending.heard(hosting.submit('me', 'new', newer));
  assert.equal(me.pending.size, 0);
  same(me.own, hosting.own, 'after the echo');
});

test('a number of mine for a stroke that isn\'t the oldest pending clears nothing', () => {
  const me = artist('me');
  me.draw('s1', cellsOf(['0,0', MINE]));
  me.draw('s2', cellsOf(['1,0', MINE]));

  me.pending.heard(from('me', 's2', 1, cellsOf(['2,0', MORE])));
  assert.equal(me.pending.size, 2, 'only the oldest can echo');
  assert.equal(me.own.cells.get('2,0'), MORE);
});

test('someone else with my stroke id isn\'t my echo', () => {
  const me = artist('me');
  me.draw('s1', cellsOf(['0,0', MINE]));
  me.pending.heard(from('them', 's1', 1, cellsOf(['0,0', THEIRS])));
  assert.equal(me.pending.size, 1);
  assert.equal(me.own.cells.get('0,0'), MINE);
});

test('a position stays held until the last pending change on it echoes', () => {
  const me = artist('me');
  const first = { cells: [['0,0', MINE]], runs: [[0, 0, 1, RED]] };
  const second = { cells: [['0,0', MORE]], runs: [[0, 0, 1, GREEN]] };
  me.draw('s1', first);
  me.draw('s2', second);

  me.pending.heard(from('me', 's1', 1, first));
  me.pending.heard(from('them', 't1', 2, { cells: [['0,0', THEIRS]], runs: [[0, 0, 1, BLUE]] }));
  assert.equal(me.own.cells.get('0,0'), MORE, 'still held by the second');
  assert.equal(me.own.px(0, 0), GREEN);

  me.pending.heard(from('me', 's2', 3, second));
  assert.equal(me.own.cells.get('0,0'), MORE);
  assert.equal(me.own.px(0, 0), GREEN);

  me.pending.heard(from('them', 't2', 4, { cells: [['0,0', THEIRS]], runs: [[0, 0, 1, BLUE]] }));
  assert.equal(me.own.cells.get('0,0'), THEIRS, 'no longer held');
  assert.equal(me.own.px(0, 0), BLUE);
});

test('an echo that leaves a position still held moves what\'s agreed there to the echoed value', () => {
  const me = artist('me', { cells: [['0,0', START]], pixels: [['0,0', BLUE]] });
  const first = { cells: [['0,0', MINE]], runs: [[0, 0, 1, RED]] };
  me.draw('s1', first);
  me.draw('s2', { cells: [['0,0', MORE]], runs: [[0, 0, 1, GREEN]] });

  me.pending.heard(from('me', 's1', 1, first));
  me.pending.dropAll();

  assert.equal(me.own.cells.get('0,0'), MINE);
  assert.equal(me.own.px(0, 0), RED);
});

test('reapply puts pending back after a project, over the project\'s picture', () => {
  const me = artist('me', { cells: [['0,0', START]], pixels: [['0,0', BLUE]] });
  me.draw('s1', { cells: [['0,0', MINE]], runs: [[0, 0, 1, RED]] });
  me.draw('s2', { cells: [['0,0', MORE]], runs: [[0, 0, 1, GREEN], [TILE, 0, 1, GREEN]] });

  // The project replaces everything on screen, and seeds what it says.
  me.own.cells = new Map([['0,0', THEIRS]]);
  me.own.pixels = new Map([[`${TILE},0`, BLUE]]);
  me.pending.seedSum(me.own.sum());
  me.pending.n = 40;
  me.pending.reapply();

  assert.equal(me.own.cells.get('0,0'), MORE);
  assert.equal(me.own.px(0, 0), GREEN);
  assert.equal(me.own.px(TILE, 0), GREEN);
  assert.equal(me.pending.size, 2);
  assert.equal(me.pending.n, 40);

  me.pending.dropAll();
  assert.equal(me.own.cells.get('0,0'), THEIRS, 'the project is what\'s agreed now');
  assert.equal(me.own.px(0, 0), 0);
  assert.equal(me.own.px(TILE, 0), BLUE);
});

test('n is the last number heard, and every Numbered goes in the tail, my echoes too', () => {
  const me = artist('me');
  me.pending.n = 4;
  const theirs = from('them', 't1', 5, cellsOf(['1,0', THEIRS]));
  const mine = from('me', 's1', 6, cellsOf(['0,0', MINE]));
  me.draw('s1', cellsOf(['0,0', MINE]));

  me.pending.heard(theirs);
  assert.equal(me.pending.n, 5);
  me.pending.heard(mine);
  assert.equal(me.pending.n, 6);
  assert.deepEqual(me.pending.tail.since(4), [theirs, mine]);
});

test('each position is read once, however many changes hold it', () => {
  const reads = [];
  const own = screen();
  const pending = new Pending({ me: 'me', read: (at) => { reads.push(at); return own.read(at); }, write: own.write });
  pending.add('s1', { cells: [['0,0', MINE]], runs: [[0, 0, 2, RED]] });
  pending.add('s2', { cells: [['0,0', MORE]], runs: [[0, 0, 2, GREEN]] });
  assert.deepEqual(reads, ['0,0', [0, 0, 'edit'], [1, 0, 'edit']]);
});

// A small seeded generator, so a failure repeats.
function random(seed) {
  let state = seed;
  return (below) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % below;
  };
}

// The layer with the id taken off a screen, after drop(share) with its part of the check as the screen showed it, as a
// room's delete reads it before the layer goes (dropFromSums).
function dropFrom(shown, id, drop) {
  const on = (at) => keyLayer(at).id === id;
  let share = 0;
  for (const [key, entry] of shown.cells) if (on(key)) share ^= hashCell(key, entry);
  for (const [at, rgba] of shown.pixels) if (on(at)) share ^= hashPixel(...keyLayer(at).key.split(',').map(Number), rgba, id);
  drop(share);
  for (const key of [...shown.cells.keys()]) if (on(key)) shown.cells.delete(key);
  for (const at of [...shown.pixels.keys()]) if (on(at)) shown.pixels.delete(at);
}

// VITE_FUZZ_SEEDS=n runs seeds 1..n.
const FUZZ_SEEDS = Number(process.env.VITE_FUZZ_SEEDS ?? 0);
const fuzzSeeds = (seeds) => (FUZZ_SEEDS ? Array.from({ length: FUZZ_SEEDS }, (_, i) => i + 1) : seeds);

// Drawing on the edit layer and a second one, which the host sometimes deletes (a numbered stack change: the ledger and
// each Pending drop it as they hear it, the share read from their own screen) and adds another in its place, with a new
// id. A change drawn on it before the artist heard has that part left out at the host (withoutRemoved), the rest numbered.
for (const seed of fuzzSeeds([1, 2, 3, 4, 5, 6, 7, 8])) {
  test(`every order of drawing, numbering, undoing and hearing ends with the same picture (seed ${seed})`, () => {
    const roll = random(seed);
    const start = { cells: [['0,0', START]], pixels: [[`${TILE - 1},0`, BLUE]] };
    const hosting = host(start), sumAt = new Map(), removed = new Set();
    let layers = 0;
    const people = ['a', 'b'].map((me) => Object.assign(artist(me, start), { outbox: [], heardUpTo: 0, strokes: [], made: 0, layers: 0 }));
    const colors = [RED, GREEN, BLUE, 0], values = [MINE, THEIRS, MORE, null];
    const layerOf = (count) => `L${count + 2}`; // the second layer, as someone who's heard count deletes has it

    const anyChange = (person) => {
      const id = roll(2) ? 'edit' : layerOf(person.layers);
      const cells = roll(2) ? [[layerKey(id, `${roll(3)},0`), values[roll(values.length)]]] : [];
      const run = [TILE - 2 + roll(4), roll(2), 1 + roll(3), colors[roll(colors.length)]];
      const runs = roll(2) ? [id === 'edit' ? run : [...run, id]] : [];
      return cells.length || runs.length ? { cells, runs } : { cells: [['0,0', MINE]], runs: [] };
    };
    const dropLayer = () => {
      const id = layerOf(layers++);
      dropFrom(hosting.own, id, (share) => hosting.ledger.dropLayer(id, share));
      removed.add(id);
      const message = { t: 'layers', n: hosting.ledger.note(), id };
      hosting.numbered.push(message);
      sumAt.set(message.n, hosting.ledger.sum);
      assert.equal(hosting.ledger.sum, hosting.own.sum(), 'the host\'s check after a delete');
    };
    const draw = (person) => {
      // Sometimes the next slice of the stroke being drawn, so one stroke has several numbers.
      const last = person.strokes.at(-1);
      const stroke = last && !last.undone && roll(2) ? last : { id: `${person.me}${person.made++}`, undone: false };
      if (stroke !== last) person.strokes.push(stroke);
      const change = anyChange(person);
      person.draw(stroke.id, change);
      person.outbox.push({ stroke: stroke.id, change });
    };
    const undo = (person) => {
      const stroke = person.strokes.filter(({ undone }) => !undone)[0];
      if (!stroke) return;
      stroke.undone = true;
      person.outbox.push({ stroke: stroke.id });
    };
    const number = (person) => {
      const message = person.outbox.shift();
      if (!message) return;
      const kept = (id) => !removed.has(id);
      const change = message.change && {
        cells: message.change.cells.filter(([key]) => kept(keyLayer(key).id)),
        runs: message.change.runs.filter((run) => kept(run[4] ?? 'edit')),
      };
      const numbered = change
        ? hosting.submit(person.me, message.stroke, change)
        : hosting.undo(person.me, message.stroke);
      if (numbered) sumAt.set(numbered.n, hosting.ledger.sum); // an undo of a stroke left with nothing is refused
    };
    const hear = (person) => {
      const numbered = hosting.numbered[person.heardUpTo++];
      if (!numbered) { person.heardUpTo--; return; }
      if (numbered.t === 'layers') {
        dropFrom(person.own, numbered.id, (share) => person.pending.dropLayer(numbered.id, share));
        person.pending.n = numbered.n;
        person.layers++;
      } else person.pending.heard(numbered);
      assert.equal(person.pending.sum, sumAt.get(numbered.n), `${person.me}'s check at ${numbered.n}`);
    };

    for (let step = 0; step < 300; step++) {
      const person = people[roll(2)];
      const what = roll(21);
      if (what < 6) draw(person);
      else if (what < 8) undo(person);
      else if (what < 14) number(person);
      else if (what < 20) hear(person);
      else dropLayer();
    }
    for (const person of people) while (person.outbox.length) number(person);
    for (const person of people) while (person.heardUpTo < hosting.numbered.length) hear(person);

    for (const person of people) {
      assert.equal(person.pending.size, 0);
      assert.ok(person.heardUpTo > 0);
      same(person.own, hosting.own, person.me);
      assert.equal(person.pending.sum, hosting.own.sum());
    }
  });
}

test('retract takes back the newest change, which never went out: what it held shows again', () => {
  const { pending, own: shown } = artist('me', { cells: [['1,1', START]], pixels: [['0,0', RED]] });
  const older = cellsOf(['2,2', MINE]);
  pending.add('s1', older);
  shown.show(older);
  const held = { cells: [['1,1', MINE], ['2,2', MORE]], runs: [[0, 0, 2, GREEN]] };
  pending.add('s2', held);
  shown.show(held);

  // Heard meanwhile: what's beneath changes, and the screen keeps mine.
  pending.heard(from('them', 't', 1, { cells: [['1,1', THEIRS]], runs: [[0, 0, 1, BLUE]] }));
  assert.equal(shown.read('1,1'), MINE);
  const sum = pending.sum;

  pending.retract();
  assert.equal(pending.size, 1);
  assert.equal(shown.read('1,1'), THEIRS);
  assert.equal(shown.read('2,2'), MINE); // still held by the older one, and that's what shows
  assert.equal(shown.px(0, 0), BLUE);
  assert.equal(shown.px(1, 0), 0);
  assert.equal(pending.sum, sum); // nothing about the agreed picture changed

  // What it held is free again: the next number writes straight through.
  pending.heard(from('them', 't', 2, { cells: [['1,1', START]], runs: [[1, 0, 1, RED]] }));
  assert.equal(shown.read('1,1'), START);
  assert.equal(shown.px(1, 0), RED);
  pending.heard(from('me', 's1', 3, older));
  assert.equal(pending.size, 0);
});

test('retract over an older pending pixel shows the older one', () => {
  const { pending, own: shown } = artist('me');
  const older = runsOf([0, 0, 2, RED]);
  pending.add('s1', older);
  shown.show(older);
  const held = runsOf([1, 0, 1, GREEN]);
  pending.add('s2', held);
  shown.show(held);
  pending.retract();
  assert.equal(shown.px(1, 0), RED);
  pending.heard(from('me', 's1', 1, older));
  assert.equal(pending.size, 0);
  pending.heard(from('them', 't', 2, runsOf([1, 0, 1, BLUE])));
  assert.equal(shown.px(1, 0), BLUE);
});

test('dropTaken drops only what the host has handled and no echo has told of, oldest first', () => {
  const { pending, own: shown } = artist('me');
  const one = cellsOf(['1,1', MINE]), two = cellsOf(['2,2', MINE]), three = cellsOf(['3,3', MINE]);
  for (const [stroke, change] of [['s1', one], ['s2', two], ['s3', three]]) {
    pending.add(stroke, change);
    shown.show(change);
  }
  pending.heard(from('me', 's1', 1, one));
  pending.dropTaken(2);   // s1 was echoed, so of the two handled only s2 is left to drop
  pending.reapply();
  assert.equal(pending.size, 1);
  pending.dropTaken(2);   // the same count again: nothing new was handled
  assert.equal(pending.size, 1);
  pending.heard(from('me', 's3', 2, three));   // numbered after: its echo comes, and clears it
  assert.equal(pending.size, 0);
  pending.heard(from('them', 't', 3, cellsOf(['3,3', THEIRS])));
  assert.equal(shown.read('3,3'), THEIRS);
});

test('dropTaken counts changes from this connection on: an older one waits for its own echo', () => {
  const { pending, own: shown } = artist('me');
  const old = cellsOf(['1,1', MINE]), mine = cellsOf(['2,2', MINE]), last = cellsOf(['3,3', MINE]);
  pending.add('old', old);
  shown.show(old);
  pending.newConnection();
  pending.add('mine', mine);
  shown.show(mine);
  pending.add('last', last);
  shown.show(last);
  pending.heard(from('me', 'old', 1, old));   // from the tail: the new connection's count doesn't include it
  pending.dropTaken(1);
  pending.reapply();
  assert.equal(pending.size, 1);
  pending.heard(from('me', 'last', 2, last));
  assert.equal(pending.size, 0);
});

test('dropTaken from a host saying too many stops at what there is', () => {
  const { pending } = artist('me');
  pending.add('s1', cellsOf(['1,1', MINE]));
  pending.dropTaken(99);
  assert.equal(pending.size, 0);
});

test('dropping a layer forgets what waits on it', () => {
  const me = artist('me', { cells: [['L2:1,1', START]], pixels: [['L2:0,0', BLUE]] });
  me.draw('s1', { cells: [['L2:2,2', MINE], ['3,3', MINE]], runs: [[0, 0, 1, RED, 'L2'], [0, 0, 1, RED]] });
  const share = hashCell('L2:1,1', START) ^ hashCell('L2:2,2', MINE) ^ hashPixel(0, 0, RED, 'L2'); // L2 as the screen shows it
  me.pending.dropLayer('L2', share);
  for (const map of [me.own.cells, me.own.pixels]) for (const key of map.keys()) if (keyLayer(key).id === 'L2') map.delete(key); // the layer goes
  me.pending.lift();
  assert.equal(me.own.px(0, 0, 'L2'), 0, 'nothing written on the layer that went');
  assert.equal(me.own.cells.get('L2:2,2'), undefined);
  assert.equal(me.own.px(0, 0), 0, 'the edit layer\'s run was still held: lift shows what\'s agreed');
  assert.equal(me.own.cells.get('3,3'), undefined);
  assert.equal(me.pending.sum, me.own.sum());
  assert.equal(me.pending.size, 1, 'its number still comes');
  me.pending.heard(from('me', 's1', 1, { cells: [['3,3', MINE]], runs: [[0, 0, 1, RED]] })); // the host numbers the rest
  assert.equal(me.pending.size, 0);
  assert.equal(me.pending.sum, me.own.sum());
});
