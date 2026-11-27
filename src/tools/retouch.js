// Retouch: Blur, Dodge and Burn, soft round brushes that change colors instead of laying a color of their own
// (lib/Retouch.js). A character stays, whatever reaches it: they change colors, never characters. On the base, the
// colors that show, each grid pixel's, written back as its pixels, in either view, so the converter picks the
// characters afresh; but in the ANSI view a pinned character stays, its cell's colors changed and written back with it
// (a cell that shows no character keeps showing none). On a drawing layer, only what the layer itself holds: its paint,
// pixel by pixel in either view (as the Brush paints), where a clear pixel counts as clear (Blur fades an edge out into
// the clear beside it), and its own cells with colors of their own (typed, opened from a file), whose colors change a
// whole cell at a time, their characters kept (recolorOwnCells); Blur reads such a cell as it shows, so its colors spread
// into the paint around it. A cell Merge down froze (docs/model.md R4) is paint: its paint lies under it, and the mark
// goes where the stroke writes a pixel of it (editLayer.js unfreeze). Where the layer has nothing, nothing changes,
// whatever shows under it. A cell with only a character (the Brush's ▄) holds no colors: its paint changes.
// A stroke works out each spot's new color from what was there before it, and goes as far toward it as its Strength at
// the brush's falloff, so going over a spot again in the same stroke adds nothing; another stroke does.
import { brushPixels } from '@/lib/Brushes';
import { selectionClip } from '@/lib/selectionClip';
import { charRowsOf, mix, showsChar } from '@/lib/Cells.js';
import { hex2rgb, rgb2hex } from '@/lib/ColorUtils.js';
import { averaged, averagedPaint, burned, dodged, mixPaint } from '@/lib/Retouch.js';
import { onBottom, ownPixelAt } from '@/store/project/shared.js';
import { isFrozen } from '@/document/editCells.js';
import { t } from '@/i18n/index.js';

const AROUND = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => [dx, dy]));
const inGrid = (x, y, cols, rows) => x >= 0 && y >= 0 && x < cols && y < rows;

// A tool's change(color, range, at): the color a full pass makes of a spot's color; at(dx, dy) is the color dx, dy from
// the spot (null off the grid, or on a drawing layer where it has none). own(from, around, range): what a full pass makes
// of a drawing layer's paint pixel ({ r, g, b, a } or null: clear), around it and the pixels around it on the grid.

// This stroke's spots, by key: { from (the color or a cell's colors before it), to, alpha (the most the brush gave) },
// and the colors it read (Blur's neighbors too).
let stroke = null;

function newStroke() {
  stroke = { spots: new Map(), read: new Map() };
}

// The drawing layer's own cell at col, row where it's a character of someone's own with a color of its own (recolored,
// its character kept), as the stroke first read it; null where it has none, or a frozen cell (paint).
function ownCellAt(project, col, row) {
  const key = `e${col},${row}`;
  if (!stroke.read.has(key)) {
    const entry = project.editCellAt(col, row);
    stroke.read.set(key, (entry?.fg || entry?.bg) && !isFrozen(entry) ? entry : null);
  }
  return stroke.read.get(key);
}

// Each grid pixel: its color up to the layer in use (the base's on the base), changed, as opaque paint.
function retouchPixels(project, pixels, change, strength) {
  const colorAt = (x, y) => {
    const key = `${x},${y}`;
    if (!stroke.read.has(key)) stroke.read.set(key, hex2rgb(project.rawColorAt(x, y, { upTo: project.editId })));
    return stroke.read.get(key);
  };
  const out = new Map();
  for (const { x, y, alpha } of pixels) {
    const key = `${x},${y}`;
    let spot = stroke.spots.get(key);
    if (!spot) {
      const from = colorAt(x, y);
      const at = (dx, dy) => (inGrid(x + dx, y + dy, project.cols, project.rows) ? colorAt(x + dx, y + dy) : null);
      stroke.spots.set(key, spot = { from, to: change(from, at), alpha: 0 });
    }
    spot.alpha = Math.max(spot.alpha, alpha);
    out.set(key, { x, y, ...mix(spot.from, spot.to, strength * spot.alpha), alpha: 1 });
  }
  project.paintEditPixels([...out.values()], 100, false);
}

// Each cell (on the base, a pinned one): its character and colors as it shows up to the layer in use, the colors
// changed, as an edit cell. A cell that shows no character counts its background as its foreground too, so it still
// shows none.
function retouchCells(project, pixels, change, strength) {
  const { cols } = project, rows = charRowsOf(project.rows);
  const lookAt = (col, row) => {
    const key = `c${col},${row}`; // apart from the pixels' keys: a stroke on the base can take both routes
    if (!stroke.read.has(key)) {
      const cell = project.cells[row * cols + col], look = project.underlyingAt(col, row, { evenHidden: true });
      const plain = !cell || !showsChar(cell), bg = hex2rgb(look.bg);
      stroke.read.set(key, { char: look.char, bg, fg: plain ? bg : hex2rgb(look.fg), plain });
    }
    return stroke.read.get(key);
  };
  const reach = reachOf(pixels), out = [];
  for (const [key, alpha] of reach) {
    const [col, row] = key.split(',').map(Number), cell = project.cells[row * cols + col];
    if (!cell || cell.wide === 'trail') continue; // a trailing half: its lead cell carries it
    let spot = stroke.spots.get(`c${key}`);
    if (!spot) {
      const from = lookAt(col, row);
      const at = (part) => (dx, dy) => (inGrid(col + dx, row + dy, cols, rows) ? lookAt(col + dx, row + dy)[part] : null);
      const bg = change(from.bg, at('bg')), fg = from.plain ? bg : change(from.fg, at('fg'));
      stroke.spots.set(`c${key}`, spot = { from, to: { fg, bg }, alpha: 0 });
    }
    spot.alpha = Math.max(spot.alpha, alpha);
    const k = strength * spot.alpha, { from, to } = spot, fg = rgb2hex(mix(from.fg, to.fg, k)), bg = rgb2hex(mix(from.bg, to.bg, k));
    if (fg === rgb2hex(from.fg) && bg === rgb2hex(from.bg)) continue; // nothing to change: the cell stays as it is (a file's 16 stays 16)
    out.push({ col, row, attrs: { char: from.char, fg, bg } });
  }
  project.writeEditCells(out, { clearPaint: true });
}

// A drawing layer's own paint at grid pixel x, y (ownPixelAt), as the stroke first read it.
function ownPaintAt(project, x, y) {
  const key = `p${x},${y}`;
  if (!stroke.read.has(key)) { // both pixels of its cell together: recolorOwnCells may change the cell later in the stroke
    for (const py of [y & ~1, y | 1]) if (py < project.rows) stroke.read.set(`p${x},${py}`, ownPixelAt(project, x, py));
  }
  return stroke.read.get(key);
}
const samePaint = (a, b) => (!a || !b ? !a && !b : a.r === b.r && a.g === b.g && a.b === b.b && Math.round(a.a * 255) === Math.round(b.a * 255));

// Each grid pixel of a drawing layer's own paint, changed by own. A pixel own leaves as it was (clear where it was clear:
// Dodge and Burn always, Blur with no paint in reach) isn't written, nor one in a cell of the layer's own with colors
// (recolorOwnCells changes those), so nothing is laid over its character. A frozen cell's paint is paint: a pixel of it
// written drops the mark (putEditPixels).
function retouchOwnPaint(project, pixels, own, strength) {
  const { cols, rows } = project, out = new Map();
  for (const { x, y, alpha } of pixels) {
    const key = `${x},${y}`;
    if (ownCellAt(project, x, y >> 1)) continue;
    let spot = stroke.spots.get(key);
    if (!spot) {
      const from = ownPaintAt(project, x, y);
      const around = AROUND.filter(([dx, dy]) => inGrid(x + dx, y + dy, cols, rows)).map(([dx, dy]) => ownPaintAt(project, x + dx, y + dy));
      stroke.spots.set(key, spot = { from, to: own(from, around), alpha: 0 });
    }
    if (!spot.from && !spot.to) continue;
    spot.alpha = Math.max(spot.alpha, alpha);
    const p = mixPaint(spot.from, spot.to, strength * spot.alpha);
    if (samePaint(p, spot.from)) continue;
    out.set(key, p ? { x, y, ...p } : { x, y, r: 0, g: 0, b: 0, a: 0 });
  }
  project.putEditPixels([...out.values()]);
}

// A drawing layer's own cells with colors of their own: the colors each has changed, a whole cell at a time, its
// character kept. Blur evens them with the layer's other cells of its own, foreground with foreground and background
// with background (a color set to None stays None); a cell showing one color all over (its foreground its background)
// stays so.
function recolorOwnCells(project, pixels, change, strength) {
  const { cols } = project, rows = charRowsOf(project.rows), out = [];
  const colorAt = (col, row, part) => {
    const hex = inGrid(col, row, cols, rows) ? ownCellAt(project, col, row)?.[part] : null;
    return hex ? hex2rgb(hex) : null;
  };
  for (const [key, alpha] of reachOf(pixels)) {
    const [col, row] = key.split(',').map(Number), entry = ownCellAt(project, col, row);
    if (!entry || project.cells[row * cols + col]?.wide === 'trail') continue; // a trailing half: its lead cell carries it
    let spot = stroke.spots.get(`e${key}`); // apart from the paint's keys
    if (!spot) {
      const at = (part) => (dx, dy) => colorAt(col + dx, row + dy, part), from = { fg: colorAt(col, row, 'fg'), bg: colorAt(col, row, 'bg') };
      const plain = !!entry.fg && !!entry.bg && entry.fg.toLowerCase() === entry.bg.toLowerCase();
      const bg = from.bg && change(from.bg, at('bg')), fg = plain ? bg : from.fg && change(from.fg, at('fg'));
      stroke.spots.set(`e${key}`, spot = { from, to: { fg, bg }, alpha: 0 });
    }
    spot.alpha = Math.max(spot.alpha, alpha);
    const attrs = {};
    for (const part of ['fg', 'bg']) {
      if (!spot.from[part]) continue; // None stays None
      const hex = rgb2hex(mix(spot.from[part], spot.to[part], strength * spot.alpha));
      if (hex !== rgb2hex(spot.from[part])) attrs[part] = hex; // unchanged: kept as it is (a file's 16 stays 16)
    }
    if (Object.keys(attrs).length) out.push({ col, row, attrs });
  }
  project.writeEditCells(out);
}

// The cells grid pixels reach, by key, each with the most the brush gives it.
function reachOf(pixels) {
  const reach = new Map();
  for (const { x, y, alpha } of pixels) {
    const key = `${x},${Math.floor(y / 2)}`;
    reach.set(key, Math.max(reach.get(key) ?? 0, alpha));
  }
  return reach;
}


const RANGE = {
  key: 'retouchRange', kind: true, get label() { return t('tools.retouch.range'); }, type: 'segmented',
  choices: ['shadows', 'midtones', 'highlights'].map((value) => ({ value, get label() { return t(`tools.retouch.${value}`); } })),
};

function retouchTool({ id, keys, icon, change, own, range = false }) {
  const tool = {
    id,
    get title() { return t(`tools.${id}.title`); },
    keys,
    icon,
    views: ['input', 'output'],
    kind: 'paint',
    mirrors: true,
    shiftLines: true, // Shift-click: a straight line from where the last stroke ended
    preview: { shape: 'circle', size: (workspace) => workspace.retouchSize },
    options: [
      { key: 'retouchSize', size: true, get label() { return t('tools.brush.size'); }, get title() { return t('tools.brush.sizeTitle'); }, min: 1, max: 20, step: 0.1, decimals: 1 },
      { key: 'retouchStrength', amount: true, get label() { return t('tools.retouch.strength'); }, get title() { return t('tools.retouch.strengthTitle'); }, min: 1, max: 100, unit: '%' },
      { key: 'retouchHardness', hardness: true, get label() { return t('tools.brush.hardness'); }, get title() { return t('tools.brush.hardnessTitle'); }, min: 0, max: 100, unit: '%' },
      ...(range ? [RANGE] : []),
    ],
    begin(ctx, pos, event) {
      newStroke();
      tool.move(ctx, (event?.shiftKey && ctx.workspace.strokeEnd) || pos, pos);
      return true;
    },
    move({ project, workspace, view }, from, to) {
      if (!stroke) newStroke();
      const clip = selectionClip(workspace), { cols, rows } = project;
      let pixels = brushPixels(from, to, { size: workspace.retouchSize, flow: 1, hardness: workspace.retouchHardness / 100 }, cols, rows, project.pixelAspect);
      if (clip) pixels = pixels.filter(({ x, y }) => clip.pixel(x, y));
      const strength = workspace.retouchStrength / 100;
      const changed = (color, at) => change(color, workspace.retouchRange, at), owned = (from, around) => own(from, around, workspace.retouchRange);
      if (!onBottom(project)) { // a drawing layer: only what it holds, in either view
        retouchOwnPaint(project, pixels, owned, strength); // first, reading its cells before their colors change
        recolorOwnCells(project, pixels, changed, strength);
      } else if (view === 'output' && project.renderStyle !== 'ascii') { // the ANSI view: a pinned character stays, recolored
        const { pins } = project.baseRecords, pinned = ({ x, y }) => pins.has(`${x},${y >> 1}`);
        retouchPixels(project, pixels.filter((p) => !pinned(p)), changed, strength); // the converter's cells: as in the pixel view, read before the pinned ones change
        retouchCells(project, pixels.filter(pinned), changed, strength);
      } else retouchPixels(project, pixels, changed, strength); // Monochrome ASCII shows a cell's brightness as its character alone: its pixels change, and the characters follow (the base's pins go: R13)
      workspace.strokeEnd = to;
    },
    end({ project }) {
      stroke = null;
      project.commitEdit();
    },
  };
  return tool;
}

export const blur = retouchTool({
  id: 'blur',
  keys: ['R'],
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-64 -48 512 608"><path d="M192 512C86 512 0 426 0 320 0 228.8 130.2 45.9 166.6-3.5 172.5-11.5 181.8-16 191.8-16l.4 0c10 0 19.3 4.5 25.2 12.5 36.4 49.4 166.6 232.3 166.6 323.5 0 106-86 192-192 192zM112 312c0-13.3-10.7-24-24-24s-24 10.7-24 24c0 75.1 60.9 136 136 136 13.3 0 24-10.7 24-24s-10.7-24-24-24c-48.6 0-88-39.4-88-88z"/></svg>',
  change: (color, range, at) => averaged(AROUND.map(([dx, dy]) => at(dx, dy)).filter(Boolean)), // the spot and those around it, evenly
  own: (from, around) => averagedPaint(around), // the same, a clear pixel counting as clear
});

export const dodge = retouchTool({
  id: 'dodge',
  keys: ['O'],
  range: true,
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-32 -64 640 640"><path d="M288-32c8.4 0 16.3 4.4 20.6 11.7L364.1 72.3 468.9 46c8.2-2 16.9 .4 22.8 6.3S500 67 498 75.1l-26.3 104.7 92.7 55.5c7.2 4.3 11.7 12.2 11.7 20.6s-4.4 16.3-11.7 20.6L471.7 332.1 498 436.8c2 8.2-.4 16.9-6.3 22.8S477 468 468.9 466l-104.7-26.3-55.5 92.7c-4.3 7.2-12.2 11.7-20.6 11.7s-16.3-4.4-20.6-11.7L211.9 439.7 107.2 466c-8.2 2-16.8-.4-22.8-6.3S76 445 78 436.8l26.2-104.7-92.6-55.5C4.4 272.2 0 264.4 0 256s4.4-16.3 11.7-20.6L104.3 179.9 78 75.1c-2-8.2 .3-16.8 6.3-22.8S99 44 107.2 46l104.7 26.2 55.5-92.6 1.8-2.6c4.5-5.7 11.4-9.1 18.8-9.1zm0 144a144 144 0 1 0 0 288 144 144 0 1 0 0-288zm0 240a96 96 0 1 1 0-192 96 96 0 1 1 0 192z"/></svg>',
  change: (color, range) => dodged(color, range),
  own: (from, around, range) => from && { ...dodged(from, range), a: from.a },
});

export const burn = retouchTool({
  id: 'burn',
  keys: ['Shift+O'],
  range: true,
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-64 -64 640 640"><path d="M256 0C114.6 0 0 114.6 0 256S114.6 512 256 512c68.8 0 131.3-27.2 177.3-71.4 7.3-7 9.4-17.9 5.3-27.1s-13.7-14.9-23.8-14.1c-4.9 .4-9.8 .6-14.8 .6-101.6 0-184-82.4-184-184 0-72.1 41.5-134.6 102.1-164.8 9.1-4.5 14.3-14.3 13.1-24.4S322.6 8.5 312.7 6.3C294.4 2.2 275.4 0 256 0z"/></svg>',
  change: (color, range) => burned(color, range),
  own: (from, around, range) => from && { ...burned(from, range), a: from.a },
});
