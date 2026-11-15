// The desktop app's windows (desktop/windows.js): where a file opens, where a new window sits, and leaving.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { cascade, fileTarget, leave } from '../../desktop/windows.js';

const win = (id, extra = {}) => ({ id, hasImage: false, claimed: false, file: null, ...extra });

test('a file already open goes to its window, even with another focused and empty', () => {
  const windows = [win(1), win(2, { hasImage: true, file: '/a.phosphor' })];
  assert.deepEqual(fileTarget(windows, 1, '/a.phosphor'), { id: 2, existing: true });
});

test('an empty focused window takes the file; one with an image, a claim or no focus does not', () => {
  assert.deepEqual(fileTarget([win(1)], 1, '/a.png'), { id: 1, existing: false });
  assert.deepEqual(fileTarget([win(1, { hasImage: true })], 1, '/a.png'), { id: null, existing: false });
  assert.deepEqual(fileTarget([win(1, { claimed: true })], 1, '/a.png'), { id: null, existing: false });
  assert.deepEqual(fileTarget([win(1)], null, '/a.png'), { id: null, existing: false });
});

test('a new window is centered with no focused window, and clipped to a small display', () => {
  assert.deepEqual(cascade(null, { x: 0, y: 0, width: 2560, height: 1440 }), { width: 1400, height: 900 });
  assert.deepEqual(cascade(null, { x: 0, y: 0, width: 1280, height: 800 }), { width: 1280, height: 800 });
});

test('a new window cascades from the focused one and wraps to the work area corner', () => {
  const area = { x: 0, y: 25, width: 2560, height: 1415 };
  assert.deepEqual(cascade({ x: 100, y: 80, width: 1400, height: 900 }, area), { x: 128, y: 108, width: 1400, height: 900 });
  assert.deepEqual(cascade({ x: 1200, y: 80, width: 1400, height: 900 }, area), { x: 0, y: 25, width: 1400, height: 900 });
  assert.deepEqual(cascade({ x: 100, y: 600, width: 1400, height: 900 }, area), { x: 0, y: 25, width: 1400, height: 900 });
});

const entries = [{ n: 1 }, { n: 2 }, { n: 3 }];

test('leaving stops at the first Stay and hands nothing over', async () => {
  const asked = [];
  let handed = 0;
  const left = await leave(entries, {
    unsaved: async (e) => e.n === 2,
    ask: async (e) => { asked.push(e.n); return false; },
    handOver: async () => { handed++; },
  });
  assert.equal(left, false);
  assert.deepEqual(asked, [2]);
  assert.equal(handed, 0);
});

test('leaving hands every entry over once all agree', async () => {
  const handed = [];
  const left = await leave(entries, {
    unsaved: async () => true,
    ask: async () => true,
    handOver: async (e) => { handed.push(e.n); },
  });
  assert.equal(left, true);
  assert.deepEqual(handed, [1, 2, 3]);
});

test('a hand-over that never finishes is waited for only withinMs', async () => {
  const start = Date.now();
  const left = await leave(entries, { unsaved: async () => false, ask: async () => true, handOver: () => new Promise(() => {}), withinMs: 50 });
  assert.equal(left, true);
  assert.ok(Date.now() - start < 1000);
});

test('an entry that does not say whether it is unsaved counts as unsaved', async () => {
  const asked = [];
  const left = await leave([{ n: 1 }], {
    unsaved: () => new Promise(() => {}),
    ask: async (e) => { asked.push(e.n); return true; },
    handOver: async () => {},
    answerWithinMs: 20,
  });
  assert.equal(left, true);
  assert.deepEqual(asked, [1]);
});
