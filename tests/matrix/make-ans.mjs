// Writes tests/fixtures/matrix/scene.ans: a 120 x 50 textmode scene with every kind of cell a real .ans holds: spaces on colored
// backgrounds, shades (░▒▓), blocks (█▀▄▌▐), letters, single and double box lines, bright colors. CP437, 16 colors,
// with a SAUCE record giving its width and height. Run: node tests/matrix/make-ans.mjs
import { writeFileSync } from 'node:fs';

const W = 120, H = 50;
// DOS colors: 0 black 1 blue 2 green 3 cyan 4 red 5 magenta 6 brown 7 gray, +8 bright.
const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => ({ ch: ' ', fg: 7, bg: 0 })));
const put = (x, y, ch, fg, bg) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const c = grid[y][x];
  if (ch !== undefined) c.ch = ch;
  if (fg !== undefined) c.fg = fg;
  if (bg !== undefined) c.bg = bg;
};
const fill = (x0, y0, x1, y1, ch, fg, bg) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, ch, fg, bg); };
const text = (x, y, s, fg, bg) => [...s].forEach((ch, i) => put(x + i, y, ch, fg, bg));
const box = (x0, y0, x1, y1, [tl, h, tr, v, bl, br], fg, bg) => {
  for (let x = x0 + 1; x < x1; x++) { put(x, y0, h, fg, bg); put(x, y1, h, fg, bg); }
  for (let y = y0 + 1; y < y1; y++) { put(x0, y, v, fg, bg); put(x1, y, v, fg, bg); }
  put(x0, y0, tl, fg, bg); put(x1, y0, tr, fg, bg); put(x0, y1, bl, fg, bg); put(x1, y1, br, fg, bg);
};
const SINGLE = ['┌', '─', '┐', '│', '└', '┘'], DOUBLE = ['╔', '═', '╗', '║', '╚', '╝'];

// Night sky: blue spaces in bands, stars, a moon of blocks.
fill(0, 0, W - 1, 6, ' ', 7, 1);
fill(0, 7, W - 1, 13, ' ', 7, 0);
for (let i = 0; i < 70; i++) { const x = (i * 37) % W, y = (i * 11) % 14; put(x, y, i % 3 ? '·' : '*', i % 2 ? 15 : 14); }
for (let x = 0; x < W; x++) put(x, 6, '▄', 0, 1); // the band's edge as half blocks
fill(96, 2, 103, 5, '█', 14);
put(96, 2, '▄', 14, 1); put(103, 2, '▄', 14, 1); put(96, 5, '▀', 14, 1); put(103, 5, '▀', 14, 1);
fill(98, 3, 99, 4, '▓', 14, 6);

// A double-line title box with text.
box(4, 1, 45, 4, DOUBLE, 15, 1);
fill(5, 2, 44, 3, ' ', 15, 1);
text(8, 2, 'THE PHOSPHOR REVIEW MATRIX', 15, 1);
text(8, 3, 'a textmode scene, 120 x 50', 11, 1);

// Mountains in shades: each peak a stack of ░▒▓█ in magenta and gray.
const mountain = (cx, top, base, fg, bg) => {
  for (let y = top; y <= base; y++) {
    const half = y - top;
    for (let x = cx - half; x <= cx + half; x++) {
      const d = Math.abs(x - cx) / (half + 1);
      put(x, y, d > 0.8 ? '░' : d > 0.55 ? '▒' : d > 0.3 ? '▓' : '█', fg, bg);
    }
    if (y === top) put(cx, y, '▲', 15, 0);
  }
};
mountain(20, 10, 26, 5, 0);
mountain(52, 8, 26, 13, 5);
mountain(85, 12, 26, 8, 0);
for (let x = 50; x <= 54; x++) put(x, 10, x % 2 ? '▀' : '▄', 15, 5); // snow
// Hills: green spaces with ░ texture.
fill(0, 27, W - 1, H - 1, ' ', 2, 2);
for (let y = 27; y < H; y++) for (let x = (y * 3) % 5; x < W; x += 5) put(x, y, '░', 10, 2);
for (let x = 0; x < W; x++) put(x, 27, '▀', 0, 2);

// A house of blocks: a ▄/▀ roof, a red █ wall, ▌▐ windows, a door.
for (let r = 0; r < 5; r++) fill(18 - r * 2, 28 + r, 22 + r * 2, 28 + r, r % 2 ? '▄' : '▀', 8, r ? 8 : 2);
fill(10, 33, 30, 41, '█', 4, 0);
fill(13, 35, 16, 37, '▐', 14, 4); fill(24, 35, 27, 37, '▌', 14, 4);
fill(19, 37, 22, 41, '█', 1); put(21, 39, '·', 14, 1);
text(11, 42, 'HOME SWEET HOME', 15, 4);

// A tree: ▓▒ leaves on green, a brown trunk, apples as letters.
for (let y = 28; y <= 36; y++) for (let x = 60; x <= 76; x++) {
  const d = Math.hypot((x - 68) / 2, y - 32);
  if (d <= 4.6) put(x, y, d > 3.6 ? '▒' : '▓', 10, 2);
}
put(64, 31, 'o', 12, 2); put(70, 30, 'o', 12, 2); put(67, 34, 'o', 12, 2); put(72, 33, 'o', 12, 2);
fill(67, 37, 69, 43, '█', 6);

// A single-line sign with a poem, mixed backgrounds and none.
box(84, 30, 115, 38, SINGLE, 15, 0);
fill(85, 31, 114, 37, ' ', 7, 0);
text(87, 32, 'Two roads diverged, I took', 15, 4);
text(87, 33, 'the one with fewer pixels,', 11, 0);
text(87, 34, 'and that made all the diff.', 0, 6);
text(87, 36, 'Score: 9,999  Lives: \x03\x03\x03', 14, 0);

// A strip of every background color as spaces, and every foreground as █, along the bottom.
for (let c = 0; c < 8; c++) fill(4 + c * 6, 45, 9 + c * 6, 46, ' ', 7, c);
for (let c = 0; c < 16; c++) fill(56 + c * 3, 45, 58 + c * 3, 46, '█', c);
// Shades over each background, to see ░▒▓ against colors.
for (let c = 0; c < 8; c++) { put(4 + c * 6, 48, '░', 15, c); put(5 + c * 6, 48, '▒', 15, c); put(6 + c * 6, 48, '▓', 15, c); }
text(56, 48, 'the quick brown fox jumps over the lazy dog 0123456789', 15, 0);

// CP437 bytes.
const CP437 = {
  '░': 176, '▒': 177, '▓': 178, '│': 179, '┐': 191, '└': 192, '─': 196, '┘': 217, '┌': 218, '█': 219, '▄': 220, '▌': 221,
  '▐': 222, '▀': 223, '═': 205, '║': 186, '╔': 201, '╗': 187, '╚': 200, '╝': 188, '·': 250, '▲': 30, '\x03': 3,
};
const bytes = [];
const push = (s) => { for (const ch of s) bytes.push(ch.charCodeAt(0)); };
push('\x1b[0m');
const SGR = [0, 4, 2, 6, 1, 5, 3, 7]; // a DOS color to its ANSI code: DOS has blue at 1, ANSI has red
let fg = -1, bg = -1;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const c = grid[y][x];
    if (c.fg !== fg || c.bg !== bg) {
      push(`\x1b[0;${c.fg >= 8 ? '1;' : ''}${30 + SGR[c.fg & 7]};${40 + SGR[c.bg & 7]}m`);
      fg = c.fg; bg = c.bg;
    }
    const b = CP437[c.ch] ?? c.ch.charCodeAt(0);
    if (b > 255) throw new Error(`no CP437 byte for ${c.ch}`);
    bytes.push(b);
  }
  push('\x1b[0m'); // no CRLF: a full 120-column line wraps on its own (SAUCE gives the width)
  fg = -1; bg = -1;
}
bytes.push(0x1a);
// SAUCE: 128 bytes. DataType 1 (character), FileType 1 (ANSi), TInfo1 width, TInfo2 height.
const sauce = Buffer.alloc(128, 0x20);
sauce.write('SAUCE00', 0, 'latin1');
sauce.write('Review matrix scene'.padEnd(35), 7, 'latin1');
sauce.write('Phosphor QA'.padEnd(20), 42, 'latin1');
sauce.write(''.padEnd(20), 62, 'latin1');
sauce.write('20261125', 82, 'latin1');
sauce.writeUInt32LE(bytes.length, 90);
sauce.writeUInt8(1, 94);
sauce.writeUInt8(1, 95);
sauce.writeUInt16LE(W, 96);
sauce.writeUInt16LE(H, 98);
sauce.writeUInt16LE(0, 100); sauce.writeUInt16LE(0, 102);
sauce.writeUInt8(0, 104);
sauce.writeUInt8(0, 105); // TFlags
sauce.write('IBM VGA'.padEnd(22, '\0'), 106, 'latin1');
writeFileSync(new URL('../fixtures/matrix/scene.ans', import.meta.url), Buffer.concat([Buffer.from(bytes), sauce]));
console.log(`tests/fixtures/matrix/scene.ans: ${W} x ${H}, ${bytes.length + 128} bytes`);
