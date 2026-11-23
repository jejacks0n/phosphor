// The Text tool's keys -> editing actions, cursor clamping, and row shifting for insert mode.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { colorBoxKey, textKeyAction, moveCursor, typedText, MAC_TYPES_OPTION_U } from '../../src/lib/TextKeys.js';
import { shiftRow } from '../../src/document/editCells.js';

test("The Text tool's keys -> editing actions, cursor clamping, and row shifting for insert mode", async () => {
  const k = (key, mods = {}) => textKeyAction({ key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods }, { editable: false });
  assert.deepEqual(k('a'), { type: 'char', char: 'a' });
  assert.deepEqual(k('★'), { type: 'char', char: '★' });
  assert.deepEqual(k(' '), { type: 'char', char: ' ' });
  assert.equal(textKeyAction({ key: 'a' }, { editable: true }), null);      // focus in a field: not ours
  assert.equal(k('z', { metaKey: true }), null);                              // Cmd shortcuts still work
  assert.equal(k('z', { ctrlKey: true }), null);
  assert.deepEqual(k('F5', { ctrlKey: true, shiftKey: true }), { type: 'grab', index: 4 });
  // The report (bug bash 2): Ctrl+F-key alone is macOS's own (Ctrl+F1 keyboard access, Ctrl+F8 the status menus...), so
  // the grab takes Shift too, and Ctrl+F-key alone is left to the system.
  for (const key of ['F1', 'F5', 'F8', 'F12']) assert.equal(k(key, { ctrlKey: true }), null);
  assert.deepEqual(k('F12'), { type: 'slot', index: 11 });
  assert.deepEqual(k('F1'), { type: 'slot', index: 0 });
  assert.equal(k('F13'), null);
  // Moebius's lines and columns: Alt+↑ puts a line in at the cursor, Alt+↓ takes the cursor's out, Alt+→ and Alt+← the same
  // for a column.
  assert.deepEqual(k('ArrowUp', { altKey: true }), { type: 'line', delta: 1 });
  assert.deepEqual(k('ArrowDown', { altKey: true }), { type: 'line', delta: -1 });
  assert.deepEqual(k('ArrowRight', { altKey: true }), { type: 'column', delta: 1 });
  assert.deepEqual(k('ArrowLeft', { altKey: true }), { type: 'column', delta: -1 });
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
    assert.equal(k(key, { altKey: true, shiftKey: true }), null, key);          // Shift+Alt+arrows: nothing
    assert.equal(k(key, { ctrlKey: true }), null, key);                        // the color steps (the command table's)
    assert.equal(k(key, { ctrlKey: true, altKey: true }), null, key);          // ...as a Mac has them
  }
  assert.equal(k(',', { ctrlKey: true, code: 'Comma' }), null);                // the character set's steps
  assert.equal(k('.', { ctrlKey: true, code: 'Period' }), null);
  assert.equal(k('ArrowRight', { shiftKey: true }), null);                    // Shift+arrows select (useKeyboardShortcuts)
  assert.deepEqual(k('å', { altKey: true }), { type: 'char', char: 'å' });   // macOS Option characters
  assert.deepEqual(k('ArrowDown'), { type: 'move', dc: 0, dr: 1 });
  assert.deepEqual(k('ArrowLeft'), { type: 'move', dc: -1, dr: 0 });
  assert.deepEqual(k('Home'), { type: 'home' });
  assert.deepEqual(k('End'), { type: 'end' });
  assert.deepEqual(k('Enter'), { type: 'newline' });
  assert.deepEqual(k('Backspace'), { type: 'backspace' });
  assert.deepEqual(k('Delete'), { type: 'delete' });
  assert.deepEqual(k('Insert'), { type: 'toggleInsert' });
  assert.deepEqual(k('Enter', { altKey: true }), { type: 'toggleInsert' });   // for keyboards with no Insert key (a MacBook's): it types nothing on any layout
  assert.deepEqual(k('Enter', { altKey: true, code: 'NumpadEnter' }), { type: 'toggleInsert' });
  assert.deepEqual(k('Dead', { altKey: true, code: 'KeyI' }), null);          // Option+I still starts a circumflex: the tool leaves accents alone
  assert.equal(k('Shift'), null);
  assert.equal(k('Tab'), null);
  assert.equal(k('Escape'), null);
  assert.equal(k('́'), null);                                            // a lone combining mark: no cell holds it
  assert.equal(k('́', { altKey: true }), null);
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

test('Alt+? opens the shortcuts list even while typing, and never types; ? types', () => {
  const ev = (key, code, mods = {}) => ({ key, code, altKey: false, shiftKey: true, ctrlKey: false, metaKey: false, ...mods });
  assert.equal(textKeyAction(ev('¿', 'Slash', { altKey: true }), { editable: false }), null);
  assert.deepEqual(textKeyAction(ev('?', 'Slash'), { editable: false }), { type: 'char', char: '?' });
});

test('Alt+, and Alt+. type while typing, frames or not: a frame step needs Escape first', () => {
  const ev = (key, code) => ({ key, code, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false });
  assert.deepEqual(textKeyAction(ev('≥', 'Period'), { editable: false }), { type: 'char', char: '≥' }); // Option+. on a Mac
  assert.deepEqual(textKeyAction(ev('≤', 'Comma'), { editable: false }), { type: 'char', char: '≤' });
});

test('Alt+] and Alt+[ never type (the layer above and below, typing too); with Shift, AltGr, and Shift+Alt+N or V they type', () => {
  const ev = (key, code, mods = {}) => ({ key, code, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });
  assert.equal(textKeyAction(ev('‘', 'BracketRight'), { editable: false }), null); // Option+] on a Mac
  assert.equal(textKeyAction(ev('“', 'BracketLeft'), { editable: false }), null);
  assert.equal(textKeyAction(ev(']', 'BracketRight'), { editable: false }), null); // Alt+] elsewhere
  assert.deepEqual(textKeyAction(ev('’', 'BracketRight', { shiftKey: true }), { editable: false }), { type: 'char', char: '’' });
  assert.deepEqual(textKeyAction(ev('[', 'BracketLeft', { ctrlKey: true }), { editable: false }), { type: 'char', char: '[' }); // AltGr
  assert.deepEqual(textKeyAction(ev('˜', 'KeyN', { shiftKey: true }), { editable: false }), { type: 'char', char: '˜' });
  assert.deepEqual(textKeyAction(ev('◊', 'KeyV', { shiftKey: true }), { editable: false }), { type: 'char', char: '◊' });
});

test('Alt+X never types (the cursor cell flipped); Alt+U and Shift+Alt+U take the cell\'s colors off a Mac, and type on one for now', () => {
  const ev = (key, code, mods = {}) => ({ key, code, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });
  for (const mac of [true, false]) {
    const k = (e) => textKeyAction(e, { editable: false, mac });
    assert.equal(k(ev(mac ? '≈' : 'x', 'KeyX')), null, `Alt+X, mac ${mac}`);
    assert.deepEqual(k(ev('˛', 'KeyX', { shiftKey: true })), { type: 'char', char: '˛' }); // Shift+Alt+X types
    assert.deepEqual(k(ev('ú', 'KeyU', { ctrlKey: true })), { type: 'char', char: 'ú' }); // AltGr types
    assert.deepEqual(k(ev('≈', 'KeyX', { ctrlKey: true })), { type: 'char', char: '≈' });
  }
  const off = (e) => textKeyAction(e, { editable: false, mac: false });
  assert.equal(off(ev('u', 'KeyU')), null);
  assert.equal(off(ev('U', 'KeyU', { shiftKey: true })), null);
  // A Mac's Option+U is the umlaut's dead key, and Shift+Option+U types ¨: left to typing (MAC_TYPES_OPTION_U).
  const mac = (e) => textKeyAction(e, { editable: false, mac: true });
  assert.equal(mac(ev('Dead', 'KeyU')), null); // the textarea starts ü itself
  assert.deepEqual(mac(ev('¨', 'KeyU', { shiftKey: true })), MAC_TYPES_OPTION_U ? { type: 'char', char: '¨' } : null);
});

test('Alt+1–4 type while typing on a Mac and Windows (Option\'s digits: a British Mac\'s Option+3 is #), and on Linux, whose browser switches its tabs on them, type nothing', () => {
  const ev = (key, code, mods = {}) => ({ key, code, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });
  const mac = (e) => textKeyAction(e, { editable: false, mac: true, linux: false });
  const windows = (e) => textKeyAction(e, { editable: false, mac: false, linux: false });
  const linux = (e) => textKeyAction(e, { editable: false, mac: false, linux: true });
  assert.deepEqual(mac(ev('™', 'Digit2')), { type: 'char', char: '™' });
  assert.deepEqual(mac(ev('#', 'Digit3')), { type: 'char', char: '#' }); // a British Mac
  assert.deepEqual(windows(ev('1', 'Digit1')), { type: 'char', char: '1' }); // as it typed before
  for (const n of [1, 2, 3, 4]) assert.equal(linux(ev(String(n), `Digit${n}`)), null, `Alt+${n} on Linux`);
  assert.deepEqual(linux(ev('5', 'Digit5')), { type: 'char', char: '5' }); // not a tab's
  assert.deepEqual(linux(ev('!', 'Digit1', { shiftKey: true })), { type: 'char', char: '!' }); // Shift+Alt+1
  assert.deepEqual(linux(ev('¹', 'Digit1', { ctrlKey: true })), { type: 'char', char: '¹' }); // AltGr types
});
