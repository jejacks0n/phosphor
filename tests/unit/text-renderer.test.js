// The ANSI view builds each row as HTML: a cell's character must arrive as text, never markup.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { escapeChar } from '../../src/lib/TextRenderer.js';

test("The ANSI view builds each row as HTML: a cell's character must arrive as text, never markup", async () => {
  assert.equal(escapeChar('<'), '&lt;');
  assert.equal(escapeChar('>'), '&gt;');
  assert.equal(escapeChar('&'), '&amp;');
  assert.equal(escapeChar('A'), 'A');
  assert.equal(escapeChar('╬'), '╬');
  // More than one character (from anywhere that doesn't hold a cell to one) is escaped throughout.
  assert.equal(escapeChar('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeChar('a&<b>'), 'a&amp;&lt;b&gt;');
});
