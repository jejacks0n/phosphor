import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';
import { readManifest, ManifestError, COLOR_SLOTS, MOST_MANIFEST_BYTES } from '../../src/plugins/manifest.js';

const text = readFileSync(new URL('../fixtures/plugins/midnight/phosphor-plugin.json', import.meta.url), 'utf8');
const good = () => JSON.parse(text);
const refused = (change) => {
  const raw = good();
  change(raw);
  try { readManifest(JSON.stringify(raw)); } catch (error) { return error; }
  return null;
};

test('the example reads as itself, frozen, with nothing extra kept', () => {
  const raw = { ...good(), extra: 1, themes: [{ ...good().themes[0], extra: 1 }] };
  const m = readManifest(JSON.stringify(raw));
  expect(m).toEqual(good());
  expect(Object.isFrozen(m.themes[0].colors)).toBe(true);
});

test.each([
  ['not JSON', () => readManifest('{nope'), 'notJson'],
  ['not an object', () => readManifest('[]'), 'notJson'],
  ['too big', () => readManifest(' '.repeat(MOST_MANIFEST_BYTES + 1)), 'tooBig'],
])('%s is refused', (_, read, code) => {
  expect(read).toThrow(ManifestError);
  try { read(); } catch (error) { expect(error.code).toBe(code); }
});

test.each([
  [(m) => { m.phosphor = 2; }, 'newer', {}],
  [(m) => { m.script = 'plugin.js'; }, 'needsNewer', {}],
  [(m) => { m.themes = []; }, 'nothing', {}],
  [(m) => { m.id = 'Jane.Midnight'; }, 'badField', { field: 'id' }],
  [(m) => { m.id = 'midnight'; }, 'badField', { field: 'id' }],
  [(m) => { m.version = 'one'; }, 'badField', { field: 'version' }],
  [(m) => { delete m.author; }, 'badField', { field: 'author' }],
  [(m) => { m.name = 'x'.repeat(61); }, 'badField', { field: 'name' }],
  [(m) => { m.homepage = 'http://example.com'; }, 'badField', { field: 'homepage' }],
  [(m) => { m.homepage = 'javascript:alert(1)'; }, 'badField', { field: 'homepage' }],
  [(m) => { m.themes[0].base = 'sepia'; }, 'badField', { field: 'themes[0].base' }],
  [(m) => { m.themes.push({ ...m.themes[0] }); }, 'badField', { field: 'themes[1].id' }],
  [(m) => { m.themes[0].colors.logo = '#fff'; }, 'unknownColor', { theme: 'Midnight', key: 'logo' }],
  [(m) => { m.themes[0].colors = JSON.parse('{"__proto__":"#fff"}'); }, 'unknownColor', { theme: 'Midnight', key: '__proto__' }],
  [(m) => { m.themes[0].colors.accent = 'url(https://example.com/x)'; }, 'badColor', { theme: 'Midnight', key: 'accent', value: 'url(https://example.com/x)' }],
  [(m) => { m.themes[0].colors.accent = 'red'; }, 'badColor', { theme: 'Midnight', key: 'accent', value: 'red' }],
])('a bad manifest is refused: %#', (change, code, detail) => {
  const error = refused(change);
  expect(error).toBeInstanceOf(ManifestError);
  expect({ code: error.code, detail: error.detail }).toEqual({ code, detail });
});

test('optional fields left out read as empty', () => {
  const raw = good();
  delete raw.description; delete raw.homepage; delete raw.license;
  expect(readManifest(JSON.stringify(raw))).toMatchObject({ description: '', homepage: '', license: '' });
});

// A slot added to global.css and forgotten here would be a color no theme can set.
test('the slots are the color properties of :root in global.css', () => {
  const css = readFileSync(new URL('../../src/assets/global.css', import.meta.url), 'utf8');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  const NOT_SLOTS = ['logo', 'display-font-family', 'display-font-size', 'display-line-height', 'white', 'black', 'accent-glow'];
  const declared = [...root.matchAll(/^\s*--([a-z0-9-]+):/gm)].map(([, name]) => name).filter((name) => !NOT_SLOTS.includes(name));
  expect([...COLOR_SLOTS]).toEqual(declared);
});

// The store reads a kept manifest again on every load: what was accepted once must be accepted again.
test('a manifest read once reads again as itself, optional fields left out or empty', () => {
  const bare = good();
  delete bare.description; delete bare.homepage; delete bare.license;
  for (const raw of [good(), bare, { ...good(), homepage: '', license: '' }]) {
    const once = readManifest(JSON.stringify(raw));
    expect(readManifest(JSON.stringify(once))).toEqual(once);
  }
});
