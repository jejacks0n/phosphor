// The Text tool's keys -> editing actions, cursor clamping, and row shifting for insert mode.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { colorBoxKey, textKeyAction, moveCursor, typedText } from '../../src/lib/TextKeys.js';
import { shiftRow } from '../../src/document/editCells.js';

test("The Text tool's keys -> editing actions, cursor clamping, and row shifting for insert mode", async () => {
  const k = (key, mods = {}) => textKeyAction({ key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods }, { editable: false });
  assert.deepEqual(k('a'), { type: 'char', char: 'a' });
  assert.deepEqual(k('★'), { type: 'char', char: '★' });
  assert.deepEqual(k(' '), { type: 'char', char: ' ' });
  assert.equal(textKeyAction({ key: 'a' }, { editable: true }), null);      // focus in a field: not ours
  assert.equal(k('z', { metaKey: true }), null);                              // Cmd shortcuts still work
  assert.equal(k('z', { ctrlKey: true }), null);
  assert.deepEqual(k('F5', { ctrlKey: true }), { type: 'grab', index: 4 });
  assert.deepEqual(k('F12'), { type: 'slot', index: 11 });
  assert.deepEqual(k('F1'), { type: 'slot', index: 0 });
  assert.equal(k('F13'), null);
  assert.deepEqual(k('ArrowLeft', { altKey: true }), { type: 'palette', delta: -1 });
  assert.deepEqual(k('ArrowRight', { altKey: true }), { type: 'palette', delta: 1 });
  assert.deepEqual(k('ArrowUp', { altKey: true, shiftKey: true }), { type: 'color', slot: 'bg', delta: -1 });
  assert.deepEqual(k('ArrowDown', { altKey: true }), { type: 'color', slot: 'fg', delta: 1 });
  assert.deepEqual(k('å', { altKey: true }), { type: 'char', char: 'å' });   // macOS Option characters
  assert.deepEqual(k('ArrowDown'), { type: 'move', dc: 0, dr: 1 });
  assert.deepEqual(k('ArrowLeft'), { type: 'move', dc: -1, dr: 0 });
  assert.deepEqual(k('Home'), { type: 'home' });
  assert.deepEqual(k('End'), { type: 'end' });
  assert.deepEqual(k('Enter'), { type: 'newline' });
  assert.deepEqual(k('Backspace'), { type: 'backspace' });
  assert.deepEqual(k('Delete'), { type: 'delete' });
  assert.deepEqual(k('Insert'), { type: 'toggleInsert' });
  assert.equal(k('Shift'), null);
  assert.equal(k('Tab'), null);
  assert.equal(k('Escape'), null);
  assert.deepEqual(moveCursor({ col: 79, row: 0 }, 1, 0, 80, 25), { col: 79, row: 0 });
  assert.deepEqual(moveCursor({ col: 0, row: 0 }, -1, -1, 80, 25), { col: 0, row: 0 });
  assert.deepEqual(moveCursor({ col: 5, row: 24 }, 0, 1, 80, 25), { col: 5, row: 24 });
  const row = new Map([['78,0', { char: 'a' }], ['79,0', { char: 'b' }], ['5,1', { char: 'c' }]]);
  assert.deepEqual([...shiftRow(row, 0, 78, 1, 80).keys()].sort(), ['5,1', '79,0']);   // 'b' falls off; row 1 untouched
  assert.deepEqual(shiftRow(row, 0, 78, 1, 80).get('79,0'), { char: 'a' });
  assert.deepEqual(shiftRow(row, 0, 79, -1, 80).get('78,0'), { char: 'b' });          // 'a' removed, 'b' pulled left
  // Pulling a row left by two (a wide character's width) removes both cells it covers.
  // (Nothing to the right moving in: both still go.)
  const span = new Map([['1,0', { char: 'x' }], ['2,0', { char: 'y' }], ['5,0', { char: 'z' }]]);
  assert.deepEqual([...shiftRow(span, 0, 3, -2, 80)], [['3,0', { char: 'z' }]]);
  assert.equal(shiftRow(row, 0, 79, -1, 80).has('79,0'), false);
  assert.equal(shiftRow(row, 3, 0, 1, 80), row);                                        // nothing on that row: same map
  assert.deepEqual(k('@', { ctrlKey: true, altKey: true }), { type: 'char', char: '@' }); // AltGr (Windows/Linux) types
  assert.deepEqual(k('F2', { ctrlKey: true, altKey: true }), null);                        // ...but isn't a grab
  assert.equal(textKeyAction({ key: 'a', isComposing: true }, { editable: false }), null);  // IME composition
  assert.equal(textKeyAction({ key: 'a', keyCode: 229 }, { editable: false }), null);
  const hidden = new Map([['85,0', { char: 'x' }], ['2,0', { char: 'y' }]]);              // col 85 is off an 80-col grid
  assert.deepEqual(shiftRow(hidden, 0, 0, 1, 80).get('85,0'), { char: 'x' });             // off-grid entries stay put
  assert.deepEqual(shiftRow(hidden, 0, 1, -1, 80).get('85,0'), { char: 'x' });
  assert.equal(shiftRow(hidden, 0, 0, -1, 80), hidden);                                    // nothing left of col 0
  // Text from an input method, the emoji picker or a paste: whole characters in order, a line break
  // of any kind as one newline, anything a cell can't hold dropped.
  assert.deepEqual(typedText('a漢\r\nb\t\u0301👍🏽'), [
    { type: 'char', char: 'a' }, { type: 'char', char: '漢' }, { type: 'newline' }, { type: 'char', char: 'b' }, { type: 'char', char: '👍🏽' },
  ]);
  assert.deepEqual(typedText('\n\r'), [{ type: 'newline' }, { type: 'newline' }]);
  assert.deepEqual(typedText(''), []);
});

test('Alt+F / Alt+A open the color box on the foreground, Alt+B on the background; they never type', () => {
  const key = (code, mods = {}) => ({ code, key: { KeyF: 'ƒ', KeyA: 'å', KeyB: '∫' }[code] ?? code, altKey: true, ...mods });
  assert.equal(colorBoxKey(key('KeyF')), 'fg');
  assert.equal(colorBoxKey(key('KeyA')), 'fg');
  assert.equal(colorBoxKey(key('KeyB')), 'bg');
  assert.equal(colorBoxKey(key('KeyF', { altKey: false })), null);
  assert.equal(colorBoxKey(key('KeyF', { ctrlKey: true })), null);   // AltGr (Ctrl+Alt) still types
  assert.equal(colorBoxKey(key('KeyF', { shiftKey: true })), null);
  assert.equal(colorBoxKey(key('KeyC')), null);
  assert.equal(textKeyAction(key('KeyF'), { editable: false }), null);
  assert.deepEqual(textKeyAction(key('KeyC', { key: 'ç' }), { editable: false }), { type: 'char', char: 'ç' }); // other Alt keys type
});
