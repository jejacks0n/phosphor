import { test, expect } from 'vitest';
import { themeRef, isPluginTheme, pluginOfTheme, pluginsOff, readThemeCache, resolveTheme } from '../../src/plugins/themes.js';

const MIDNIGHT = 'plugin:phosphor.midnight/midnight';
const themes = [{ ref: MIDNIGHT, base: 'dark', colors: { 'surface-0': '#10162b' } }];
const cached = { theme: 'plugin:sam.dusk/dusk', base: 'light', colors: { text: '#123456' } };

const ROWS = [
  ['dark', {}, { base: 'dark', colors: {}, known: true }],
  ['light', {}, { base: 'light', colors: {}, known: true }],
  ['system', { prefersLight: true }, { base: 'light', colors: {}, known: true }],
  ['system', { prefersLight: false }, { base: 'dark', colors: {}, known: true }],
  [MIDNIGHT, {}, { base: 'dark', colors: { 'surface-0': '#10162b' }, known: true }],
  ['plugin:sam.dusk/dusk', { cached }, { base: 'light', colors: { text: '#123456' }, known: false }],
  ['plugin:sam.other/other', { cached }, { base: 'dark', colors: {}, known: false }],
  ['sepia', {}, { base: 'dark', colors: {}, known: false }],
];

test.each(ROWS.flatMap(([value, options, result]) => [[value, false, options, result], [value, true, options, result]]))(
  '%s with plugins off %s resolves',
  (value, off, options, result) => {
    expect(resolveTheme(value, { themes, prefersLight: false, ...options, off }))
      .toEqual(off ? { ...result, colors: {} } : result);
  },
);

test('the flag is plugins=off in the query, whatever else is there', () => {
  expect(pluginsOff('?plugins=off')).toBe(true);
  expect(pluginsOff('?a=1&plugins=off')).toBe(true);
  expect(pluginsOff('?plugins=on')).toBe(false);
  expect(pluginsOff('')).toBe(false);
});

test.each([null, '', '{nope', '[]', '{"theme":"plugin:a.b/c","base":"sepia","colors":{}}',
  '{"theme":"plugin:a.b/c","base":"dark","colors":{"logo":"#fff"}}',
  '{"theme":"plugin:a.b/c","base":"dark","colors":{"accent":"url(x)"}}',
])('a damaged kept copy reads as none: %s', (text) => {
  expect(readThemeCache(text)).toBe(null);
});

test('a good kept copy reads as itself', () => {
  expect(readThemeCache(JSON.stringify(cached))).toEqual(cached);
});

test('a name round-trips', () => {
  expect(themeRef('phosphor.midnight', 'midnight')).toBe(MIDNIGHT);
  expect(isPluginTheme(MIDNIGHT)).toBe(true);
  expect(isPluginTheme('dark')).toBe(false);
  expect(pluginOfTheme(MIDNIGHT)).toBe('phosphor.midnight');
  expect(pluginOfTheme('dark')).toBe(null);
});
