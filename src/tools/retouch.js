// Retouch: Blur, Dodge and Burn, soft round brushes that change the colors that show on the picked layer instead of
// laying a color of their own (lib/Retouch.js). In the pixel view each grid pixel's color, written back as paint; in the
// ANSI view each cell's colors, written back with its character, which stays (a cell that shows no character keeps
// showing none). A stroke works out each spot's new color from what showed there before it, and goes as far toward it as
// its Strength at the brush's falloff, so going over a spot again in the same stroke adds nothing; another stroke does.
import { brushPixels } from '@/lib/Brushes';
import { selectionClip } from '@/lib/selectionClip';
import { charRowsOf, mix, showsChar } from '@/lib/Cells.js';
import { hex2rgb, rgb2hex } from '@/lib/ColorUtils.js';
import { averaged, burned, dodged } from '@/lib/Retouch.js';
import { t } from '@/i18n/index.js';

const AROUND = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => [dx, dy]));
const inGrid = (x, y, cols, rows) => x >= 0 && y >= 0 && x < cols && y < rows;

// A tool's change(color, range, at): the color a full pass makes of a spot's color; at(dx, dy) is the color dx, dy from
// the spot (null off the grid).

// This stroke's spots, by key: { from (the color or a cell's colors before it), to, alpha (the most the brush gave) },
// and the colors it read (Blur's neighbors too).
let stroke = null;

function newStroke() {
  stroke = { spots: new Map(), read: new Map() };
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

// Each cell: its character and colors as it shows up to the layer in use, the colors changed, as an edit cell. A cell
// that shows no character counts its background as its foreground too, so it still shows none.
function retouchCells(project, pixels, change, strength) {
  const { cols } = project, rows = charRowsOf(project.rows);
  const lookAt = (col, row) => {
    const key = `${col},${row}`;
    if (!stroke.read.has(key)) {
      const cell = project.cells[row * cols + col], look = project.underlyingAt(col, row, { evenHidden: true });
      const plain = !cell || !showsChar(cell), bg = hex2rgb(look.bg);
      stroke.read.set(key, { char: look.char, bg, fg: plain ? bg : hex2rgb(look.fg), plain });
    }
    return stroke.read.get(key);
  };
  const reach = new Map();
  for (const { x, y, alpha } of pixels) {
    const key = `${x},${Math.floor(y / 2)}`;
    reach.set(key, Math.max(reach.get(key) ?? 0, alpha));
  }
  const out = [];
  for (const [key, alpha] of reach) {
    const [col, row] = key.split(',').map(Number), cell = project.cells[row * cols + col];
    if (!cell || cell.wide === 'trail') continue; // a trailing half: its lead cell carries it
    let spot = stroke.spots.get(key);
    if (!spot) {
      const from = lookAt(col, row);
      const at = (part) => (dx, dy) => (inGrid(col + dx, row + dy, cols, rows) ? lookAt(col + dx, row + dy)[part] : null);
      const bg = change(from.bg, at('bg')), fg = from.plain ? bg : change(from.fg, at('fg'));
      stroke.spots.set(key, spot = { from, to: { fg, bg }, alpha: 0 });
    }
    spot.alpha = Math.max(spot.alpha, alpha);
    const k = strength * spot.alpha, { from, to } = spot, fg = rgb2hex(mix(from.fg, to.fg, k)), bg = rgb2hex(mix(from.bg, to.bg, k));
    if (fg === rgb2hex(from.fg) && bg === rgb2hex(from.bg)) continue; // nothing to change: the cell stays as it is (a file's 16 stays 16)
    out.push({ col, row, attrs: { char: from.char, fg, bg } });
  }
  project.writeEditCells(out, { clearPaint: true });
}


const RANGE = {
  key: 'retouchRange', get label() { return t('tools.retouch.range'); }, type: 'segmented',
  choices: ['shadows', 'midtones', 'highlights'].map((value) => ({ value, get label() { return t(`tools.retouch.${value}`); } })),
};

function retouchTool({ id, keys, icon, change, range = false }) {
  const tool = {
    id,
    get title() { return t(`tools.${id}.title`); },
    keys,
    icon,
    views: ['input', 'output'],
    kind: 'paint',
    shiftLines: true, // Shift-click: a straight line from where the last stroke ended
    preview: { shape: 'circle', size: (workspace) => workspace.retouchSize },
    options: [
      { key: 'retouchSize', get label() { return t('tools.brush.size'); }, get title() { return t('tools.brush.sizeTitle'); }, min: 1, max: 20, step: 0.1, decimals: 1 },
      { key: 'retouchStrength', get label() { return t('tools.retouch.strength'); }, get title() { return t('tools.retouch.strengthTitle'); }, min: 1, max: 100, unit: '%' },
      { key: 'retouchHardness', get label() { return t('tools.brush.hardness'); }, get title() { return t('tools.brush.hardnessTitle'); }, min: 0, max: 100, unit: '%' },
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
      let pixels = brushPixels(from, to, { size: workspace.retouchSize, flow: 1, hardness: workspace.retouchHardness / 100 }, cols, rows);
      if (clip) pixels = pixels.filter(({ x, y }) => clip.pixel(x, y));
      const strength = workspace.retouchStrength / 100;
      const own = (color, at) => change(color, workspace.retouchRange, at);
      if (view === 'output') retouchCells(project, pixels, own, strength);
      else retouchPixels(project, pixels, own, strength);
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
});

export const dodge = retouchTool({
  id: 'dodge',
  keys: ['O'],
  range: true,
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-32 -64 640 640"><path d="M288-32c8.4 0 16.3 4.4 20.6 11.7L364.1 72.3 468.9 46c8.2-2 16.9 .4 22.8 6.3S500 67 498 75.1l-26.3 104.7 92.7 55.5c7.2 4.3 11.7 12.2 11.7 20.6s-4.4 16.3-11.7 20.6L471.7 332.1 498 436.8c2 8.2-.4 16.9-6.3 22.8S477 468 468.9 466l-104.7-26.3-55.5 92.7c-4.3 7.2-12.2 11.7-20.6 11.7s-16.3-4.4-20.6-11.7L211.9 439.7 107.2 466c-8.2 2-16.8-.4-22.8-6.3S76 445 78 436.8l26.2-104.7-92.6-55.5C4.4 272.2 0 264.4 0 256s4.4-16.3 11.7-20.6L104.3 179.9 78 75.1c-2-8.2 .3-16.8 6.3-22.8S99 44 107.2 46l104.7 26.2 55.5-92.6 1.8-2.6c4.5-5.7 11.4-9.1 18.8-9.1zm0 144a144 144 0 1 0 0 288 144 144 0 1 0 0-288zm0 240a96 96 0 1 1 0-192 96 96 0 1 1 0 192z"/></svg>',
  change: (color, range) => dodged(color, range),
});

export const burn = retouchTool({
  id: 'burn',
  keys: ['Shift+O'],
  range: true,
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-64 -64 640 640"><path d="M256 0C114.6 0 0 114.6 0 256S114.6 512 256 512c68.8 0 131.3-27.2 177.3-71.4 7.3-7 9.4-17.9 5.3-27.1s-13.7-14.9-23.8-14.1c-4.9 .4-9.8 .6-14.8 .6-101.6 0-184-82.4-184-184 0-72.1 41.5-134.6 102.1-164.8 9.1-4.5 14.3-14.3 13.1-24.4S322.6 8.5 312.7 6.3C294.4 2.2 275.4 0 256 0z"/></svg>',
  change: (color, range) => burned(color, range),
});
