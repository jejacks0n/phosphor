// Editing around wide characters, like a terminal: writing over either half of one turns the
// other half into a space; the cursor never rests on a trail; erasing a trail erases its lead.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { layoutWide } from '../../src/lib/Cells.js';
import { overwrites, overwritesAll, snapCursor, withLeads } from '../../src/document/wideChars.js';

test('Editing around wide characters, like a terminal: writing over either half of one turns the other half into a space; the cursor never rests on a trail; erasing a trail erases its lead', async () => {
  const lay = (chars) => layoutWide(chars.map(c => ({ char: c, fg: {}, bg: {} })), chars.length);
  const r = lay(['a', '漢', '_', '字', '_', 'b']);                     // 漢 at 1-2, 字 at 3-4
  assert.deepEqual(overwrites(r, 6, 2, 0, 1), [1]);                    // typing on 漢's trail blanks its lead
  assert.deepEqual(overwrites(r, 6, 1, 0, 1), [2]);                    // typing on 漢's lead blanks its trail
  assert.deepEqual(overwrites(r, 6, 0, 0, 2), [1, 2]);                 // a wide char at 0 covers 1 (漢's lead) and breaks 漢: its trail blanks
  assert.deepEqual(overwrites(r, 6, 2, 0, 2).sort(), [1, 3, 4]);       // trail of 漢 -> its lead; covers 3 (字's lead) -> 字's trail
  assert.deepEqual(overwrites(r, 6, 5, 0, 1), []);
  assert.deepEqual(snapCursor(r, 6, { col: 2, row: 0 }, 1), { col: 3, row: 0 });   // moving right skips the trail
  assert.deepEqual(snapCursor(r, 6, { col: 2, row: 0 }, -1), { col: 1, row: 0 });  // anything else lands on the lead
  assert.deepEqual(snapCursor(r, 6, { col: 0, row: 0 }, 1), { col: 0, row: 0 });   // not a trail: unchanged
  assert.deepEqual(withLeads(r, 6, [{ col: 4, row: 0 }, { col: 5, row: 0 }]).map(c => c.col).sort(), [3, 4, 5]);
  // Many cells written at once (a shape): each breaks the wide characters it lands on, and the
  // blanks skip cells the batch writes itself.
  const line = [0, 1, 2, 3].map(col => ({ col, row: 0, char: '─' }));        // a line over a, 漢 and 字's lead
  assert.deepEqual(overwritesAll(r, 6, line).map(c => c.col), [4]);          // 漢 is written over whole; 字's trail blanks
  assert.deepEqual(overwritesAll(r, 6, [{ col: 2, row: 0, char: '│' }]).map(c => c.col), [1]); // one cell on 漢's trail
  assert.deepEqual(overwritesAll(r, 6, [{ col: 2, row: 0 }]), []);             // colors only: nothing breaks
});
