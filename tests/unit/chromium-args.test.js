// Chromium keeps only the last --disable-features on its command line, so a feature we turn off has to
// be merged into the list Playwright already passes, never added beside it.
import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { launchWithout, mergeDisabledFeatures } from '../support/chromiumArgs.js';

// A browser that reports Playwright's command line, counted.
vi.mock('@playwright/test', () => ({
  chromium: {
    launch: vi.fn(async () => ({
      newBrowserCDPSession: async () => ({ send: async () => ({ arguments: ['--no-first-run', '--disable-features=A'] }) }),
      close: async () => {},
    })),
  },
}));

test('our disabled features join Playwright\'s one list, and its own is the one left out', () => {
  const defaults = ['--no-first-run', '--disable-features=A,B', '--enable-features=C'];
  assert.deepEqual(mergeDisabledFeatures(defaults, ['X']), {
    args: ['--disable-features=A,B,X'],
    ignoreDefaultArgs: ['--disable-features=A,B'],
  });
});

test('with no list from Playwright to merge into, it says so rather than pass ours beside one it missed', () => {
  assert.throws(() => mergeDisabledFeatures(['--no-first-run'], ['X']), /--disable-features/);
});

test('launchWithout asks a browser once; after that (in Playwright\'s workers too) the answer comes from the environment', async () => {
  const was = process.env.PHOSPHOR_CHROMIUM_LAUNCH;
  delete process.env.PHOSPHOR_CHROMIUM_LAUNCH;
  try {
    const first = await launchWithout(['X'], ['--a']);
    assert.deepEqual(first, { args: ['--a', '--disable-features=A,X'], ignoreDefaultArgs: ['--disable-features=A'] });
    assert.deepEqual(await launchWithout(['X'], ['--a']), first);
    assert.equal(chromium.launch.mock.calls.length, 1);
    assert.deepEqual(JSON.parse(process.env.PHOSPHOR_CHROMIUM_LAUNCH), first);   // what a worker inherits
  } finally {
    if (was === undefined) delete process.env.PHOSPHOR_CHROMIUM_LAUNCH;
    else process.env.PHOSPHOR_CHROMIUM_LAUNCH = was;
  }
});
