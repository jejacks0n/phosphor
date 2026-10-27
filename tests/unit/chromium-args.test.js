// Chromium keeps only the last --disable-features on its command line, so a feature we turn off has to
// be merged into the list Playwright already passes, never added beside it.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mergeDisabledFeatures } from '../support/chromiumArgs.js';

test('our disabled features join Playwright\'s one list, and its own is the one left out', () => {
  const defaults = ['--no-first-run', '--disable-features=A,B', '--enable-features=C'];
  assert.deepEqual(mergeDisabledFeatures(defaults, ['X']), {
    args: ['--disable-features=A,B,X'],
    ignoreDefaultArgs: ['--disable-features=A,B'],
  });
});

test('with no list from Playwright, ours stands alone', () => {
  assert.deepEqual(mergeDisabledFeatures(['--no-first-run'], ['X']), { args: ['--disable-features=X'], ignoreDefaultArgs: [] });
});
