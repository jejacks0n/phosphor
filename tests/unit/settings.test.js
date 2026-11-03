// Settings schema: same keys, storage keys and reset defaults as before the schema existed,
// so users' persisted settings survive.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { SETTING_KEYS, SAUCE_KEYS, getSetting, groupDefaults, settingsFromStranger, slidersAtDefaults, RESET_GROUPS } from '../../src/store/settings.js';
import { readProject } from '../../src/document/projectIO.js';
import { editScaleFor } from '../../src/document/PaintLayer.js';
import { fitRect } from '../../src/lib/Canvas.js';
import { CP437 } from '../../src/lib/Cp437.js';
import { ANSI_CHARSETS, ASCII_CHARSETS } from '../../src/lib/charsetPresets.js';
import { PALETTES } from '../../src/lib/ColorUtils.js';
import { generateSlug } from 'random-word-slugs';

test("Settings schema: same keys, storage keys and reset defaults as before the schema existed, so users' persisted settings survive", async () => {
  // same 23 keys as the pre-schema SETTING_KEYS; order follows the table
  assert.deepEqual([...SETTING_KEYS].sort(), ['cols', 'rows', 'aspectLock', 'renderStyle', 'chars', 'charsAscii', 'seed', 'charChoice', 'charChoiceAscii', 'solids', 'patternLight', 'smoothing', 'quantize', 'palette', 'colorCount', 'ditherStyle', 'dither', 'invert', 'brightness', 'contrast', 'saturation', 'hue', 'colorize', 'colorizeStrength', 'levelsBlack', 'levelsWhite', 'levelsMid', 'posterize', 'threshold', 'thresholdDark', 'thresholdLight', 'blur', 'sharpen', 'flatten', 'edges', 'edgeColor', 'edgeThickness'].sort());
  assert.deepEqual(SAUCE_KEYS, ['sauceUse9pxFont', 'sauceFontName', 'sauceTitle', 'sauceAuthor', 'sauceGroup', 'sauceDate', 'sauceUserComments']);
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
  const widths = { sauceTitle: 35, sauceAuthor: 20, sauceGroup: 20, sauceDate: 8, sauceFontName: 20, sauceUserComments: 255 * 65 };
  for (const [key, width] of Object.entries(widths)) {
    assert.ok(settingsFromStranger({ [key]: 'x'.repeat(width) }), key);
    assert.equal(settingsFromStranger({ [key]: 'x'.repeat(width + 1) }), null, key);
  }
  for (const key of ['chars', 'charsAscii', 'palette', 'seed', 'renderStyle', 'quantize', 'smoothing']) assert.equal(settingsFromStranger({ [key]: 'x'.repeat(64 * 1024) }), null, key);
  const everyCp437Weighted = [...CP437].map((char) => char.repeat(40)).join('');
  assert.ok(settingsFromStranger({ chars: everyCp437Weighted, charsAscii: everyCp437Weighted }));
  for (const { chars } of [...ANSI_CHARSETS, ...ASCII_CHARSETS]) assert.ok(settingsFromStranger({ chars, charsAscii: chars }));
  for (const list of Object.values(PALETTES)) assert.ok(settingsFromStranger({ palette: list.map(({ hex }) => hex).join(' ') }));
  assert.ok(settingsFromStranger({ seed: generateSlug(2) }));
});

test('Choose characters has its own help in the ASCII styles, about their ways of choosing, not Random or Best match', () => {
  const ascii = getSetting('charChoiceAscii').help;
  assert.match(ascii, /By intensity/);
  assert.match(ascii, /By brightness/);
  assert.match(ascii, /By shape/);
  assert.doesNotMatch(ascii, /Random|Best match/);
  assert.match(getSetting('charChoice').help, /Random/);
});
