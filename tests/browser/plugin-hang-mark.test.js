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
  beginRun('jane.outlines'); // this page, at work
  const mark = localStorage.getItem(HANG_KEY);
  expect(await hungLastTime()).toBe(null);
  expect(localStorage.getItem(HANG_KEY)).toBe(mark);
  endRun();
  expect(localStorage.getItem(HANG_KEY)).toBe(null);
});

test('a mark whose page is gone is a hang, and is cleared', async () => {
  localStorage.setItem(HANG_KEY, JSON.stringify({ pluginId: 'jane.outlines', page: 'a-page-no-one-holds' }));
  expect(await hungLastTime()).toBe('jane.outlines');
  expect(localStorage.getItem(HANG_KEY)).toBe(null);
  localStorage.setItem(HANG_KEY, 'jane.older'); // an earlier Phosphor's mark
  expect(await hungLastTime()).toBe('jane.older');
});

test('a page ending its run leaves another page\'s mark', () => {
  const other = JSON.stringify({ pluginId: 'jane.outlines', page: 'another-page' });
  localStorage.setItem(HANG_KEY, other);
  endRun();
  expect(localStorage.getItem(HANG_KEY)).toBe(other);
});
