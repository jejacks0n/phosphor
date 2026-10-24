// What counts as a field for the app's keys: anywhere text is typed or chosen, which keeps its own
// keys; Edit Mode's hidden textarea (typing into cells) isn't one.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { isField, isTextInput } from '../../src/lib/fields.js';

test('What counts as a field for the app\'s keys', () => {
  const el = (tagName, extra = {}) => ({ tagName, dataset: {}, isContentEditable: false, ...extra });
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(isField(el(tag)), true, tag);
  assert.equal(isField(el('DIV', { isContentEditable: true })), true);
  assert.equal(isField(el('BUTTON')), false);
  assert.equal(isField(el('DIV')), false);
  const typing = el('TEXTAREA', { dataset: { textInput: '' } });
  assert.equal(isTextInput(typing), true);
  assert.equal(isField(typing), false); // Edit Mode's textarea: the app's keys still apply
  assert.equal(isField(null), false);
});
