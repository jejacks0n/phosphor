// Up and Down between a list of stacked buttons (a dialog's choices, the start screen's): the next or the one before,
// past a disabled one, stopping at the ends. Only from one of the buttons, and then the key goes no further.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { arrowsBetween } from '../../src/lib/focus.js';

test('Up and Down move between a list of buttons, from one of them', () => {
  let focused = null;
  const button = (disabled = false) => ({ disabled, focus() { focused = this; } });
  const [first, second, off, last] = [button(), button(), button(true), button()];
  const press = (key, target, extra) => {
    focused = null;
    const event = { key, target, taken: 0, preventDefault() { this.taken++; }, stopPropagation() { this.taken++; }, ...extra };
    arrowsBetween(event, [first, second, off, last]);
    return { focused, taken: event.taken === 2 }; // not the page's to scroll, nor the app's shortcuts'
  };
  assert.deepEqual(press('ArrowDown', first), { focused: second, taken: true });
  assert.deepEqual(press('ArrowDown', second), { focused: last, taken: true }); // past the disabled one
  assert.deepEqual(press('ArrowUp', last), { focused: second, taken: true });
  assert.deepEqual(press('ArrowDown', last), { focused: null, taken: true });   // the ends: it stays, and doesn't wrap
  assert.deepEqual(press('ArrowUp', first), { focused: null, taken: true });
  assert.deepEqual(press('ArrowDown', { tagName: 'INPUT' }), { focused: null, taken: false }); // a field's arrows are the field's
  assert.deepEqual(press('ArrowRight', first), { focused: null, taken: false });
  assert.deepEqual(press('Enter', first), { focused: null, taken: false });
  assert.deepEqual(press('ArrowDown', first, { metaKey: true }), { focused: null, taken: false }); // Cmd+Down scrolls
});
