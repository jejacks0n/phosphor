// The ANSI view builds each row as HTML: a cell's character must arrive as text, never markup.
// Run: node scripts/check-text-renderer.mjs
import assert from 'node:assert/strict';
import { escapeChar } from '../src/lib/TextRenderer.js';

assert.equal(escapeChar('<'), '&lt;');
assert.equal(escapeChar('>'), '&gt;');
assert.equal(escapeChar('&'), '&amp;');
assert.equal(escapeChar('A'), 'A');
assert.equal(escapeChar('╬'), '╬');
console.log('text renderer ok');
