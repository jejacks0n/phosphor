// Settings schema: same keys, storage keys and reset defaults as before the schema existed,
// so users' persisted settings survive.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { SETTING_KEYS, SAUCE_KEYS, getSetting, cleanOptions, groupDefaults, settingsFromStranger, slidersAtDefaults, RESET_GROUPS } from '../../src/store/settings.js';
import { readProject } from '../../src/document/projectIO.js';
import { editScaleFor } from '../../src/document/PaintLayer.js';
import { fitRect } from '../../src/lib/Canvas.js';
import { CP437 } from '../../src/lib/Cp437.js';
import { ANSI_CHARSETS, ASCII_CHARSETS } from '../../src/lib/charsetPresets.js';
import { PALETTES } from '../../src/lib/ColorUtils.js';
import { generateSlug } from 'random-word-slugs';

test("Settings schema: same keys, storage keys and reset defaults as before the schema existed, so users' persisted settings survive", async () => {
  // same 23 keys as the pre-schema SETTING_KEYS; order follows the table
  assert.deepEqual([...SETTING_KEYS].sort(), ['cols', 'rows', 'aspectLock', 'aspectRatio', 'renderStyle', 'chars', 'fontBitmap', 'fontName', 'fontBlocks', 'fontLines', 'fontSets', 'fontWidth', 'charsAscii', 'seed', 'charChoice', 'charChoiceAscii', 'solverOptions', 'solids', 'patternLight', 'smoothing', 'quantize', 'palette', 'colorCount', 'ditherStyle', 'dither', 'invert', 'brightness', 'contrast', 'saturation', 'hue', 'colorize', 'colorizeStrength', 'levelsBlack', 'levelsWhite', 'levelsMid', 'posterize', 'threshold', 'thresholdDark', 'thresholdLight', 'blur', 'sharpen', 'flatten', 'edges', 'edgeColor', 'edgeThickness', 'filterOptions', 'solverNames'].sort());
  assert.deepEqual(SAUCE_KEYS, ['sauceUse9pxFont', 'sauceFontName', 'sauceTitle', 'sauceAuthor', 'sauceGroup', 'sauceDate', 'sauceUserComments', 'sauceRecord', 'sauceLetterSpacing']);
  assert.equal(getSetting('brightness').storageKey ?? 'current_file.brightness', 'current_file.brightness');
  assert.equal(getSetting('sauceUse9pxFont').storageKey, 'current_file.sauce.use9pxFont');
  assert.deepEqual(groupDefaults('transform'), { invert: 0, hue: 0, colorizeStrength: 0 });
  assert.deepEqual(groupDefaults('adjust'), {
    brightness: 100, contrast: 100, levelsBlack: 0, levelsWhite: 255, levelsMid: 1, saturation: 100,
    posterize: 1, threshold: 0, thresholdDark: '#000000', thresholdLight: '#ffffff',
  });
  assert.deepEqual(groupDefaults('effects'), { blur: 0, sharpen: 0, flatten: 0, edges: 0, edgeColor: '#000000', edgeThickness: 1 });
  // What a bake has to do: any slider in the reset groups off its default. The Colorize color alone
  // doesn't count (it does nothing at 0% and keeps its value through a reset).
  const neutral = Object.assign({}, ...RESET_GROUPS.map(groupDefaults));
  assert.equal(slidersAtDefaults(neutral), true);
  assert.equal(slidersAtDefaults({ ...neutral, contrast: 171 }), false);
  assert.equal(slidersAtDefaults({ ...neutral, brightness: '100' }), true);    // a slider's numeric string
  assert.equal(slidersAtDefaults({ ...neutral, edgeColor: '#ff0000' }), false); // the Edges color counts
  assert.equal(slidersAtDefaults({ ...neutral, colorize: '#00ff00' }), true);   // the Colorize color alone doesn't
  // A plugin filter's values are a group of their own, which Reset all and a bake reset too; none set is none on.
  assert.deepEqual(groupDefaults('filters'), { filterOptions: {} });
  assert.equal(slidersAtDefaults({ ...neutral, filterOptions: {} }), true);
  assert.equal(slidersAtDefaults({ ...neutral, filterOptions: { 'plugin:p.p/f': { name: 'F', values: { a: 1 } } } }), false);
});

const GOOD = { brightness: 120, contrast: '150', chars: 'abc', colorize: '#00ff00', aspectLock: false, sauceTitle: 'Hi', cols: 80, rows: 50 };

test('settings from another browser come back when every value is one a document could have, and only what a document saves', () => {
  assert.deepEqual(settingsFromStranger({ ...GOOD, _sharing: null, editCells: 1, hasPaint: true }), GOOD);
  const layout = { fit: { dx: 0, dy: 0, dw: 80, dh: 100 }, paintScale: 4, baseScale: 2, imageIsWorkingCopy: true };
  assert.deepEqual(settingsFromStranger({ ...GOOD, ...layout }), { ...GOOD, ...layout });
  assert.deepEqual(settingsFromStranger({ ...GOOD, paintScale: null, baseScale: null, fit: null }), GOOD);   // no layer yet
});

test('one bad value refuses them all, so nothing is half applied', () => {
  for (const bad of [
    { brightness: 501 }, { brightness: -1 }, { brightness: 'bright' }, { brightness: null }, { hue: Infinity }, { colorCount: 1 }, { dither: 101 }, { dither: -1 }, { ditherStyle: 3 },
    { chars: 7 }, { chars: ['a'] }, { palette: {} }, { seed: 1 }, { sauceTitle: 1 }, { solids: 101 }, { solids: -1 }, { patternLight: 101 }, { charChoice: 3 },
    { colorize: 'red' }, { edgeColor: '#12' }, { aspectLock: 'yes' }, { sauceUse9pxFont: 1 },
    { cols: 0 }, { cols: 1e6 }, { cols: 1.5 }, { rows: 0 }, { rows: 1e7 },
    { baseScale: 1e9 }, { baseScale: 0 }, { baseScale: 1.5 }, { baseScale: '2' }, { paintScale: 1e9 }, { paintScale: -1 }, { paintScale: 'x' },
    { fit: { dx: 0, dy: 0, dw: -1, dh: 1 } }, { fit: 'wide' }, { imageIsWorkingCopy: 'yes' },
  ]) assert.equal(settingsFromStranger({ ...GOOD, ...bad }), null, JSON.stringify(bad));
  for (const notAnObject of [null, undefined, 'x', 7]) assert.equal(settingsFromStranger(notAnObject), null);
});

test('every project fixture\'s settings would be taken from a host', async () => {
  for (const name of readdirSync('tests/fixtures/projects').filter((file) => file.endsWith('.phosphor'))) {
    const { settings } = await readProject(new Blob([readFileSync(`tests/fixtures/projects/${name}`)]));
    assert.ok(settingsFromStranger(settings), name);
  }
});

// A tall piece: a real project's layers at 1001 to 5000 lines. What a blank canvas or a large picture makes: a base layer at
// two pixels a grid pixel, whatever its length, and a paint layer at one past MAX_LAYER_DIM.
test('a tall grid\'s own layers are taken from a host, up to the longest the limits allow', () => {
  for (const [cols, lines] of [[80, 1001], [80, 2001], [80, 3000], [100, 5000], [300, 1666]]) {
    const rows = 2 * lines, size = Math.max(cols, rows);
    const made = { cols, rows, paintScale: editScaleFor(Infinity, Infinity, cols, rows), baseScale: Math.max(2, Math.floor(400 / size)), fit: fitRect(cols * 2, rows * 2, cols, rows) };
    assert.deepEqual(settingsFromStranger(made), made, `${cols} x ${lines} lines`);
  }
});

test('past the layer\'s rule, a scale on a tall grid is still refused', () => {
  const tall = { cols: 80, rows: 6000 };
  for (const bad of [{ baseScale: 3 }, { paintScale: 2 }, { baseScale: 1e9 }, { fit: { dx: 0, dy: 0, dw: 80, dh: 10001 } }, { fit: { dx: -10001, dy: 0, dw: 80, dh: 100 } }]) {
    assert.equal(settingsFromStranger({ ...tall, ...bad }), null, JSON.stringify(bad));
  }
  assert.equal(settingsFromStranger({ cols: 300, rows: 3336 }), null);   // past 500k cells
  assert.equal(settingsFromStranger({ cols: 100, rows: 10002 }), null);  // past 5000 lines
  assert.ok(settingsFromStranger({ cols: 300, rows: 3332 }));
  assert.ok(settingsFromStranger({ cols: 100, rows: 10000 }));
});

test('a project file keeps the paint scale of a tall grid, so its paint opens where it was', async () => {
  const json = new TextEncoder().encode(JSON.stringify({ cols: 80, rows: 6000, paintScale: 1, fit: { dx: 0, dy: 0, dw: 80, dh: 6000 } }));
  const file = new Blob(['PHOSPHOR', new Uint32Array([json.length, 0, 0]), json]);
  const { settings } = await readProject(file);
  assert.equal(settings.paintScale, 1);
  assert.deepEqual(settings.fit, { dx: 0, dy: 0, dw: 80, dh: 6000 });
});

test('a setting\'s text from a host is as long as a person could have, and no longer', () => {
  const widths = { sauceTitle: 35, sauceAuthor: 20, sauceGroup: 20, sauceDate: 8, sauceFontName: 20, sauceUserComments: 32 * 1024 }; // Comments: far past a record's 255 lines, so a paste isn't cut
  for (const [key, width] of Object.entries(widths)) {
    assert.ok(settingsFromStranger({ [key]: 'x'.repeat(width) }), key);
    assert.equal(settingsFromStranger({ [key]: 'x'.repeat(width + 1) }), null, key);
  }
  // Counted as the record counts: an emoji is one character, though it's two UTF-16 units.
  assert.ok(settingsFromStranger({ sauceTitle: '🎨'.repeat(35), sauceAuthor: '🎨'.repeat(20) }));
  assert.equal(settingsFromStranger({ sauceTitle: '🎨'.repeat(36) }), null);
  assert.deepEqual(settingsFromStranger({ sauceLetterSpacing: '9' }), { sauceLetterSpacing: '9' }); // a host's Letter spacing reaches artists
  assert.equal(settingsFromStranger({ sauceLetterSpacing: 'x'.repeat(5) }), null);
  for (const key of ['chars', 'charsAscii', 'palette', 'seed', 'renderStyle', 'quantize', 'smoothing']) assert.equal(settingsFromStranger({ [key]: 'x'.repeat(64 * 1024) }), null, key);
  const everyCp437Weighted = [...CP437].map((char) => char.repeat(40)).join('');
  assert.ok(settingsFromStranger({ chars: everyCp437Weighted, charsAscii: everyCp437Weighted }));
  for (const { chars } of [...ANSI_CHARSETS, ...ASCII_CHARSETS]) assert.ok(settingsFromStranger({ chars, charsAscii: chars }));
  for (const { id, name } of [...ANSI_CHARSETS, ...ASCII_CHARSETS]) assert.ok(name !== `charsets.${id}` && name.length <= 15, id); // named, and the name fits beside Characters
  for (const list of Object.values(PALETTES)) assert.ok(settingsFromStranger({ palette: list.map(({ hex }) => hex).join(' ') }));
  assert.ok(settingsFromStranger({ seed: generateSlug(2) }));
});

test('the Blocks & shades preset sets ▄░▒▓█', () => {
  assert.equal(ANSI_CHARSETS.find(({ name }) => name === 'Blocks & shades')?.chars, '▄░▒▓█');
});

test('Choose characters has its own help in the ASCII styles, about their ways of choosing, not Random or Best match', () => {
  const ascii = getSetting('charChoiceAscii').help;
  assert.match(ascii, /By intensity/);
  assert.match(ascii, /By brightness/);
  assert.match(ascii, /By shape/);
  assert.doesNotMatch(ascii, /Random|Best match/);
  assert.match(getSetting('charChoice').help, /Random/);
});

test('Edges moves in tenths: an arrow press is a step you can see, 200 presses end to end, and its label shows one decimal', () => {
  const edges = getSetting('edges');
  assert.equal(edges.step, 0.1);
  assert.equal(edges.decimals, 1);
  assert.equal(Math.round((edges.max - edges.min) / edges.step), 200);
});

test('solverOptions from a stranger: bad entries are dropped and the good kept, a value too big is trimmed, only a non-object is refused', () => {
  const ref = 'plugin:phosphor.outlines/outlines', other = 'plugin:phosphor.outlines/other';
  const options = { [ref]: { threshold: 40, thin: true } };
  assert.deepEqual(settingsFromStranger({ ...GOOD, solverOptions: options }), { ...GOOD, solverOptions: options });
  assert.deepEqual(settingsFromStranger({ ...GOOD, solverOptions: {} }), { ...GOOD, solverOptions: {} });
  const mixed = { [ref]: { threshold: 40, a: 'x', b: null, c: Infinity, d: [1] }, [other]: 4, 'nope': { a: 1 }, 'plugin:x': { a: 1 }, 'plugin:p.p/q': [1] };
  assert.deepEqual(settingsFromStranger({ ...GOOD, solverOptions: mixed }).solverOptions, { [ref]: { threshold: 40 } });
  for (const bad of [null, 'x', [], 4]) assert.equal(settingsFromStranger({ ...GOOD, solverOptions: bad }), null);
  // A ref is held to the shape a plugin's part has (goodPluginRef), as a filter's is.
  for (const loose of ['plugin:p/s', 'plugin:jane.fx/Up', 'plugin:-a.b/c', 'plugin:jane.fx/a/b']) assert.deepEqual(cleanOptions({ [loose]: { a: 1 } }), {}, loose);
  const many = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`plugin:p.p/s${i}`, { a: i }]));
  const trimmed = settingsFromStranger({ ...GOOD, solverOptions: many }).solverOptions;
  assert.ok(Object.keys(trimmed).length > 0 && Object.keys(trimmed).length < 400);
  assert.ok(JSON.stringify(trimmed).length <= 4096);
  assert.deepEqual(cleanOptions(many, 'plugin:p.p/s399') && Object.keys(cleanOptions(many, 'plugin:p.p/s399'))[0], 'plugin:p.p/s399'); // the named ref stays first
});

test('filterOptions from a stranger are cleaned as a filter\'s (name and values), not as a solver\'s; a non-object is refused', () => {
  const good = { 'plugin:jane.fx/glow': { name: 'Glow', values: { soft: true, tint: '#00ff00' } } };
  assert.deepEqual(settingsFromStranger({ ...GOOD, filterOptions: { ...good, nope: { name: 'N', values: {} } } }), { ...GOOD, filterOptions: good });
  for (const bad of [null, 'x', [], 4]) assert.equal(settingsFromStranger({ ...GOOD, filterOptions: bad }), null);
});

test('solverNames from a stranger keep a good ref\'s solver and plugin names, plain text of at most 60 characters, at most 32 of them', () => {
  const good = { 'plugin:jane.fx/shades': { name: 'Shades', plugin: 'Jane\'s effects' } };
  const bad = {
    nope: { name: 'N', plugin: 'P' }, 'plugin:p.p/a': { name: 'A' }, 'plugin:p.p/b': { name: 'B', plugin: 'two\nlines' },
    'plugin:p.p/c': { name: 'x'.repeat(61), plugin: 'P' }, 'plugin:p.p/d': { name: 4, plugin: 'P' }, 'plugin:p.p/e': 'E',
  };
  assert.deepEqual(settingsFromStranger({ ...GOOD, solverNames: { ...good, ...bad } }), { ...GOOD, solverNames: good });
  const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`plugin:p.p/s${i}`, { name: 'S', plugin: 'P' }]));
  assert.equal(Object.keys(settingsFromStranger({ ...GOOD, solverNames: many }).solverNames).length, 32);
  for (const wrong of [null, 'x', [], 4]) assert.equal(settingsFromStranger({ ...GOOD, solverNames: wrong }), null);
});

test('cleanOptions keeps a color option as a lowercase #rrggbb and drops other text', () => {
  assert.deepEqual(cleanOptions({ 'plugin:p.p/s': { tint: '#00ff00', up: '#00FF00', word: 'green', n: 3 } }), { 'plugin:p.p/s': { tint: '#00ff00', n: 3 } });
});

test('a plugin ref in charChoice or charChoiceAscii survives a stranger\'s settings', () => {
  const ref = 'plugin:phosphor.outlines/outlines';
  assert.deepEqual(settingsFromStranger({ ...GOOD, charChoice: ref, charChoiceAscii: ref }), { ...GOOD, charChoice: ref, charChoiceAscii: ref });
});
