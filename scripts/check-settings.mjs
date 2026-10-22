// Settings schema: same keys, storage keys and reset defaults as before the schema existed,
// so users' persisted settings survive. Run: node scripts/check-settings.mjs
import assert from 'node:assert/strict';
import { SETTING_KEYS, SAUCE_KEYS, getSetting, groupDefaults } from '../src/store/settings.js';

// same 23 keys as the pre-schema SETTING_KEYS; order follows the table
assert.deepEqual([...SETTING_KEYS].sort(), ['cols', 'rows', 'aspectLock', 'renderStyle', 'chars', 'charsAscii', 'seed', 'smoothing', 'quantize', 'palette', 'colorCount', 'invert', 'brightness', 'contrast', 'saturation', 'hue', 'colorize', 'colorizeStrength', 'sharpen', 'flatten', 'edges', 'edgeColor', 'edgeThickness'].sort());
assert.deepEqual(SAUCE_KEYS, ['sauceUse9pxFont', 'sauceFontName', 'sauceTitle', 'sauceAuthor', 'sauceGroup', 'sauceDate', 'sauceUserComments']);
assert.equal(getSetting('brightness').storageKey ?? 'current_file.brightness', 'current_file.brightness');
assert.equal(getSetting('sauceUse9pxFont').storageKey, 'current_file.sauce.use9pxFont');
assert.deepEqual(groupDefaults('transform'), { invert: 0, hue: 0, colorizeStrength: 0 });
assert.deepEqual(groupDefaults('adjust'), { brightness: 100, contrast: 100, saturation: 100 });
assert.deepEqual(groupDefaults('effects'), { sharpen: 0, flatten: 0, edges: 0, edgeColor: '#000000', edgeThickness: 1 });
console.log('settings ok');
