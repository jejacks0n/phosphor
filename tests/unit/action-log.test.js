// The development log of store actions (src/dev/actionLog.js): a Pinia plugin that records each top-level action as a
// line, folds repeats, summarizes arguments, keeps window errors as lines too, and keeps the newest LIMIT.
import { beforeEach, expect, test } from 'vitest';
import { createApp } from 'vue';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { LIMIT, clearLog, installActionLog, log, logText, record, recordError } from '@/dev/actionLog.js';

const useToy = defineStore('toy', {
  state: () => ({ n: 0 }),
  actions: {
    paint() { this.n++; },
    stroke() { this.paint([1]); this.paint([2]); },
    boom() { throw new Error('no'); },
    read() { return this.n; },
    peek() { this.paint([1]); }, // skipped, and calls one that isn't
  },
});

let store;
beforeEach(() => {
  const pinia = createPinia();
  installActionLog(pinia, new Set(['read', 'peek']));
  createApp({}).use(pinia); // plugins wait for an app, as in main.js
  setActivePinia(pinia);
  store = useToy();
  clearLog();
});

test('a top-level action is one entry; the ones it calls are not', () => {
  store.stroke();
  expect(log.entries.map((e) => e.text)).toEqual(['toy.stroke']);
});

test('a skipped action is not recorded', () => {
  store.read();
  expect(log.entries).toEqual([]);
});

test("a skipped action's own calls are not recorded either", () => {
  store.peek();
  expect(log.entries).toEqual([]);
});

test('a repeat with different scalar arguments folds too, showing the first and the latest (a zoom\'s notches; this tool, then that)', () => {
  store.paint(1);
  store.paint(1.5);
  store.paint(2);
  store.paint(2);
  expect(log.entries.map((e) => [e.args, e.count])).toEqual([['(1 → 2)', 4]]);
  store.stroke();
  store.paint('brush');
  store.paint('pencil', true);
  expect(log.entries.at(-1)).toMatchObject({ args: '("brush" → "pencil", true)', count: 2 });
});

test('the same action again folds into one line with a count, its arguments the latest', () => {
  store.paint([1]);
  store.paint([1, 2]);
  expect(log.entries).toHaveLength(1);
  expect(log.entries[0]).toMatchObject({ kind: 'action', text: 'toy.paint', count: 2, args: '([2])' });
});

test('a different action starts a new line; the same one in a later microtask still folds', async () => {
  store.paint([1]);
  store.stroke();
  await Promise.resolve();
  store.stroke();
  expect(log.entries.map((e) => [e.text, e.count])).toEqual([['toy.paint', 1], ['toy.stroke', 2]]);
});

test('an action that throws is still recorded, and recording goes on', async () => {
  expect(() => store.boom()).toThrow('no');
  await Promise.resolve();
  store.paint([1]);
  expect(log.entries.map((e) => e.text)).toEqual(['toy.boom', 'toy.paint']);
});

test('arguments are summarized, never copied', () => {
  store.paint(new Uint8Array(100000), 'a'.repeat(100), { x: 1, y: 2 }, null, 3, true, () => {}, new Map());
  expect(log.entries[0].args).toBe(`(Uint8Array(100000), "${'a'.repeat(40)}…, {x, y}, null, 3, true, fn, Map)`);
});

test('a plain object shows at most 8 keys', () => {
  store.paint(Object.fromEntries('abcdefghij'.split('').map((k) => [k, 1])), undefined, []);
  expect(log.entries[0].args).toBe('({a, b, c, d, e, f, g, h…}, undefined, [0])');
});

test('the log keeps the newest LIMIT entries', () => {
  for (let i = 0; i <= LIMIT; i++) record('toy', `a${i}`, '');
  expect(log.entries).toHaveLength(LIMIT);
  expect(log.entries[0].text).toBe('toy.a1');
  expect(log.entries.at(-1).text).toBe(`toy.a${LIMIT}`);
});

test('errors are lines too, and logText heads the log', () => {
  recordError('TypeError: cells is undefined');
  store.paint([1]);
  store.paint([1]);
  const lines = logText({ version: '1.2.3', sha: 'abc', userAgent: 'UA', viewport: '1200×800' }).split('\n');
  expect(lines.slice(0, 4)).toEqual(['Phosphor 1.2.3 (abc)', 'UA', '1200×800', '']);
  expect(lines[4]).toMatch(/^\+\d+\.\ds {2}error {2}TypeError: cells is undefined$/);
  expect(lines[5]).toMatch(/^\+\d+\.\ds {2}toy\.paint ×2 \(\[1\]\)$/);
  expect(lines).toHaveLength(6);
});
