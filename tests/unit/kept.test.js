// The editor's own choices as storage holds them (store/kept.js): what's good now comes back, anything else is the default.
import { test, expect } from 'vitest';
import { KEPT, keptKey, keptValue } from '@/store/kept.js';

const entry = (key) => KEPT.find((e) => e.key === key);
const read = (key, value) => keptValue(entry(key), value === undefined ? null : JSON.stringify(value));

test('good values come back as they were kept', () => {
  expect(read('editFgColor', '#12ab3c')).toBe('#12ab3c');
  expect(read('editBgNone', false)).toBe(false);
  expect(read('editFgIndex', 16)).toBe(16);
  expect(read('outputActiveTool', 'text')).toBe('text');
  expect(read('vectorActiveTool', 'pen')).toBe('pen');
  expect(read('editBrushSize', 7.5)).toBe(7.5);
  expect(read('shapeDrawWith', 'char')).toBe('char');
  expect(read('activeChar', '▒')).toBe('▒');
  expect(read('bucketMatch', { fg: false, bg: true, char: false })).toEqual({ fg: false, bg: true, char: false });
  expect(read('vectorStyle', { fill: null, stroke: '#ff0000', width: 3, cap: 'butt', join: 'bevel', miter: 2, align: 'inside' }))
    .toEqual({ fill: null, stroke: '#ff0000', width: 3, cap: 'butt', join: 'bevel', miter: 2, align: 'inside' });
  expect(read('slotFaces', { fill: 'gradient', retouch: 'burn' })).toEqual({ fill: 'gradient', retouch: 'burn' });
});

test('a plugin brush or shape is kept, though its plugin loads after', () => {
  expect(read('inputActiveTool', 'plugin:phosphor.smear/smear')).toBe('plugin:phosphor.smear/smear');
  expect(read('vectorShapeKind', 'plugin:phosphor.superformula/superformula')).toBe('plugin:phosphor.superformula/superformula');
  expect(read('vectorActiveTool', 'plugin:phosphor.smear/smear')).toBe('vselect'); // no brushes on VECTOR
});

test('nothing kept is the default', () => {
  expect(keptValue(entry('editFgColor'), null)).toBe('#ffffff');
  expect(keptValue(entry('inputActiveTool'), null)).toBe('brush');
  expect(keptValue(entry('editFgIndex'), null)).toBeUndefined();
  expect(keptValue(entry('wandMatch'), null)).toEqual({ fg: true, bg: false, char: true });
});

test('a value that is not good now is the default', () => {
  expect(read('editFgColor', 'red')).toBe('#ffffff');
  expect(read('editFgColor', 12)).toBe('#ffffff');
  expect(read('editFgNone', 'yes')).toBe(false);
  expect(read('editFgIndex', 300)).toBeUndefined();
  expect(read('inputActiveTool', 'lasso')).toBe('brush');     // a tool that's gone
  expect(read('inputActiveTool', 'text')).toBe('brush');      // one PIXEL doesn't offer
  expect(read('outputActiveTool', 'pen')).toBe('hand');
  expect(read('editBrushSize', 0)).toBe(2.5);                 // out of range
  expect(read('editBrushSize', 99)).toBe(2.5);
  expect(read('editBrushSize', '5')).toBe(2.5);
  expect(read('vectorSides', 4.5)).toBe(5);
  expect(read('typingMode', 'replace')).toBe('overwrite');
  expect(read('activeChar', 'ab')).toBe('█');
  expect(read('activeChar', '')).toBe('█');
  expect(read('wandMatch', [true, false])).toEqual({ fg: true, bg: false, char: true });
});

test('what storage holds that is not JSON is the default', () => {
  expect(keptValue(entry('editFgColor'), '#12ab3c')).toBe('#ffffff');
  expect(keptValue(entry('bucketSet'), '{"fg":')).toEqual({ fg: true, bg: false, char: false });
});

test('a kept object keeps its good fields and defaults the others', () => {
  expect(read('bucketSet', { fg: false, bg: 'x', more: true })).toEqual({ fg: false, bg: false, char: false });
  expect(read('vectorStyle', { fill: 'blue', stroke: '#00ff00', width: 500 }))
    .toEqual({ fill: 'fg', stroke: '#00ff00', width: 1, cap: 'round', join: 'round', miter: 4, align: 'center' });
});

test('a row of toggles that lights one keeps one lit', () => {
  expect(read('pixelPickSlot', { fg: false, bg: true })).toEqual({ fg: false, bg: true });
  expect(read('pixelPickSlot', { fg: true, bg: true })).toEqual({ fg: true, bg: false });
  expect(read('vectorPickSlot', { fill: false, stroke: false })).toEqual({ fill: true, stroke: false });
});

test('a toolbar slot keeps only a tool of its own group', () => {
  expect(read('slotFaces', { fill: 'wand', select: 'wand', gone: 'brush' })).toEqual({ select: 'wand' });
  expect(read('slotFaces', 'fill')).toEqual({});
});

test('each kept choice has its own storage key, beside the others the browser keeps', () => {
  const keys = KEPT.map(keptKey);
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys).toContain('phosphor.editFgColor');
  expect(keys).not.toContain('phosphor.pluginTools'); // kept already, under its own key
});
