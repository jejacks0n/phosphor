import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';
import { readManifest, ManifestError, COLOR_SLOTS, MOST_MANIFEST_BYTES } from '../../src/plugins/manifest.js';

const text = readFileSync(new URL('../../plugins/midnight/phosphor-plugin.json', import.meta.url), 'utf8');
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
  expect(m).toEqual({ ...good(), script: '', preview: '' });
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

const manifestWith = (change) => {
  const raw = { ...good(), ...change };
  for (const key of Object.keys(raw)) if (raw[key] === undefined) delete raw[key];
  return JSON.stringify(raw);
};

test('takes a script path relative to the manifest', () => {
  expect(readManifest(manifestWith({ script: 'outlines.js' })).script).toBe('outlines.js');
  expect(readManifest(manifestWith({ script: 'src/outlines.mjs' })).script).toBe('src/outlines.mjs');
  expect(readManifest(manifestWith({ script: 'a/.b/x.js' })).script).toBe('a/.b/x.js'); // a folder whose name starts with .
});

test("refuses a script path that leaves the folder, is absolute, has an empty or . folder, or isn't JavaScript", () => {
  for (const script of ['../x.js', '/x.js', 'a/../../x.js', 'x.ts', 'x.js?y', 'a\\x.js', 'x'.repeat(200) + '.js', 'a//x.js', 'a/./x.js']) {
    expect(() => readManifest(manifestWith({ script }))).toThrow(expect.objectContaining({ code: 'badField', detail: { field: 'script' } }));
  }
});

test('a script without themes is enough; neither is nothing', () => {
  expect(readManifest(manifestWith({ script: 'x.js', themes: undefined })).themes).toEqual([]);
  expect(readManifest(manifestWith({ script: 'x.js', themes: [] })).themes).toEqual([]);
  expect(() => readManifest(manifestWith({ themes: undefined }))).toThrow(expect.objectContaining({ code: 'nothing' }));
});

test('themes that are not a list, and a script that is not text, are badField', () => {
  for (const themes of [null, {}, 'x', 5]) {
    for (const script of [undefined, 'x.js']) {
      expect(() => readManifest(manifestWith({ themes, script }))).toThrow(expect.objectContaining({ code: 'badField', detail: { field: 'themes' } }));
    }
  }
  for (const script of [null, 5, {}]) {
    expect(() => readManifest(manifestWith({ script }))).toThrow(expect.objectContaining({ code: 'badField', detail: { field: 'script' } }));
  }
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
  const NOT_SLOTS = ['logo', 'display-font-family', 'ui-font-family', 'display-font-size', 'display-line-height'];
  const declared = [...root.matchAll(/^\s*--([a-z0-9-]+):/gm)].map(([, name]) => name).filter((name) => !NOT_SLOTS.includes(name));
  expect([...COLOR_SLOTS]).toEqual(declared);
  // The slots a theme has had since the first: none may go, or a kept theme would be refused.
  for (const slot of ['background', 'accent', 'surface-0', 'border', 'text', 'text-inverted']) expect(COLOR_SLOTS).toContain(slot);
  for (const slot of ['white', 'black', 'accent-glow', 'shadow', 'guide', 'toast', 'toast-text', 'wand-fill']) expect(COLOR_SLOTS).toContain(slot);
  expect(COLOR_SLOTS).toHaveLength(34);
});

// The store reads a kept manifest again on every load: what was accepted once must be accepted again.
test('a manifest read once reads again as itself, optional fields left out or empty', () => {
  const bare = good();
  delete bare.description; delete bare.homepage; delete bare.license;
  for (const raw of [good(), bare, { ...good(), script: 'x.js', themes: [] }, { ...good(), homepage: '', license: '' }]) {
    const once = readManifest(JSON.stringify(raw));
    expect(readManifest(JSON.stringify({ ...once, script: once.script || undefined }))).toEqual(once);
  }
});

test('preview: left out is empty, up to 3 short lines are kept, anything else is refused', () => {
  expect(readManifest(JSON.stringify(good())).preview).toBe('');
  expect(readManifest(JSON.stringify({ ...good(), preview: 'ab\ncd' })).preview).toBe('ab\ncd');
  expect(readManifest(JSON.stringify({ ...good(), preview: 'x'.repeat(24) })).preview).toBe('x'.repeat(24));
  for (const preview of ['a\nb\nc\nd', 'x'.repeat(25), 'a\tb', 'a\u0007b', 5, ['a']]) {
    const error = refused((raw) => { raw.preview = preview; });
    expect(error, JSON.stringify(preview)).toBeInstanceOf(ManifestError);
    expect([error.code, error.detail]).toEqual(['badField', { field: 'preview' }]);
  }
});

test('the official Outlines manifest reads with its preview', () => {
  const outlines = readFileSync(new URL('../../plugins/outlines/phosphor-plugin.json', import.meta.url), 'utf8');
  expect(readManifest(outlines).preview).toBe(' ╱──╲ \n│    │\n ╲──╱ ');
});

test('a theme-only manifest reads again from its own output', () => {
  const text = JSON.stringify({ phosphor: 1, id: 'kim.dusk', name: 'Dusk', version: '1.0.0', author: 'Kim', themes: [{ id: 'dusk', name: 'Dusk', base: 'dark', colors: {} }] });
  const once = readManifest(text);
  expect(once.script).toBe('');
  expect(readManifest(JSON.stringify(once)).id).toBe('kim.dusk');
});

// What's drawn over the art (the Brush's circle, a selection's dashes) and the black behind a picture must show on
// any art under any theme, so they're true white and black, not the slots a theme may set.
test('the marks over the art and the ground behind a picture use no white or black slot', () => {
  for (const file of ['EditorViewport.vue', 'PluginMarket.vue', 'social/RoomCard.vue']) {
    const source = readFileSync(new URL(`../../src/components/${file}`, import.meta.url), 'utf8');
    expect([file, /var\(--(white|black)\)/.test(source)]).toEqual([file, false]);
  }
});

// The two official themes are a dark one and a light one, each setting every slot, so either changes the whole
// interface: Midnight and Rain.
test('Midnight is a dark theme and Rain a light one, each setting every color slot', () => {
  for (const [path, base] of [['../../plugins/midnight/phosphor-plugin.json', 'dark'], ['../../plugins/rain/phosphor-plugin.json', 'light']]) {
    const [theme] = readManifest(readFileSync(new URL(path, import.meta.url), 'utf8')).themes;
    expect([path, theme.base]).toEqual([path, base]);
    expect(Object.keys(theme.colors).sort()).toEqual([...COLOR_SLOTS].sort());
  }
});
