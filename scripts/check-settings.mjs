// Settings schema: same keys, storage keys and reset defaults as before the schema existed,
// so users' persisted settings survive. Run: node scripts/check-settings.mjs
import assert from 'node:assert/strict';
import { SETTING_KEYS, SAUCE_KEYS, getSetting, groupDefaults, slidersAtDefaults, RESET_GROUPS } from '../src/store/settings.js';

// same 23 keys as the pre-schema SETTING_KEYS; order follows the table
assert.deepEqual([...SETTING_KEYS].sort(), ['cols', 'rows', 'aspectLock', 'renderStyle', 'chars', 'charsAscii', 'seed', 'smoothing', 'quantize', 'palette', 'colorCount', 'invert', 'brightness', 'contrast', 'saturation', 'hue', 'colorize', 'colorizeStrength', 'sharpen', 'flatten', 'edges', 'edgeColor', 'edgeThickness'].sort());
assert.deepEqual(SAUCE_KEYS, ['sauceUse9pxFont', 'sauceFontName', 'sauceTitle', 'sauceAuthor', 'sauceGroup', 'sauceDate', 'sauceUserComments']);
assert.equal(getSetting('brightness').storageKey ?? 'current_file.brightness', 'current_file.brightness');
assert.equal(getSetting('sauceUse9pxFont').storageKey, 'current_file.sauce.use9pxFont');
assert.deepEqual(groupDefaults('transform'), { invert: 0, hue: 0, colorizeStrength: 0 });
assert.deepEqual(groupDefaults('adjust'), { brightness: 100, contrast: 100, saturation: 100 });
assert.deepEqual(groupDefaults('effects'), { sharpen: 0, flatten: 0, edges: 0, edgeColor: '#000000', edgeThickness: 1 });
// What a bake has to do: any slider in the reset groups off its default. The Colorize colour alone
// doesn't count (it does nothing at 0% and keeps its value through a reset).
const neutral = Object.assign({}, ...RESET_GROUPS.map(groupDefaults));
assert.equal(slidersAtDefaults(neutral), true);
assert.equal(slidersAtDefaults({ ...neutral, contrast: 171 }), false);
assert.equal(slidersAtDefaults({ ...neutral, brightness: '100' }), true);    // a slider's numeric string
assert.equal(slidersAtDefaults({ ...neutral, edgeColor: '#ff0000' }), false); // the Edges colour counts
assert.equal(slidersAtDefaults({ ...neutral, colorize: '#00ff00' }), true);   // the Colorize colour alone doesn't
console.log('settings ok');
