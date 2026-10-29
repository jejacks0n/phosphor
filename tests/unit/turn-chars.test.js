// Characters turning with a flipped selection: box pieces and blocks by their shape, the
// rest by a table; letters stay as they are.
import { test, expect } from 'vitest';
import { turnChar } from '@/lib/TurnChars';

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
