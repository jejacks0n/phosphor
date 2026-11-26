// The layers / merge / blend review matrix: foundations (the drawing a setup starts from) and setups (what's drawn
// and done on it), counted, with a pairwise cut.
//   node tests/matrix/combos.mjs     counts, and pairwise.csv (runs covering every pair of values across both)
// Edit the axes and the invalid() rules to change what's counted. Views (ANSI, PIXEL) multiply the images, not the runs.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FOUNDATION = {
  styleMode: ['ANSI Random', 'ANSI Best match', 'ANSI By shape', 'Color ASCII By intensity', 'Color ASCII By shape',
    'Monochrome ASCII By brightness', 'Monochrome ASCII By shape'],
  palette: ['Full', 'VGA', 'CGA', 'Limited'],
  adjust: ['none', 'one'],
  from: ['image', 'blank canvas', 'textmode: Edit artwork', 'textmode: Draw on top', 'textmode: Open as an image'],
};

export const SETUP = {
  drawn: ['soft paint', 'hard paint', 'Colors only', 'text with BG', 'text no BG', 'solid chars (space █ ▀ ▄)',
    'Half-column blocks', 'wide char 漢', 'art layer chars', 'vector shapes'],
  into: ['cells: empty', 'cells: paint', 'cells: text', 'base'],
  merge: ['into layer', 'Keep crisp cells', 'Blend into source image'],
  scope: ['whole layer', 'selection'],
  layerChars: ['same as base', 'its own'],
  baseHidden: ['shown', 'hidden'],
  after: ['nothing', 'image filter', 'adjustment', 'dither', 'color slider', 'paint same layer', 'paint layer above',
    'eraser', 'retouch/dodge/burn', 'Colors only', 'hide base', 'undo/redo', 'save + reopen', 'export', 'bake/flatten',
    'grow grid'],
};

// Setups the app can't make (docs/layers.md, Merge Down and Hiding and Showing Layers). Foundations rule nothing out.
function invalid(c) {
  const onBase = c.into === 'base';
  if (onBase !== (c.merge !== 'into layer')) return 'into a layer only onto a cells layer; Keep/Blend only onto the base';
  if (c.baseHidden === 'hidden' && onBase) return 'Merge down is off while the layer under is hidden';
  if (c.drawn === 'vector shapes' && c.scope === 'selection') return 'a vector layer merges only whole';
  return null;
}

// Every valid combination of `axes`, packed one byte per axis, with the pairs of values that occur and why the rest don't.
function enumerate(axes) {
  const names = Object.keys(axes), sizes = names.map((n) => axes[n].length), k = names.length;
  const raw = sizes.reduce((a, b) => a * b, 1);
  const offsets = names.map(() => []);
  let pairCount = 0;
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) { offsets[i][j] = pairCount; pairCount += sizes[i] * sizes[j]; }
  const pairOf = (i, vi, j, vj) => offsets[i][j] + vi * sizes[j] + vj;
  const possible = new Uint8Array(pairCount), why = new Map(), rows = new Uint8Array(raw * k), idx = new Array(k), c = {};
  let count = 0;
  for (let n = 0; n < raw; n++) {
    let r = n;
    for (let i = k - 1; i >= 0; i--) { idx[i] = r % sizes[i]; r = Math.floor(r / sizes[i]); c[names[i]] = axes[names[i]][idx[i]]; }
    const no = invalid(c);
    if (no) { why.set(no, (why.get(no) ?? 0) + 1); continue; }
    rows.set(idx, count * k);
    count++;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) possible[pairOf(i, idx[i], j, idx[j])] = 1;
  }
  return { names, sizes, k, raw, count, rows, why, possible, pairCount, pairOf, offsets };
}

// Greedy pairwise: each run is, from a sample of valid rows holding the next uncovered pair, the one covering the most
// pairs not yet covered. ponytail: sampled greedy, not optimal; a covering-array tool shaves ~10-20% more.
function pairwise(e) {
  const { names, sizes, k, count, rows, possible, pairCount, pairOf, offsets } = e;
  const covered = new Uint8Array(pairCount), runs = [];
  let left = possible.reduce((a, b) => a + b, 0), seed = 1, first = 0;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const row = (r) => rows.subarray(r * k, r * k + k);
  const gain = (x) => {
    let g = 0;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) { const p = pairOf(i, x[i], j, x[j]); if (possible[p] && !covered[p]) g++; }
    return g;
  };
  while (left > 0) {
    while (!possible[first] || covered[first]) first++;
    let ti = 0, tj = 0;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (first >= offsets[i][j] && first < offsets[i][j] + sizes[i] * sizes[j]) { ti = i; tj = j; }
    const local = first - offsets[ti][tj], tvi = Math.floor(local / sizes[tj]), tvj = local % sizes[tj];
    let best = null, bestGain = -1, found = 0;
    const start = Math.floor(rand() * count);
    for (let s = 0; s < count && found < 300; s++) {
      const x = row((start + s) % count);
      if (x[ti] !== tvi || x[tj] !== tvj) continue;
      found++;
      const g = gain(x);
      if (g > bestGain) { bestGain = g; best = x; }
    }
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) { const p = pairOf(i, best[i], j, best[j]); if (possible[p] && !covered[p]) { covered[p] = 1; left--; } }
    runs.push(Array.from(best));
  }
  return runs.map((x) => Object.fromEntries(names.map((n, i) => [n, x[i]])));
}

const fmt = (n) => n.toLocaleString('en-US');
const foundations = Object.values(FOUNDATION).reduce((a, v) => a * v.length, 1);
const setups = enumerate(SETUP);
const setupPairs = pairwise(setups);
const all = enumerate({ ...FOUNDATION, ...SETUP });
const allPairs = pairwise(all);

const axes = { ...FOUNDATION, ...SETUP };
const csvRow = (cells) => cells.map((s) => (/[",]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s)).join(',');
const names = Object.keys(axes);
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'pairwise.csv'),
  [csvRow(['run', ...names]), ...allPairs.map((r, n) => csvRow([String(n + 1), ...names.map((a) => axes[a][r[a]])]))].join('\n') + '\n');

const show = (title, group) => {
  console.log(title);
  for (const [n, v] of Object.entries(group)) console.log(`  ${n.padEnd(11)} ${String(v.length).padStart(2)}  ${v.join(' · ')}`);
};
show('Foundation:', FOUNDATION);
show('Setup:', SETUP);
console.log(`\nFoundations:                       ${fmt(foundations)}`);
console.log(`Setups, every combination:         ${fmt(setups.raw)}`);
for (const [w, n] of [...setups.why].sort((a, b) => b[1] - a[1])) console.log(`  ruled out ${fmt(n).padStart(6)}  ${w}`);
console.log(`Setups, valid:                     ${fmt(setups.count)}`);
console.log(`Every setup on every foundation:   ${fmt(setups.count * foundations)}`);
console.log(`Pairwise setups:                   ${fmt(setupPairs.length)}  (× ${foundations} foundations = ${fmt(setupPairs.length * foundations)})`);
console.log(`Pairwise across both:              ${fmt(allPairs.length)}  → pairwise.csv`);
