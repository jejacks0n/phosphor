// The command list's recent commands (src/lib/recentCommands.js), kept in localStorage as browser storage must be: a
// bad value or storage that throws reads as none.
import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { recentCommands } from '../../src/lib/recentCommands.js';

const KEY = 'phosphor.recentCommands';
let stored;
beforeEach(() => {
  stored = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, String(value)),
  });
});
afterEach(() => vi.unstubAllGlobals());

test('newest first, no repeats, at most eight', () => {
  expect(recentCommands.read()).toEqual([]);
  for (const id of ['file.save', 'file.export', 'ui.help']) recentCommands.add(id);
  expect(recentCommands.read()).toEqual(['ui.help', 'file.export', 'file.save']);
  recentCommands.add('file.save');
  expect(recentCommands.read()).toEqual(['file.save', 'ui.help', 'file.export']);
  for (let i = 0; i < 10; i++) recentCommands.add(`c${i}`);
  expect(recentCommands.read()).toEqual(['c9', 'c8', 'c7', 'c6', 'c5', 'c4', 'c3', 'c2']);
});

test('a bad value reads as none', () => {
  stored.set(KEY, '{');
  expect(recentCommands.read()).toEqual([]);
  stored.set(KEY, '{"a":1}');
  expect(recentCommands.read()).toEqual([]);
  stored.set(KEY, '["file.save",3]');
  expect(recentCommands.read()).toEqual(['file.save']);
});

test('storage that throws reads as none, and adding doesn\'t throw', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  });
  expect(recentCommands.read()).toEqual([]);
  expect(() => recentCommands.add('file.save')).not.toThrow();
});
