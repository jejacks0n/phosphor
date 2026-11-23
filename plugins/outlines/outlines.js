// Outlines, an example Phosphor plugin: a solver that draws - | / and \ along a picture's outlines, the darker side's
// color on the lighter side's, and leaves the rest of the picture to By shape. Copy this folder to start your own
// (docs/plugins.md, "Writing a solver").
//
// Pass 1 (solve) reads the cell and its eight neighbors (reach 1): each one's brightness, and a Sobel gradient across
// the nine. Where the gradient is at or past Threshold, the cell gets the line that runs along the edge.
// Pass 2 (refine) reads pass 1's characters around the cell. With Clean up, a line with no line beside it goes, and a
// line between two of another kind takes theirs (a / in a run of - becomes -). A cell it doesn't change keeps pass 1's
// result (refine returns null). Pass 2 sees characters only, so when the layer's set holds - (say), By shape's - reads
// as a line to Clean up too.
//
// Both passes are here twice: in JavaScript, and as shaders that run on the graphics card. Phosphor checks the shaders
// against the JavaScript before it uses them, so they're written to work out the same numbers in the same order.

// The lines, in the order the code counts them (0 -, 1 |, 2 /, 3 \): the ASCII ones, then the box-drawing ones.
const LINES = ['-|/\\', '─│╱╲'];

// The 3 x 3 window, counted row by row from the top left: 0 1 2 / 3 4 5 / 6 7 8, the cell itself 4.
const at = (dx, dy) => (dy + 1) * 3 + dx + 1;
// Each line's two sides, three cells each: - above and below, | left and right, / above-left and below-right, \
// above-right and below-left.
const SIDES = [[[0, 1, 2], [6, 7, 8]], [[0, 3, 6], [2, 5, 8]], [[0, 1, 3], [8, 7, 5]], [[2, 1, 5], [6, 7, 3]]];
// The two cells each line runs on through, for Clean up: - left and right, | up and down, / up-right and down-left, \
// up-left and down-right.
const RUNS = [[3, 5], [1, 7], [2, 6], [0, 8]];
// The strongest gradient nine brightnesses 0..255 can make (255 x √20): Threshold's 100.
const STRONGEST = 255 * Math.sqrt(20);

// ---- JavaScript ----

// Each window cell's 32 samples added up, [r, g, b] a cell. A pass is called for one cell at a time, so one array does.
const sums = new Float64Array(27);
function readWindow(cell) {
  sums.fill(0);
  for (let j = 0; j < 9; j++) {
    for (let i = 0; i < 32; i++) {
      const s = cell.sample(j % 3 - 1, Math.floor(j / 3) - 1, i); // one array, overwritten by the next call
      sums[j * 3] += s[0];
      sums[j * 3 + 1] += s[1];
      sums[j * 3 + 2] += s[2];
    }
  }
}
const sumOf = (j) => [sums[j * 3], sums[j * 3 + 1], sums[j * 3 + 2]];

// The line for the edge through the cell (0 to 3), or -1 where there's none at Threshold. Brightnesses are rounded, so
// the gradient is whole numbers and the shader's sector is the same as this one.
function lineOf(look) {
  const b = (dx, dy) => Math.round(look.gray(sumOf(at(dx, dy))) / 32);
  const gx = b(1, -1) + 2 * b(1, 0) + b(1, 1) - b(-1, -1) - 2 * b(-1, 0) - b(-1, 1);
  const gy = b(-1, 1) + 2 * b(0, 1) + b(1, 1) - b(-1, -1) - 2 * b(0, -1) - b(1, -1);
  if ((gx === 0 && gy === 0) || 100 * Math.hypot(gx, gy) < look.options.threshold * STRONGEST) return -1;
  // The line runs across the gradient, by 45° sectors (5 / 12 is about tan 22.5°): a gradient across is a | line.
  const ax = Math.abs(gx), ay = Math.abs(gy);
  if (12 * ay <= 5 * ax) return 1;
  if (12 * ax <= 5 * ay) return 0;
  return gx * gy > 0 ? 2 : 3;
}

// A line's cell: the darker side's mean color on the lighter side's.
function lineCell(look, k) {
  const side = (cells) => {
    const [a, b, c] = cells.map(sumOf);
    return { r: (a[0] + b[0] + c[0]) / 96, g: (a[1] + b[1] + c[1]) / 96, b: (a[2] + b[2] + c[2]) / 96 };
  };
  const one = side(SIDES[k][0]), two = side(SIDES[k][1]), darker = look.gray(one) <= look.gray(two);
  return { char: LINES[look.options.lines][k], fg: darker ? one : two, bg: darker ? two : one };
}

// Where there's no line: By shape's pick, or blank in the cell's mean color. Blank is the set's first character with
// no ink (a space), else its solid (█, else ▄, else its first character), as the shader's 255 is.
let blankFor = null, blank = '';
function elsewhere(cell, look) {
  if (look.options.elsewhere === 0) return look.byShape();
  if (blankFor !== look) { // look is the same object all through a resolve
    const set = look.glyphs.filter((g) => !g.own).map((g) => g.char);
    blankFor = look;
    blank = look.glyphs.find((g) => g.mask.every((ink) => ink === 0))?.char ?? (set.includes('█') ? '█' : set.includes('▄') ? '▄' : set[0]);
  }
  const mean = { r: sums[12] / 32, g: sums[13] / 32, b: sums[14] / 32 };
  return { char: blank, fg: mean, bg: mean };
}

function solve(cell, look) {
  readWindow(cell);
  const k = lineOf(look);
  return k < 0 ? elsewhere(cell, look) : lineCell(look, k);
}

function refine(cell, look) {
  if (!look.options.clean_up) return null; // pass 1's cell, kept
  const lines = LINES[look.options.lines];
  const kinds = [];
  for (let j = 0; j < 9; j++) {
    const char = cell.char(j % 3 - 1, Math.floor(j / 3) - 1); // null past the border
    kinds.push(char === null ? -1 : lines.indexOf(char));
  }
  const was = kinds[4];
  let k = was;
  if (was >= 0) {
    if (kinds.every((kind, j) => j === 4 || kind < 0)) k = -1; // alone
    else {
      for (let d = 0; d < 4; d++) {
        if (d !== was && kinds[RUNS[d][0]] === d && kinds[RUNS[d][1]] === d) {
          k = d;
          break;
        }
      }
    }
  }
  if (k === was) return null; // unchanged: pass 1's cell, kept
  readWindow(cell);
  return k < 0 ? elsewhere(cell, look) : lineCell(look, k);
}

// ---- GLSL ----
// Each pass is the body of a function Phosphor puts after its prelude (docs/plugins.md, "The shader"); the
// pieces both passes share are strings put together here. The tables come from the JavaScript's, so they can't drift.
// A glyph is named by its index: ownGlyph[n] is the index of this solver's nth character (in chars, LINES joined), so
// line k of the Lines choice is ownGlyph[4 * opt_lines + k], wherever the layer's set put it.
// A shader can't keep pass 1's cell as refine's null does, so its refine works pass 1's cell out again (WINDOW, LINE)
// and uses it where Clean up changes nothing.

const WINDOW_GLSL = `
  vec3 sums[9];
  for (int j = 0; j < 9; j++) {
    vec3 sum = vec3(0);
    for (int i = 0; i < 32; i++) sum += sampleAt(ivec2(j % 3 - 1, j / 3 - 1), i);
    sums[j] = sum;
  }`;

const LINE_GLSL = `
  const float STRONGEST = 255.0 * sqrt(20.0);
  float b[9];
  for (int j = 0; j < 9; j++) b[j] = floor((0.2126 * sums[j].r + 0.7152 * sums[j].g + 0.0722 * sums[j].b) / 32.0 + 0.5);
  float gx = b[2] + 2.0 * b[5] + b[8] - b[0] - 2.0 * b[3] - b[6];
  float gy = b[6] + 2.0 * b[7] + b[8] - b[0] - 2.0 * b[1] - b[2];
  int k = -1;
  if ((gx != 0.0 || gy != 0.0) && !(100.0 * length(vec2(gx, gy)) < opt_threshold * STRONGEST)) {
    float ax = abs(gx), ay = abs(gy);
    k = 12.0 * ay <= 5.0 * ax ? 1 : 12.0 * ax <= 5.0 * ay ? 0 : gx * gy > 0.0 ? 2 : 3;
  }`;

const PUT_GLSL = `
  if (k < 0) {
    if (opt_elsewhere == 0) { byShape(); return; }
    int blank = 255;
    for (int g = 0; g < glyphCount && blank == 255; g++) {
      bool empty = true;
      for (int i = 0; i < 32; i++) if (glyphMask(g, i) != 0.0) empty = false;
      if (empty) blank = g;
    }
    vec3 mean = sums[4] / 32.0;
    put(mean, mean, blank);
    return;
  }
  const int SIDES[24] = int[24](${SIDES.flat(2).join(', ')});
  vec3 one = (sums[SIDES[k * 6]] + sums[SIDES[k * 6 + 1]] + sums[SIDES[k * 6 + 2]]) / 96.0;
  vec3 two = (sums[SIDES[k * 6 + 3]] + sums[SIDES[k * 6 + 4]] + sums[SIDES[k * 6 + 5]]) / 96.0;
  bool darker = 0.2126 * one.r + 0.7152 * one.g + 0.0722 * one.b <= 0.2126 * two.r + 0.7152 * two.g + 0.0722 * two.b;
  put(darker ? one : two, darker ? two : one, ownGlyph[4 * opt_lines + k]);`;

const REFINE_GLSL = `
  const int RUNS[8] = int[8](${RUNS.flat().join(', ')});
  int kinds[9];
  for (int j = 0; j < 9; j++) {
    int c = charAt(ivec2(j % 3 - 1, j / 3 - 1)); // -1 past the border
    kinds[j] = -1;
    for (int n = 0; n < 4; n++) if (c == ownGlyph[4 * opt_lines + n]) kinds[j] = n;
  }
  int was = kinds[4], now = was;
  if (was >= 0 && opt_clean_up) {
    bool alone = true;
    for (int j = 0; j < 9; j++) if (j != 4 && kinds[j] >= 0) alone = false;
    if (alone) now = -1;
    else {
      for (int d = 0; d < 4; d++) {
        if (d != was && kinds[RUNS[d * 2]] == d && kinds[RUNS[d * 2 + 1]] == d) { now = d; break; }
      }
    }
  }
  if (now != was) k = now; // else pass 1's k, worked out again above`;

export default {
  solvers: [{
    id: 'outlines',
    name: 'Outlines',
    styles: ['ansi', 'colorAscii', 'ascii'],
    reach: 1,
    chars: LINES.join(''),
    options: [
      { id: 'threshold', kind: 'slider', name: 'Threshold', min: 0, max: 100, step: 1, default: 40 },
      { id: 'lines', kind: 'choice', name: 'Lines', choices: ['ASCII', 'Box drawing'], default: 0 },
      { id: 'elsewhere', kind: 'choice', name: 'Elsewhere', choices: ['By shape', 'Blank'], default: 0 },
      { id: 'clean_up', kind: 'checkbox', name: 'Clean up', default: true },
    ],
    solve,
    refine,
    shader: {
      solve: WINDOW_GLSL + LINE_GLSL + PUT_GLSL,
      refine: WINDOW_GLSL + LINE_GLSL + REFINE_GLSL + PUT_GLSL,
    },
  }],
};
