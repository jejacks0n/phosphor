// Joining box-drawing characters. A piece is its arms [up, right, down, left], each 0 (none),
// 1 (single) or 2 (double). CP437 has a piece for every shape whose horizontal arms share a weight
// and whose vertical arms share one, which is all a join needs.
const SHAPES = ['0101', '1010', '0110', '0011', '1100', '1001', '1110', '1011', '0111', '1101', '1111'];
const SETS = [
  [1, 1, '─│┌┐└┘├┤┬┴┼'],
  [2, 2, '═║╔╗╚╝╠╣╦╩╬'],
  [2, 1, '═│╒╕╘╛╞╡╤╧╪'], // [horizontal, vertical] weights
  [1, 2, '─║╓╖╙╜╟╢╥╨╫'],
];

const CP437 = { arms: new Map(), pieces: new Map() }; // char -> arms; 'shape:h:v' -> char
for (const [h, v, chars] of SETS) {
  [...chars].forEach((char, i) => {
    const shape = SHAPES[i];
    CP437.pieces.set(`${shape}:${h}:${v}`, char);
    if (!CP437.arms.has(char)) CP437.arms.set(char, [...shape].map((on, d) => +on * (d % 2 ? h : v)));
  });
}

// A lone arm (a line's end) runs on straight through the cell.
const straight = (arms) => arms.map((w, d) => w || (arms.filter(Boolean).length === 1 ? arms[(d + 2) % 4] : 0));

// A family is what joins: the characters it reads (arms), the piece for some arms, and its weight.
// CP437's mixes Single and Double; any other family holds one style's eleven pieces, in one weight.
const cp437Piece = (arms) => {
  const [up, right, down, left] = straight(arms);
  const v = Math.max(up, down), h = Math.max(right, left);
  if (!v && !h) return null;
  return CP437.pieces.get(`${[up, right, down, left].map(w => (w ? 1 : 0)).join('')}:${h || 1}:${v || 1}`) ?? null;
};
const oneStyle = (chars, weight) => {
  const arms = new Map(), pieces = new Map();
  chars.forEach((char, i) => {
    pieces.set(SHAPES[i], char);
    if (!arms.has(char)) arms.set(char, [...SHAPES[i]].map(on => +on * weight));
  });
  return {
    arms, weight,
    piece: (a) => {
      const full = straight(a);
      return full.every(w => !w || w === weight) ? pieces.get(full.map(w => (w ? 1 : 0)).join('')) ?? null : null;
    },
  };
};
const DEFAULT = { arms: CP437.arms, piece: cp437Piece, weight: 1 };

const FAMILIES = new WeakMap(); // styles array -> style id -> family
const stockId = (styles, id) => styles.some(s => s.stock && s.id === id);

export function familyFor(styles, style) {
  let byId = FAMILIES.get(styles);
  if (!byId) FAMILIES.set(styles, byId = new Map());
  if (!byId.has(style.id)) {
    const weight = style.stock && style.id === 'double' ? 2 : 1;
    const mixed = style.stock && stockId(styles, 'single') && stockId(styles, 'double');
    byId.set(style.id, mixed ? { ...DEFAULT, weight } : oneStyle(style.chars, weight));
  }
  return byId.get(style.id);
}

export const armsOf = (char, family = DEFAULT) => family.arms.get(char) ?? null;

// The piece with these arms, or null for none. Each axis takes its heavier arm's weight.
export const pieceOf = (arms, family = DEFAULT) => family.piece(arms);

// The piece for `char` laid over `under` (the character already in the cell), with `inward` the
// arms pointing into the cell from its neighbors. `char` can be arms instead: a line's end is a lone
// arm, so where it lands on a line it joins it as a T, and with nothing to join it runs on straight.
// `closed` directions take no arm but the new piece's (a filled box's inside), so a line crossing
// there ends at the frame instead. Each axis takes the new piece's weight where it has one.
// Characters that aren't box pieces come back unchanged.
export function joinBox(char, under, inward = [0, 0, 0, 0], closed = [false, false, false, false], family = DEFAULT) {
  const own = Array.isArray(char) ? char : family.arms.get(char);
  if (!own) return char;
  const below = family.arms.get(under) ?? [0, 0, 0, 0];
  const arms = own.map((w, d) => w || (closed[d] ? 0 : (below[d] && (inward[d] || !inward[(d + 2) % 4]) ? below[d] : 0) || inward[d]));
  const v = own[0] || own[2] || Math.max(arms[0], arms[2]);
  const h = own[1] || own[3] || Math.max(arms[1], arms[3]);
  return family.piece(arms.map((w, d) => w && (d % 2 ? h : v))) ?? char;
}

// The arms pointing into a cell from the characters around it ([up, right, down, left] neighbors).
export function inwardArms([up, right, down, left], family = DEFAULT) {
  return [armsOf(up, family)?.[2] ?? 0, armsOf(right, family)?.[3] ?? 0, armsOf(down, family)?.[0] ?? 0, armsOf(left, family)?.[1] ?? 0];
}
