// The character a cell shows once its selection is flipped: op 'h' (flip horizontally) or 'v' (flip
// vertically). Box pieces and blocks turn by their shape; arrows, triangles, brackets and the like by
// a table. Anything else (letters, shades) stays as it is. (Rotate turns only pixels: no characters.)
import { QUADRANTS } from '@/lib/Brushes';
import { lineStylesOf } from '@/lib/FontLines';

// Box pieces by family, in the order of their arms [up, right, down, left]: a flip moves the arms,
// and the piece with the moved arms is in the same family.
const SHAPES = ['0101', '1010', '0110', '0011', '1100', '1001', '1110', '1011', '0111', '1101', '1111'];
const FAMILIES = [
  '─│┌┐└┘├┤┬┴┼', '═║╔╗╚╝╠╣╦╩╬', '━┃┏┓┗┛┣┫┳┻╋', '═│╒╕╘╛╞╡╤╧╪', '─║╓╖╙╜╟╢╥╨╫', '━│┍┑┕┙┝┥┯┷┿', '─┃┎┒┖┚┠┨┰┸╂',
  '─│╭╮╰╯', '┄┆', '┅┇', '┈┊', '┉┋', '╌╎', '╍╏',
];
const MOVE = { h: (a) => [a[0], a[3], a[2], a[1]], v: (a) => [a[2], a[1], a[0], a[3]] };
const boxOf = (families) => {
  const box = new Map(); // char -> its family and shape
  for (const chars of families) {
    [...chars].forEach((char, i) => { if (!box.has(char)) box.set(char, { chars, shape: SHAPES[i] }); });
  }
  return box;
};
const BOX = boxOf(FAMILIES);

// With a bitmap font, only the stock families whose styles it offers turn (a mixed one needs both), and
// an offered style of its own turns within itself; a stock piece a style reuses keeps its stock turn.
const fontBoxes = new WeakMap(); // the font's styles -> its table
function boxFor(font) {
  if (!font) return BOX;
  const styles = lineStylesOf(font);
  if (!fontBoxes.has(styles)) {
    const on = (id) => styles.find((s) => s.id === id)?.offered;
    const both = on('single') && on('double');
    const keep = [on('single'), on('double'), true, both, both]; // families 0-4; the rest always
    const box = boxOf(FAMILIES.filter((_, i) => keep[i] ?? true));
    for (const { chars } of styles.filter((s) => !s.stock && s.offered)) {
      for (const [char, v] of boxOf([chars.join('')])) if (!box.has(char)) box.set(char, v);
    }
    fontBoxes.set(styles, box);
  }
  return fontBoxes.get(styles);
}
function turnBox(box, char, op) {
  const { chars, shape } = box.get(char);
  return [...chars][SHAPES.indexOf(MOVE[op]([...shape]).join(''))] ?? char;
}

// Blocks by the quadrants they fill (top-left 1, top-right 2, bottom-left 4, bottom-right 8).
const QUAD_MOVE = { h: [2, 1, 8, 4], v: [4, 8, 1, 2] }; // where each quadrant goes
const turnQuadrants = (mask, op) => [1, 2, 4, 8].reduce((out, bit, i) => (mask & bit ? out | QUAD_MOVE[op][i] : out), 0);

// The rest: pairs that swap.
const PAIRS = {
  h: ['()', '[]', '{}', '<>', '/\\', '«»', '‹›', '⌐¬', '≤≥', '⌈⌉', '⌊⌋', '⟨⟩', '►◄', '▶◀', '→←', '⇒⇐', '↗↖', '↘↙',
    '◢◣', '◥◤', '╱╲', '╴╶', '╸╺', '▏▕', '⊂⊃'],
  v: ['↑↓', '⇑⇓', '▲▼', '⌠⌡', '/\\', '↖↙', '↗↘', '◤◣', '◥◢', '╱╲', '╵╷', '╹╻', '▔▁', '⌈⌊', '⌉⌋', '∩∪'],
};
const TABLE = { h: new Map(), v: new Map() };
for (const op of ['h', 'v']) {
  for (const [a, b] of PAIRS[op]) TABLE[op].set(a, b).set(b, a);
}

export function turnChar(char, op, font = null) {
  const mask = QUADRANTS.indexOf(char);
  if (mask > 0) return QUADRANTS[turnQuadrants(mask, op)];
  const box = boxFor(font);
  if (box.has(char)) return turnBox(box, char, op);
  return TABLE[op].get(char) ?? char;
}
