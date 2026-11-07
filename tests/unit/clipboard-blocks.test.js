// The clipboard's HTML slot: Moebius's block shape (columns, rows, data), with Phosphor's own block
// in a `phosphor` field. Moebius cells both ways, the JSON written, and telling what was copied.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blockFromMoebius, clipboardHtml, moebiusData, readClipboardHtml } from '../../src/lib/clipboardBlocks.js';
import { MOST_SHAPES, rectShape } from '../../src/document/shapes.js';

const sample = (name) => readFileSync(new URL(`../fixtures/clipboard/${name}.html`, import.meta.url), 'utf8');
const SIXTEEN = sample('moebius-16-colors'), TRUE_COLOR = sample('moebius-24-bit');

test('a Moebius block comes in as edit cells in the DOS colors, a bright background as bright', () => {
  const { moebius: block } = readClipboardHtml(SIXTEEN);
  assert.equal(block.w, 6);
  assert.equal(block.h, 2);
  assert.deepEqual(block.cells[0], { char: '1', fg: '#ff5555', bg: '#000000' }); // 12: bright red
  assert.deepEqual(block.cells[1], { char: '2', fg: '#ff5555', bg: '#aa0000' }); // bg 4: red
  assert.equal(block.cells[2].fg, '#55ff55'); // 10: bright green
  assert.equal(block.cells[3].fg, '#5555ff'); // 9: bright blue
  assert.equal(blockFromMoebius({ columns: 1, rows: 1, data: [{ code: 32, fg: 7, bg: 9 }] }).cells[0].bg, '#5555ff'); // 9: bright blue, iCE, not blink
});

test('a cell\'s color is its rgb, else its xterm number, else the 16', () => {
  const { moebius: block } = readClipboardHtml(TRUE_COLOR);
  assert.deepEqual(block.cells[4], { char: '5', fg: '#87ff5f', bg: '#000000' }); // its fg is 0
  const one = (cell) => blockFromMoebius({ columns: 1, rows: 1, data: [{ code: 65, fg: 1, bg: 0, ...cell }] }).cells[0].fg;
  assert.equal(one({ fg_idx: 119 }), '#87ff5f');
  assert.equal(one({ fg_idx: 119, fg_rgb: { r: 1, g: 2, b: 3 } }), '#010203');
  assert.equal(one({}), '#0000aa'); // 1: blue
  assert.equal(one({ fg_rgb: { r: 'x' }, fg_idx: 999 }), '#0000aa'); // neither usable
});

test('characters come from CP437; a null cell, or a space on black in a transparent block, leaves what\'s there', () => {
  const block = blockFromMoebius({ columns: 4, rows: 1, transparent: true, data: [{ code: 220, fg: 7, bg: 0 }, null, { code: 32, fg: 7, bg: 0 }, { code: 32, fg: 7, bg: 1 }] });
  assert.equal(block.cells[0].char, '▄');
  assert.equal(block.cells[1], null);
  assert.equal(block.cells[2], null);
  assert.equal(block.cells[3].bg, '#0000aa');
  assert.equal(blockFromMoebius({ columns: 1, rows: 1, data: [{ code: 32, fg: 7, bg: 0 }] }).cells[0].char, ' ');
});

test('telling what the HTML slot holds', () => {
  const json = SIXTEEN.replace(/^<[^>]+>/, '');
  assert.ok(readClipboardHtml(json).moebius, 'without a meta tag');
  assert.ok(readClipboardHtml(`<html><body>\n<!--StartFragment-->${json}<!--EndFragment-->\n</body></html>`).moebius, 'Windows\' wrapper');
  assert.equal(readClipboardHtml('<p>hello</p>'), null);
  assert.equal(readClipboardHtml('<p>{not json</p>'), null);
  assert.equal(readClipboardHtml(''), null);
  assert.equal(readClipboardHtml('{"columns":2,"rows":2,"data":[{"code":65,"fg":7,"bg":0}]}'), null); // too few cells
  assert.equal(readClipboardHtml('{"columns":1,"rows":1,"data":[7]}').moebius.cells[0].char, ' '); // a cell that isn't one: a space
});

test('a Phosphor block is recognized by its version, and only what a block can hold is kept', () => {
  const phosphor = {
    version: 1, id: 'abc', w: 2, h: 1,
    cells: [{ char: 'a', fg: '#ff0000' }, { char: 7, fg: '#zzz', bg: '#00ff00' }],
    paint: 'data:image/png;base64,AAAA',
    base: { pixels: 'data:image/png;base64,BBBB', scale: 2, colors: 'data:image/png;base64,CCCC', pins: ['▄', 5] },
  };
  const moebius = { columns: 2, rows: 1, data: [{ code: 97, fg: 7, bg: 0 }, { code: 98, fg: 7, bg: 0 }] };
  const read = readClipboardHtml(clipboardHtml({ ...moebius, phosphor }));
  assert.deepEqual(read.phosphor, { ...phosphor, cells: [{ char: 'a', fg: '#ff0000' }, { bg: '#00ff00' }], base: { ...phosphor.base, pins: ['▄', null] } });
  assert.ok(readClipboardHtml(clipboardHtml({ ...moebius, phosphor: { ...phosphor, version: 2 } })).moebius, 'a later Phosphor\'s block: its Moebius cells');
  assert.ok(readClipboardHtml(clipboardHtml({ ...moebius, phosphor: { ...phosphor, paint: 'javascript:alert(1)' } })).moebius, 'not a PNG: not ours');
  assert.ok(readClipboardHtml(clipboardHtml({ ...moebius, phosphor: { ...phosphor, cells: [null] } })).moebius, 'cells the wrong length');
});

test('shapes copied on VECTOR are recognized by their version, each checked as a shape from outside; one that isn\'t is left out', () => {
  const a = rectShape(1, 2, 5, 6, { fill: '#ff0000' }), b = rectShape(3, 3, 9, 9, { fill: null, stroke: '#00ff00', width: 2 });
  const shapes = { version: 1, id: 'xyz', shapes: [a, { ...b, extra: 1 }, b, 'no'] };
  const read = readClipboardHtml(clipboardHtml({ phosphorShapes: shapes }));
  assert.equal(read.shapes.id, 'xyz');
  assert.deepEqual(read.shapes.shapes, [a, b]);
  assert.equal(readClipboardHtml(clipboardHtml({ phosphorShapes: { ...shapes, version: 2 } })), null, 'a later Phosphor\'s');
  assert.equal(readClipboardHtml(clipboardHtml({ phosphorShapes: { ...shapes, shapes: ['no'] } })), null, 'none a shape');
  assert.equal(readClipboardHtml(clipboardHtml({ phosphorShapes: { ...shapes, shapes: Array(MOST_SHAPES + 1).fill(a) } })), null, 'more than a frame holds');
  assert.equal(readClipboardHtml(clipboardHtml({ phosphorShapes: { ...shapes, id: 5 } })), null);
});

test('copied shapes\' keys come with the shapes kept, and a field with a bad one, or too few, pastes as it would with none', () => {
  const a = rectShape(1, 2, 5, 6, { fill: '#ff0000' }), b = rectShape(3, 3, 9, 9, { fill: '#00ff00' });
  const shapes = { version: 1, id: 'xyz', shapes: [a, 'no', b], keys: ['v:a', 'v:no', 'v:b'] };
  assert.deepEqual(readClipboardHtml(clipboardHtml({ phosphorShapes: shapes })).shapes.keys, ['v:a', 'v:b']);
  assert.equal(readClipboardHtml(clipboardHtml({ phosphorShapes: { ...shapes, keys: ['v:a', 'nope', 'v:b'] } })).shapes.keys, undefined);
  assert.equal(readClipboardHtml(clipboardHtml({ phosphorShapes: { ...shapes, keys: ['v:a'] } })).shapes.keys, undefined);
  assert.deepEqual(readClipboardHtml(clipboardHtml({ phosphorShapes: { ...shapes, keys: undefined } })).shapes.shapes, [a, b]);
});

test('the JSON is written as plain ASCII, so no browser or charset changes it', () => {
  const value = { a: '<&>漢 😀' };
  const html = clipboardHtml(value);
  assert.match(html, /^[\x20-\x7e]*$/);
  assert.doesNotMatch(html, /[<>&]/);
  assert.deepEqual(JSON.parse(html), value);
});

const color = (r, g, b) => ({ r, g, b, hex: '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('') });
const RED = color(255, 85, 85), BLUE = color(0, 0, 170), LIME = color(135, 255, 95);

test('what shows, as Moebius cells: the 16 colors in DOS order, with the exact color and its xterm number off CGA', () => {
  const cells = [{ char: 'A', fg: RED, bg: BLUE }, { char: '▄', fg: LIME, bg: BLUE }, { char: '•', fg: RED, bg: BLUE }];
  const cga = moebiusData(cells, 3, { c0: 0, r0: 0, c1: 2, r1: 0 }, 'cga');
  assert.deepEqual(cga, { columns: 3, rows: 1, data: [{ code: 65, fg: 12, bg: 1 }, { code: 220, fg: 10, bg: 1 }, { code: 7, fg: 12, bg: 1 }] });
  const full = moebiusData(cells, 3, { c0: 0, r0: 0, c1: 1, r1: 0 }, 'none');
  assert.deepEqual(full.data[0], { code: 65, fg: 12, bg: 1, fg_rgb: { r: 255, g: 85, b: 85 }, bg_rgb: { r: 0, g: 0, b: 170 }, fg_idx: 9, bg_idx: 4 });
  assert.equal(full.data[1].fg_idx, 119);
});

test('a wide character goes as its lookalike and a space; a missing cell as a space', () => {
  const cells = [{ char: '漢', wide: 'lead', fg: RED, bg: BLUE }, { char: '漢', wide: 'trail', fg: RED, bg: BLUE }, { char: '▁', fg: RED, bg: BLUE }];
  const { data } = moebiusData(cells, 4, { c0: 0, r0: 0, c1: 3, r1: 0 }, 'cga');
  assert.deepEqual(data.map((cell) => cell.code), [63, 32, 95, 32]); // ?, space, _ for ▁, nothing there
  assert.deepEqual(data[3], { code: 32, fg: 7, bg: 0 });
});
