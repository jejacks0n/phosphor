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

const ARMS = new Map(); // char -> arms
const PIECES = new Map(); // 'shape:h:v' -> char
for (const [h, v, chars] of SETS) {
  [...chars].forEach((char, i) => {
    const shape = SHAPES[i];
    PIECES.set(`${shape}:${h}:${v}`, char);
    if (!ARMS.has(char)) ARMS.set(char, [...shape].map((on, d) => +on * (d % 2 ? h : v)));
  });
}

export const armsOf = (char) => ARMS.get(char) ?? null;

// The piece for `char` laid over `under` (the character already in the cell), with `inward` the
// arms pointing into the cell from its neighbors. `closed` directions take no arm but the new
// piece's (a filled box's inside), so a line crossing there ends at the frame instead. Each axis
// takes the new piece's weight where it has one. Characters that aren't box pieces come back unchanged.
export function joinBox(char, under, inward = [0, 0, 0, 0], closed = [false, false, false, false]) {
  const own = ARMS.get(char);
  if (!own) return char;
  const below = ARMS.get(under) ?? [0, 0, 0, 0];
  const arms = own.map((w, d) => w || (closed[d] ? 0 : below[d] || inward[d]));
  const v = own[0] || own[2] || Math.max(arms[0], arms[2]) || 1;
  const h = own[1] || own[3] || Math.max(arms[1], arms[3]) || 1;
  return PIECES.get(`${arms.map(w => (w ? 1 : 0)).join('')}:${h}:${v}`) ?? char;
}

// The arms pointing into a cell from the characters around it ([up, right, down, left] neighbors).
export function inwardArms([up, right, down, left]) {
  return [armsOf(up)?.[2] ?? 0, armsOf(right)?.[3] ?? 0, armsOf(down)?.[0] ?? 0, armsOf(left)?.[1] ?? 0];
}
