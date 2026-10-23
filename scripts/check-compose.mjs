// Composition of authored cells: glyph coverage, half-cell colours, authored attributes over the
// generated cell, paint over an authored cell, and effective (adjusted + snapped) colours.
// Run: node scripts/check-compose.mjs
import assert from 'node:assert/strict';
import { coverageOf, setGlyphRasterizer } from '../src/lib/GlyphCoverage.js';
import { halfColors, composeCell, coverCell, cellsOfPixels, cellsToPixels, bakedEntry } from '../src/lib/Cells.js';
import { effectiveColor, getEffectiveColor } from '../src/lib/PixelTransforms.js';
import { rgb2hex, hex2rgb, PALETTES } from '../src/lib/ColorUtils.js';

const C = (r, g, b, c) => ({ r, g, b, hex: rgb2hex({ r, g, b }), c: c ?? [r, g, b] });
const hexToColor = (hex) => ({ ...hex2rgb(hex), hex });
const NEUTRAL = { brightness: 100, contrast: 100, saturation: 100, hue: 0, invert: 0, colorize: '#ff00ff', colorizeStrength: 0 };
const white = C(255, 255, 255), black = C(0, 0, 0), red = C(255, 0, 0), blue = C(0, 0, 255);

assert.deepEqual(coverageOf('▀'), [1, 0]);
assert.deepEqual(coverageOf('A'), [0.5, 0.5]);                      // no rasterizer in node
setGlyphRasterizer(() => [0.2, 0.4]);
assert.deepEqual(coverageOf('A'), [0.2, 0.4]);
assert.deepEqual(coverageOf('▄'), [0, 1]);                          // exact table wins over the rasterizer
setGlyphRasterizer(null);
assert.deepEqual(coverageOf('A'), [0.5, 0.5]);                      // clearing the rasterizer clears its cache
assert.deepEqual(halfColors({ char: '▀', fg: red, bg: blue }), [{ r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 255 }]);
assert.deepEqual(halfColors({ char: '░', fg: white, bg: black }), [{ r: 64, g: 64, b: 64 }, { r: 64, g: 64, b: 64 }]);

const under = { char: '▄', fg: blue, bg: black };
const eff = (hex) => ({ ...hexToColor(hex), c: 'E' });              // stub marks effective colours
const a = composeCell(under, { char: 'A', fg: '#ffff55' }, 'ansi', eff);
assert.equal(a.char, 'A'); assert.equal(a.fg.c, 'E'); assert.equal(a.bg, black);
assert.equal(composeCell(under, { fg: '#ffff55' }, 'ascii', eff).fg, blue);   // ascii ignores authored colours
assert.equal(composeCell(under, { bg: '#ff0000' }, 'colorAscii', eff).bg.c, 'E');
assert.equal(composeCell(under, {}, 'ansi', eff).char, '▄');

const full = { char: '█', fg: white, bg: black };
// Paint over a cell shows through its character, the way image cells are built: paint on the top
// half tints the background, on the bottom half the foreground.
assert.equal(coverCell(full, null, { r: 1, g: 2, b: 3, a: 0 }, { renderStyle: 'ansi', palette: null }), full);
const letter = { char: 'A', fg: white, bg: black };
const covered = coverCell(letter, { r: 255, g: 0, b: 0, a: 1 }, null, { renderStyle: 'ansi', palette: null });
assert.equal(covered.char, 'A');                                    // the character stays
assert.equal(covered.bg.hex, '#ff0000');                           // painted top: the background
assert.equal(covered.fg.hex, '#ffffff');                           // unpainted bottom: the foreground as it was
assert.equal(coverCell(letter, null, { r: 0, g: 255, b: 0, a: 1 }, { renderStyle: 'ansi', palette: null }).fg.hex, '#00ff00'); // painted bottom: the foreground
const cga = coverCell(full, { r: 250, g: 90, b: 80, a: 1 }, null, { renderStyle: 'ansi', palette: PALETTES.cga });
assert.equal(cga.bg.c, 9);                                         // snapped to #ff5555: carries a palette index for CGA export
const half = coverCell(letter, { r: 255, g: 0, b: 0, a: 0.5 }, null, { renderStyle: 'ansi', palette: null });
assert.equal(half.bg.hex, rgb2hex({ r: 128, g: 0, b: 0 }));        // partial paint blends over the background
assert.equal(coverCell(letter, { r: 0, g: 0, b: 0, a: 1 }, null, { renderStyle: 'ascii', palette: null }).char, 'A'); // every style keeps the character
// Solid and empty characters have no texture to show paint through: they become a real half-block,
// each half the glyph's own colour with the paint over it.
const solidTop = coverCell(full, { r: 255, g: 0, b: 0, a: 1 }, null, { renderStyle: 'ansi', palette: null });
assert.deepEqual([solidTop.char, solidTop.bg.hex, solidTop.fg.hex], ['▄', '#ff0000', '#ffffff']);
const spaceBottom = coverCell({ char: ' ', fg: white, bg: blue }, null, { r: 255, g: 0, b: 0, a: 1 }, { renderStyle: 'ansi', palette: null });
assert.deepEqual([spaceBottom.char, spaceBottom.bg.hex, spaceBottom.fg.hex], ['▄', '#0000ff', '#ff0000']);
const upper = coverCell({ char: '▀', fg: red, bg: blue }, { r: 0, g: 255, b: 0, a: 1 }, null, { renderStyle: 'ansi', palette: null });
assert.deepEqual([upper.char, upper.bg.hex, upper.fg.hex], ['▄', '#00ff00', '#0000ff']); // the paint stays on the top half

assert.equal(effectiveColor('#ff5555', NEUTRAL, PALETTES.cga).c, 9);
assert.equal(effectiveColor('#fe0101', NEUTRAL, PALETTES.cga).c, 1);   // nearest is #aa0000, not #ff5555
assert.deepEqual(effectiveColor('#123456', NEUTRAL), { r: 0x12, g: 0x34, b: 0x56, hex: '#123456', c: [0x12, 0x34, 0x56] });

assert.equal(getEffectiveColor('#123456', NEUTRAL), '#123456');
assert.deepEqual(cellsOfPixels([{ x: 1.5, y: 0 }, { x: 1.2, y: 1 }, { x: -1, y: 0 }, { x: 0, y: 4 }], 4, 4), [{ col: 1, row: 0 }]);
// The pixel view's scale preview: each included cell as its two half-colours, one grid pixel each.
const pairs = [{ char: '▀', fg: red, bg: blue }, { char: '█', fg: white, bg: black }];
const px = cellsToPixels(pairs, 2, 3, (i) => i === 0);
assert.equal(px.length, 2 * 3 * 4);
assert.deepEqual([...px.slice(0, 4)], [255, 0, 0, 255]);        // cell 0 top half = fg (▀)
assert.deepEqual([...px.slice(8, 12)], [0, 0, 255, 255]);       // cell 0 bottom half = bg
assert.equal(px[7], 0);                                          // cell 1 excluded
assert.ok(px.slice(16).every(v => v === 0));                     // odd last pixel row: no cell
assert.ok(cellsToPixels(pairs, 2, 2, () => true).slice(4, 8).every(v => v === 255)); // all cells: █ top is white
// Baking/copying an image cell stores what that style shows: ANSI both halves; Color ASCII the
// averaged foreground on no background; ASCII only the character.
const imageCell = { char: '▄', bg: '#ff0000', fg: '#0000ff' };
assert.deepEqual(bakedEntry('ansi', imageCell), { char: '▄', fg: '#0000ff', bg: '#ff0000' });
assert.deepEqual(bakedEntry('colorAscii', imageCell), { char: '▄', fg: '#800080' });
assert.deepEqual(bakedEntry('ascii', imageCell), { char: '▄' });
console.log('compose ok');
