// The .pho a terminal shows when it's printed (src/document/phoTerminal.js, docs/pho.md's In a terminal): played in a
// headless terminal, it leaves the lines above, draws the art under the command, sets nothing and answers nothing, and the
// project reads back; when it can't be clean, the plain form is written.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import xterm from '@xterm/headless';
import { inflateSync } from 'node:zlib';
import { harmful, escapeBytes, unescapeBytes, terminalPho } from '../../src/document/phoTerminal.js';
import { phoFile, projectChunkOf, startsAsProject, readProject } from '../../src/document/projectIO.js';
import { indexedPng, rgbPng } from '../../src/lib/PngFile.js';

const bytes = (...parts) => Uint8Array.from(parts.flatMap((part) => (typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part)));
const ART = new TextEncoder().encode('\x1b[0m\x1b[38;5;196;48;5;21m▀▄█\x1b[0m cat me\r\n\x1b[1m░▒▓\x1b[0m two\r\n');
const typeAt = (file, at) => String.fromCharCode(...file.subarray(at, at + 4));

// A picture of `colors` colors in runs, its noise seeded, so its IDAT is tens of KB of bytes a terminal could act on.
function picture(colors, { width = 320, height = 160, seed = 3 } = {}) {
  const random = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32;
  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0, color = 0; p < width * height; p++) {
    if (random() < 0.2) color = Math.floor(random() * colors);
    rgba.set([(color * 37) & 255, (color * 91) & 255, color >> 8 ? 200 : (color * 13) & 255, 255], p * 4);
  }
  return { width, height, rgba };
}
const pngOf = async ({ width, height, rgba }, colors) => (colors > 256 ? rgbPng : indexedPng)(width, height, rgba);
// One that would act on the terminal printed as it is, and that the search makes clean: the first seed whose picture is
// both (how often a picture's search comes out clean is the compressor's, which differs between engines).
async function harmfulPng(colors) {
  for (let seed = 1; seed <= 50; seed++) {
    const png = await pngOf(picture(colors, colors > 256 ? { width: 160, height: 60, seed } : { seed }), colors);
    if (harmful(png) && await terminalPho(png, project, ART)) return png;
  }
  throw new Error(`no ${colors}-color picture in 50 both needed the search and came out clean`);
}
// An 8-bit indexed picture's rows with their filters (None, Sub, Up) undone, as a PNG reader undoes them.
function unfiltered(rows, stride) {
  const out = new Uint8Array((rows.length / (stride + 1)) * stride);
  for (let y = 0; y < out.length / stride; y++) {
    const type = rows[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const near = type === 1 && x ? out[y * stride + x - 1] : type === 2 && y ? out[(y - 1) * stride + x] : 0;
      out[y * stride + x] = (rows[y * (stride + 1) + 1 + x] + near) & 255;
    }
  }
  return out;
}
const project = Uint8Array.from({ length: 5000 }, (_, i) => (i * 7919) & 255); // every byte value, ESC among them

// What a terminal shows after a command, the file printed, and a plain prompt that sends no escape of its own.
async function played(file) {
  const term = new xterm.Terminal({ cols: 100, rows: 30, allowProposedApi: true, logLevel: 'off' });
  let answers = '', titles = 0;
  term.onData((data) => { answers += data; });
  term.onTitleChange(() => titles++);
  const modes = JSON.stringify(term.modes);
  const write = (data) => new Promise((resolve) => term.write(data, resolve));
  await write('line above\r\n$ cat drawing.pho\r\n');
  await write(file);
  await write('$ ');
  const buffer = term.buffer.active, line = (y) => buffer.getLine(y).translateToString(true);
  return { buffer: buffer.type, scrolled: buffer.baseY, lines: [0, 1, 2, 3, 4].map(line), answers, titles, modesKept: JSON.stringify(term.modes) === modes };
}

test('escaping the project leaves no byte a terminal reacts to, and undoes exactly', () => {
  const every = Uint8Array.from({ length: 512 }, (_, i) => i & 255), escaped = escapeBytes(every);
  for (const byte of [0x05, 0x07, 0x18, 0x1a, 0x1b, 0xc2]) assert.ok(!escaped.includes(byte), `0x${byte.toString(16)} left in`);
  assert.deepEqual(unescapeBytes(escaped), every);
  assert.equal(unescapeBytes(bytes([0x41, 0xfe])), null); // cut off after a mark
  assert.equal(unescapeBytes(bytes([0xfe, 0x41])), null); // a mark before a byte it doesn't escape
});

test('harmful counts what acts beyond the alternate screen, through the junk a terminal skips inside an escape', () => {
  assert.equal(harmful(bytes('\x1bc')), 1); // a reset
  assert.equal(harmful(bytes('\x1bZ')), 1); // an identify, answered into the prompt
  assert.equal(harmful(bytes('\x1b', [0x05, 0xa0, 0xf2, 0x0f], 'c')), 1); // still a reset, as a terminal reads it
  assert.equal(harmful(bytes('\x1b[6n', '\x1b[c', '\x1b[>0c', '\x1b[5i')), 4); // answers, and printing
  assert.equal(harmful(bytes([0xc2, 0x9b], '6n')), 1); // CSI as UTF-8's C1
  assert.equal(harmful(bytes('\x1b[0m\x1b[?1049h\x1b[3A\x1b(B\x1b>abc')), 0);
  assert.equal(harmful(bytes('\x1b\x18c', '\x1b\x1bZ')), 1); // CAN ends the escape; a second ESC starts another
});

test('the escapes Phosphor writes around the art are only ones every terminal knows (one it doesn\'t, it prints)', async () => {
  const file = await terminalPho(await pngOf(picture(2), 2), project, ART);
  const dataOf = (type) => {
    const at = file.findIndex((_, i) => typeAt(file, i + 4) === type);
    return file.subarray(at + 8, at + 8 + new DataView(file.buffer).getUint32(at));
  };
  const latin1 = (b) => String.fromCharCode(...b), art = dataOf('phCa'), artAt = latin1(art).indexOf(latin1(ART));
  const ours = latin1(dataOf('phCs')) + latin1(art.subarray(0, artAt)) + latin1(art.subarray(artAt + ART.length));
  const sequences = ours.replace(/[\r\0\x0f]/g, '').split(/(?=\x1b)/); // eslint-disable-line no-control-regex
  assert.ok(sequences.length > 10);
  for (const seq of sequences) assert.match(seq, /^\x1b(\[\??\d*[AJhlm]|\[!p|[()]B|>|\]4242;)$/); // eslint-disable-line no-control-regex
});

for (const colors of [2, 16, 100, 1000]) {
  test(`a ${colors}-color drawing's .pho, printed in a terminal, shows its art under the command and nothing else`, async () => {
    const png = await harmfulPng(colors), file = await phoFile(png, project, ART);
    assert.equal(typeAt(file, 37), 'phCs', 'written in the form a terminal shows');
    assert.ok(startsAsProject(file.subarray(0, 41)));
    assert.deepEqual(projectChunkOf(file), project);
    assert.deepEqual([...file.subarray(-2)], [0x1b, 0x5c]); // ST after IEND
    const shown = await played(file);
    assert.equal(shown.buffer, 'normal');
    assert.equal(shown.scrolled, 0);
    assert.deepEqual(shown.lines, ['line above', '$ cat drawing.pho', '▀▄█ cat me', '░▒▓ two', '$ ']);
    assert.equal(shown.answers, '');
    assert.equal(shown.titles, 0);
    assert.ok(shown.modesKept);
  });
}

test('when it can\'t be clean, Save writes the plain form, phPr right after IHDR', async () => {
  // A palette that spells a reset: the bytes are the colors, and no filter changes them.
  const { width, height, rgba } = picture(2);
  rgba.set([0x1b, 0x63, 0x00, 255], 0);
  const spelled = await indexedPng(width, height, rgba);
  assert.equal(await terminalPho(spelled, project, ART), null);
  const file = await phoFile(spelled, project, ART);
  assert.equal(typeAt(file, 37), 'phPr');
  assert.deepEqual(projectChunkOf(file), project);
});

test('a big picture whose deflate says hundreds of sequences is written again clean, the same picture', async () => {
  const big = await pngOf(picture(200, { width: 640, height: 800 }), 200), file = await terminalPho(big, project, ART);
  assert.ok(harmful(big) > 20);
  assert.equal(typeAt(file, 37), 'phCs');
  assert.equal(harmful(file.subarray(41)), 0);
  const pixels = async (png) => {
    const idat = png.findIndex((_, i) => typeAt(png, i) === 'IDAT') - 4;
    const data = png.subarray(idat + 8, idat + 8 + new DataView(png.buffer, png.byteOffset).getUint32(idat));
    return unfiltered(new Uint8Array(inflateSync(data)), 640);
  };
  assert.deepEqual(await pixels(file), await pixels(big));
});

test('a .pho of either form opens, and one damaged in the terminal form is no project', async () => {
  const euphio = new Uint8Array(await readFile(new URL('../fixtures/projects/euphio.pho', import.meta.url)));
  assert.equal(typeAt(euphio, 37), 'phPr'); // saved before the terminal form
  assert.ok(await readProject(new Blob([euphio])));
  const file = await terminalPho(await pngOf(picture(16), 16), project, ART);
  const bad = (b) => assert.throws(() => projectChunkOf(b), { code: 'INVALID_PROJECT' });
  const projectAt = 41 + file[36] + 4, flipped = file.slice();
  flipped[projectAt + 20] ^= 1;
  bad(flipped); // its CRC
  bad(file.slice(0, projectAt + 100)); // cut off
  const longStart = file.slice();
  longStart[33] = 0x7f; // phCs claiming more than the file
  bad(longStart);
});
