// Characters turning with a flipped or rotated selection: box pieces and blocks by their shape, the
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

test('a quarter turn clockwise turns lines, mixed pieces, blocks and arrows', () => {
  expect(turn('─│┌┐┘└├┬┤┴', 'cw')).toBe('│─┐┘└┌┬┤┴├');
  expect(turn('═║╒╓╞╥', 'cw')).toBe('║═╖╕╥╡'); // a single line turns single, a double one double
  expect(turn('━┏┍┎', 'cw')).toBe('┃┓┒┑');
  expect(turn('▀▐▄▌▘▞▛', 'cw')).toBe('▐▄▌▀▝▚▜');
  expect(turn('↑→↓←▲►▼◄↖◤╵▔↔/-', 'cw')).toBe('→↓←↑►▼◄▲↗◥╶▕↕\\|');
});

test('letters, digits and shades stay as they are', () => {
  for (const op of ['h', 'v', 'cw']) expect(turn('bdpqAZ09░▒▓☺@', op)).toBe('bdpqAZ09░▒▓☺@');
});

// ▶ and ◀ turn into ▼ and ▲, which turn on as CP437's ► and ◄ (the two sets share ▲ and ▼).
test('two flips, or four quarter turns, bring every character back', () => {
  expect(turn(turn(ALL, 'h'), 'h')).toBe(ALL);
  expect(turn(turn(ALL, 'v'), 'v')).toBe(ALL);
  expect(turn(turn(turn(turn(ALL, 'cw'), 'cw'), 'cw'), 'cw')).toBe(ALL);
});
