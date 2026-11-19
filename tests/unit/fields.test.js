// Which keys a focused element keeps for itself, so the app's keys leave them alone: a field you type in keeps every
// key, a slider its arrows and ends, a checkbox or a button Space and Enter (a radio its arrows too), anything else
// none. Edit Mode's hidden textarea (typing into cells) keeps none.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { ownsKey, typesIn, isFormField, isTextInput } from '../../src/lib/fields.js';

const el = (tagName, { type, role, href, ...extra } = {}) => ({
  tagName, type, dataset: {}, isContentEditable: false, ...extra,
  getAttribute: (name) => ({ role }[name] ?? null),
  hasAttribute: (name) => name === 'href' && href !== undefined,
});
const KEYS = ['a', ' ', 'Enter', 'Escape', 'Delete', 'Backspace', 'ArrowLeft', 'ArrowUp', 'Home', 'End', 'PageDown'];
const owned = (target) => KEYS.filter((key) => ownsKey(target, { key }));

test('a field you type in, or a menu, keeps every key', () => {
  for (const type of ['text', 'number', 'search', 'email', 'password', undefined]) assert.deepEqual(owned(el('INPUT', { type })), KEYS, type);
  assert.deepEqual(owned(el('TEXTAREA')), KEYS);
  assert.deepEqual(owned(el('SELECT')), KEYS);
  assert.deepEqual(owned(el('DIV', { isContentEditable: true })), KEYS);
});

test('a slider keeps its arrows, Home, End, Page Up and Page Down', () => {
  const slide = ['ArrowLeft', 'ArrowUp', 'Home', 'End', 'PageDown'];
  assert.deepEqual(owned(el('INPUT', { type: 'range' })), slide);
  assert.deepEqual(owned(el('DIV', { role: 'slider' })), slide);
  assert.deepEqual(owned(el('DIV', { role: 'separator' })), slide); // the side panel's edge, focused
});

test('a checkbox or a button keeps Space and Enter; a radio its arrows too; a tab Left and Right', () => {
  for (const target of [el('INPUT', { type: 'checkbox' }), el('INPUT', { type: 'checkbox', role: 'switch' }), el('BUTTON'),
    el('INPUT', { type: 'color' }), el('SUMMARY'), el('A', { href: '#' }), el('DIV', { role: 'button' }), el('LI', { role: 'menuitem' })]) {
    assert.deepEqual(owned(target), [' ', 'Enter'], `${target.tagName} ${target.type ?? ''}`);
  }
  assert.deepEqual(owned(el('INPUT', { type: 'radio' })), [' ', 'Enter', 'ArrowLeft', 'ArrowUp']);
  assert.deepEqual(owned(el('BUTTON', { role: 'tab' })), [' ', 'Enter', 'ArrowLeft']); // not Home and End: they scroll the art
});

test('anything else, Edit Mode\'s textarea, or nothing focused keeps no keys', () => {
  assert.deepEqual(owned(el('DIV')), []);
  assert.deepEqual(owned(el('A')), []); // no href: not a link
  assert.deepEqual(owned(el('ARTICLE', { tabIndex: 0 })), []); // the art's view
  const typing = el('TEXTAREA', { dataset: { textInput: '' } });
  assert.equal(isTextInput(typing), true);
  assert.deepEqual(owned(typing), []);
  assert.deepEqual(owned(null), []);
});

test('typesIn: the fields you type in (not a menu, a checkbox or a slider); isFormField: any form field', () => {
  assert.equal(typesIn(el('INPUT', { type: 'number' })), true);
  assert.equal(typesIn(el('DIV', { isContentEditable: true })), true);
  for (const target of [el('SELECT'), el('INPUT', { type: 'checkbox' }), el('INPUT', { type: 'range' }), el('INPUT', { type: 'color' }), el('BUTTON')]) assert.equal(typesIn(target), false);
  assert.equal(typesIn(el('TEXTAREA', { dataset: { textInput: '' } })), false);
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(isFormField(el(tag)), true, tag);
  assert.equal(isFormField(el('BUTTON')), false);
  assert.equal(isFormField(el('TEXTAREA', { dataset: { textInput: '' } })), false);
});
