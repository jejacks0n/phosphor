// .ans export never writes NUL for a character CP437 can't encode: it lists them (so the app can
// warn) and writes '?'. .utf8ans is unchanged. Run: node scripts/check-ans-export.mjs
import assert from 'node:assert/strict';
import { AnsiFile } from '../src/lib/AnsiFile.js';

const A = { r: 255, g: 255, b: 85, hex: '#ffff55', c: [255, 255, 85] };
const B = { r: 0, g: 0, b: 170, hex: '#0000aa', c: [0, 0, 170] };
const cells = [{ char: '★', fg: A, bg: B }, { char: '★', fg: A, bg: B }, { char: '◆', fg: A, bg: A }];
assert.deepEqual([...AnsiFile.unmappable(cells)], [['★', { count: 2, as: '?' }]]); // ◆ is written as ' ' (fg == bg), so it doesn't count
assert.equal(AnsiFile.unmappable([{ char: '🬀', fg: A, bg: B }]).size, 1);
assert.equal(AnsiFile.unmappable([{ char: '╬', fg: A, bg: B }]).size, 0);

const bytes = async (opts) => new Uint8Array(await new AnsiFile(3, 1, cells).toBlob({ colorMode: 'none', ...opts }).arrayBuffer());
const all = await bytes({});
const ans = all.slice(0, all.indexOf(0x1a));                            // the art, before SAUCE (which pads with NULs)
assert.ok(ans.includes(0x3f));                                          // '?'
assert.ok(!ans.includes(0x00));                                         // no NUL
const utf8 = await bytes({ utf8: true });
const star = [0xe2, 0x98, 0x85];
assert.ok(utf8.some((_, i) => star.every((b, j) => utf8[i + j] === b))); // ★ in UTF-8
assert.equal(AnsiFile.unicodeToCP437('★'), 0x3f);
assert.equal(AnsiFile.unicodeToCP437('╬'), 206);
// Block characters CP437 lacks (the default character set has ▁▂▃▅) go out as their closest
// CP437 lookalike rather than '?'; they're still listed so the export can say so.
assert.equal(AnsiFile.unicodeToCP437('▃'), 220);                        // ▄
assert.equal(AnsiFile.unicodeToCP437('▇'), 219);                        // █
assert.equal(AnsiFile.unicodeToCP437('▁'), 95);                         // _
assert.equal(AnsiFile.unicodeToCP437('▘'), 223);                        // ▀
assert.deepEqual(AnsiFile.unmappable([{ char: '▂', fg: A, bg: B }]).get('▂'), { count: 1, as: '▄' });
console.log('ans export ok');
