// The character a cell shows once its selection is flipped or rotated: op 'h' (flip horizontally),
// 'v' (flip vertically) or 'cw' (rotate 90° clockwise). Box pieces and blocks turn by their shape;
// arrows, triangles, brackets and the like by a table. Anything else (letters, shades) stays as it is.
import { QUADRANTS } from '@/lib/Brushes';

// Box pieces by family, in the order of their arms [up, right, down, left]: a flip or a turn moves
// the arms, and the piece with the moved arms is in the same family, or for a family whose
// horizontal and vertical lines differ, in the family with them the other way round (`turns`).
const SHAPES = ['0101', '1010', '0110', '0011', '1100', '1001', '1110', '1011', '0111', '1101', '1111'];
const FAMILIES = [
  ['─│┌┐└┘├┤┬┴┼'], ['═║╔╗╚╝╠╣╦╩╬'], ['━┃┏┓┗┛┣┫┳┻╋'],
  ['═│╒╕╘╛╞╡╤╧╪', '─║╓╖╙╜╟╢╥╨╫'], ['─║╓╖╙╜╟╢╥╨╫', '═│╒╕╘╛╞╡╤╧╪'],
  ['━│┍┑┕┙┝┥┯┷┿', '─┃┎┒┖┚┠┨┰┸╂'], ['─┃┎┒┖┚┠┨┰┸╂', '━│┍┑┕┙┝┥┯┷┿'],
  ['─│╭╮╰╯'], ['┄┆'], ['┅┇'], ['┈┊'], ['┉┋'], ['╌╎'], ['╍╏'],
];
const MOVE = { h: (a) => [a[0], a[3], a[2], a[1]], v: (a) => [a[2], a[1], a[0], a[3]], cw: (a) => [a[3], a[0], a[1], a[2]] };
const BOX = new Map(); // char -> [family, its shape]
for (const [chars, turns = chars] of FAMILIES) {
  [...chars].forEach((char, i) => { if (!BOX.has(char)) BOX.set(char, { chars, turns, shape: SHAPES[i] }); });
}
function turnBox(char, op) {
  const { chars, turns, shape } = BOX.get(char);
  const moved = MOVE[op]([...shape]).join('');
  return [...(op === 'cw' ? turns : chars)][SHAPES.indexOf(moved)] ?? char;
}

// Blocks by the quadrants they fill (top-left 1, top-right 2, bottom-left 4, bottom-right 8).
const QUAD_MOVE = { h: [2, 1, 8, 4], v: [4, 8, 1, 2], cw: [2, 8, 1, 4] }; // where each quadrant goes
const turnQuadrants = (mask, op) => [1, 2, 4, 8].reduce((out, bit, i) => (mask & bit ? out | QUAD_MOVE[op][i] : out), 0);

// The rest: pairs that swap (a flip), and runs that each turn into the next (a quarter turn clockwise).
const PAIRS = {
  h: ['()', '[]', '{}', '<>', '/\\', '«»', '‹›', '⌐¬', '≤≥', '⌈⌉', '⌊⌋', '⟨⟩', '►◄', '▶◀', '→←', '⇒⇐', '↗↖', '↘↙',
    '◢◣', '◥◤', '╱╲', '╴╶', '╸╺', '▏▕', '⊂⊃'],
  v: ['↑↓', '⇑⇓', '▲▼', '⌠⌡', '/\\', '↖↙', '↗↘', '◤◣', '◥◢', '╱╲', '╵╷', '╹╻', '▔▁', '⌈⌊', '⌉⌋', '∩∪'],
};
const RUNS = ['↑→↓←', '⇑⇒⇓⇐', '▲►▼◄', '↖↗↘↙', '◤◥◢◣', '╵╶╷╴', '╹╺╻╸', '▔▕▁▏', '↔↕', '╱╲', '/\\', '-|'];
const TABLE = { h: new Map(), v: new Map(), cw: new Map([['▶', '▼'], ['◀', '▲']]) };
for (const op of ['h', 'v']) {
  for (const [a, b] of PAIRS[op]) TABLE[op].set(a, b).set(b, a);
}
for (const run of RUNS) [...run].forEach((char, i, all) => TABLE.cw.set(char, all[(i + 1) % all.length]));

export function turnChar(char, op) {
  const mask = QUADRANTS.indexOf(char);
  if (mask > 0) return QUADRANTS[turnQuadrants(mask, op)];
  if (BOX.has(char)) return turnBox(char, op);
  return TABLE[op].get(char) ?? char;
}
