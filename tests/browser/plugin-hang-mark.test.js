// The hang mark between pages: tabs and the desktop app's windows share it, so a mark is a hang only when the page that
// left it is gone (it no longer holds its Web Lock).
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HANG_KEY, beginRun, endRun, hungLastTime } from '@/plugins/hangMark';
import { ownHangMark } from '../support/ownHangMark.js';

beforeEach(() => ownHangMark('plugin-hang-mark'));
afterEach(() => {
  localStorage.removeItem(HANG_KEY);
  vi.restoreAllMocks();
});

test('a mark whose page still holds its lock is not a hang, and is left alone', async () => {
  const run = beginRun('phosphor.outlines'); // this page, at work
  const mark = localStorage.getItem(HANG_KEY);
  expect(await hungLastTime()).toBe(null);
  expect(localStorage.getItem(HANG_KEY)).toBe(mark);
  endRun(run);
  expect(localStorage.getItem(HANG_KEY)).toBe(null);
});

test('a mark whose page is gone is a hang, and is cleared', async () => {
  localStorage.setItem(HANG_KEY, JSON.stringify({ pluginId: 'phosphor.outlines', page: 'a-page-no-one-holds' }));
  expect(await hungLastTime()).toBe('phosphor.outlines');
  expect(localStorage.getItem(HANG_KEY)).toBe(null);
  localStorage.setItem(HANG_KEY, 'jane.older'); // an earlier Phosphor's mark
  expect(await hungLastTime()).toBe('jane.older');
});

test('a page ending its run leaves another page\'s mark', () => {
  const other = JSON.stringify({ pluginId: 'phosphor.outlines', page: 'another-page' });
  localStorage.setItem(HANG_KEY, other);
  endRun();
  expect(localStorage.getItem(HANG_KEY)).toBe(other);
});

// A script's import holds the mark across an await, and a filter's first render (or a brush's first stroke) can begin
// and end its own run in that gap: the import's mark must still be there after it.
const marked = () => JSON.parse(localStorage.getItem(HANG_KEY))?.pluginId ?? null;
test('a run begun and ended inside another leaves the other\'s mark', () => {
  const outer = beginRun('jane.script');
  const inner = beginRun('jane.filter');
  expect(marked()).toBe('jane.filter');
  endRun(inner);
  expect(marked()).toBe('jane.script');
  endRun(outer);
  expect(localStorage.getItem(HANG_KEY)).toBe(null);
});

test('a run that ends before one begun after it leaves the later one\'s mark', () => {
  const first = beginRun('jane.script');
  const second = beginRun('jane.other');
  endRun(first);
  expect(marked()).toBe('jane.other');
  endRun(second);
  expect(localStorage.getItem(HANG_KEY)).toBe(null);
});
