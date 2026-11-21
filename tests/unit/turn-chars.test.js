// Characters turning with a flipped selection: box pieces and blocks by their shape, the
// rest by a table; letters stay as they are.
import { test, expect } from 'vitest';
import { turnChar } from '@/lib/TurnChars';
import { slotChars } from '@/lib/BitmapFont';
import { cp437Font } from '../support/blockFonts.js';

const turn = (chars, op) => [...chars].map(c => turnChar(c, op)).join('');
const ALL = '─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬╒╕╘╛╞╡╤╧╪╓╖╙╜╟╢╥╨╫━┃┏┓┗┛┣┫┳┻╋┍┑┕┙┝┥┯┷┿┎┒┖┚┠┨┰┸╂╭╮╰╯┄┆┅┇┈┉┊┋╌╍╎╏'
  + ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█()[]{}<>/\\«»‹›⌐¬≤≥⌈⌉⌊⌋⟨⟩►◄→←⇒⇐↗↖↘↙◢◣◥◤╱╲╴╶╸╺▏▕⊂⊃↑↓⇑⇓▲▼⌠⌡╵╷╹╻▔▁∩∪↔↕-|';

test('flips swap box pieces, blocks, arrows and brackets left for right or top for bottom', () => {
  expect(turn('┌┐└┘├┤╔╗╒╓▌▐▀▘▙(<«⌐►→↗◢/', 'h')).toBe('┐┌┘└┤├╗╔╕╖▐▌▀▝▟)>»¬◄←↖◣\\');
  expect(turn('┌┐└┘┬┴╔╒▀▄▌▘▙↑▲⌠↖◢/', 'v')).toBe('└┘┌┐┴┬╚╘▄▀▌▖▛↓▼⌡↙◥\\');
  expect(turn('─│┼═║╬█░▒▓ ↔', 'h')).toBe('─│┼═║╬█░▒▓ ↔'); // symmetric already
});

test('letters, digits and shades stay as they are', () => {
  for (const op of ['h', 'v']) expect(turn('bdpqAZ09░▒▓☺@', op)).toBe('bdpqAZ09░▒▓☺@');
});

test('two flips bring every character back', () => {
  expect(turn(turn(ALL, 'h'), 'h')).toBe(ALL);
  expect(turn(turn(ALL, 'v'), 'v')).toBe(ALL);
});

const withLines = (lines) => ({ ...cp437Font, lines });
const heavy = { id: 'l1', name: 'Heavy', slots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };

test("a font's style flips within itself", () => {
  const font = withLines({ hide: [], styles: [heavy] });
  const H = slotChars(font).slice(1, 12);
  expect(turnChar(H[2], 'h', font)).toBe(H[3]);
  expect(turnChar(H[6], 'h', font)).toBe(H[7]);
  expect(turnChar(H[2], 'v', font)).toBe(H[4]);
  expect(turnChar('┌', 'h', font)).toBe('┐');
});

test("a hidden Single's characters don't flip", () => {
  const font = withLines({ hide: ['single'], styles: [] });
  expect(turnChar('┌', 'h', font)).toBe('┌');
  expect(turnChar('╔', 'h', font)).toBe('╗');
  expect(turnChar('╒', 'h', font)).toBe('╒'); // a mixed family needs both
});

test("an incomplete style's pieces don't flip", () => {
  const font = withLines({ hide: [], styles: [{ id: 'l1', name: 'Part', slots: [1, 2, 3, ...Array(8).fill(null)] }] });
  const c = slotChars(font)[3];
  expect(turnChar(c, 'h', font)).toBe(c);
});

test('with no font a flip is as ever', () => {
  expect(turnChar('┌', 'h', null)).toBe('┐');
});
