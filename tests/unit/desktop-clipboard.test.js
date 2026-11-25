// What the desktop app reads from the system clipboard for File > New from Clipboard (desktop/clipboard.js): its HTML,
// its text and its picture as a PNG, each only when there is one. The app reads it at the click; the page has no leave to.
// Electron's clipboard.read() gives items as the web's does: types, and getType(type) resolving to a Blob.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { clipboardParts } from '../../desktop/clipboard.js';

const clipboard = (...items) => ({
  read: async () => items.map((parts) => ({
    types: Object.keys(parts),
    getType: async (type) => (type in parts ? new Blob([parts[type]], { type }) : Promise.reject(new Error(`no ${type}`))),
  })),
});

test('a copy with HTML and text comes as both, and no picture', async () => {
  assert.deepEqual(await clipboardParts(clipboard({ 'text/html': '<meta charset="utf-8">{"phosphor":1}', 'text/plain': 'ab' })), { html: '<meta charset="utf-8">{"phosphor":1}', text: 'ab', png: null });
});

test('a picture comes as its PNG bytes, from whichever item has one', async () => {
  const png = Uint8Array.from([137, 80, 78, 71]);
  assert.deepEqual(await clipboardParts(clipboard({ 'text/plain': 'a name' }, { 'image/png': png })), { html: null, text: 'a name', png });
});

test('an empty clipboard, or one with only what Phosphor doesn\'t open, is three nulls', async () => {
  assert.deepEqual(await clipboardParts(clipboard()), { html: null, text: null, png: null });
  assert.deepEqual(await clipboardParts(clipboard({ 'text/rtf': '{\\rtf1}', 'text/plain': '' })), { html: null, text: null, png: null });
});
