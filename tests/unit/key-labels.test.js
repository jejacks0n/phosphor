// Shortcut labels: Mac symbols run together, other platforms' names joined with +.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { isMac, shortcut } from '../../src/lib/keyLabels.js';

test('Shortcut labels as the platform writes them', () => {
  assert.equal(shortcut('alt', 'F'), isMac ? '⌥F' : 'Alt+F');
  assert.equal(shortcut('shift', 'mod', 'X'), isMac ? '⇧⌘X' : 'Shift+Ctrl+X');
  assert.equal(shortcut('Space'), 'Space');
});
