import { brushPixels } from '@/lib/Brushes';
import { selectionClip } from '@/lib/selectionClip';
import { mix } from '@/lib/Cells.js';
import { hex2rgb } from '@/lib/ColorUtils.js';
import { mixPaint } from '@/lib/Retouch.js';
import { onBottom, ownPaintAt } from '@/store/project/shared.js';
import { shownHalves } from '@/store/project/reading.js';
import { scriptOptions } from '@/plugins/solvers.js';
import { t } from '@/i18n/index.js';
import brushTool from '@/tools/brush';
import { firstUnderMark, sayFailed, toolOption, valuesOf } from '@/tools/pluginTool.js';

// A plugin brush as a tool (tools/index.js's pluginTools makes one for each brush of a plugin that's on). Its looks, keys,
// options and the modes it works in are here; its painting is the plugin's own work, behind its begin, move and end, each
// handed the stroke's paint (below). Its options, the hang mark on the first call of each of those and its failure's
// words are a plugin tool's (tools/pluginTool.js).
const point = ({ x, y }) => ({ x: Number(x), y: Number(y) });
const MAX_SIZE = brushTool.options.find((option) => option.size).max; // the Brush's largest size
const channel = (v) => Math.min(255, Math.max(0, Math.round(v)));

// A stroke's paint, the one object its begin, moves and end are handed (docs/plugins.md), with the writes of the call
// going on. What it reads is as the stroke began, read once a pixel: shown, what shows up to the picked layer, paint and
// cells both (shownHalves), and own, the picked layer's own paint (ownPaintAt, which is what a write lands on: a character of the
// layer's own with ink isn't paint; on the base, shown at a: 1). A write is a put (a color at an alpha over what the layer
// had) or a set (the paint made exactly that, clear at 0), kept until the call returns, the last to a pixel winning. Its
// color is { r, g, b } or [r, g, b], each channel held to 0..255 as a solver's are; a write whose channel isn't a finite
// number, or that isn't a whole grid pixel, or is outside the selection, is dropped.
function newStroke({ project, workspace }, def, values) {
  const { cols, rows } = project, base = onBottom(project), upTo = project.editId, clip = selectionClip(workspace);
  const inGrid = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
  const cached = (read) => {
    const seen = new Map();
    return (x, y) => {
      const key = `${x},${y}`;
      if (!seen.has(key)) seen.set(key, read(x, y));
      return seen.get(key);
    };
  };
  // On a layer, what shows: paint and cells both (shownHalves). On the base, its own pixels (a pin's two, R11).
  const shown = cached(base ? (x, y) => hex2rgb(project.rawColorAt(x, y, { upTo })) : (x, y) => shownHalves(project, x, y >> 1)[y & 1]);
  const own = base ? cached((x, y) => ({ ...shown(x, y), a: 1 })) : cached((x, y) => ownPaintAt(project, x, y));
  // A read for the plugin: a copy (its changes stay its own), null off the grid.
  const reader = (read) => (x, y) => {
    x = Math.floor(x);
    y = Math.floor(y);
    const color = inGrid(x, y) ? read(x, y) : null;
    return color && { ...color };
  };
  const puts = new Map();
  const write = (x, y, color, alpha, exact) => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !inGrid(x, y) || (clip && !clip.pixel(x, y)) || !Number.isFinite(alpha)) return;
    const clears = exact && alpha <= 0; // a set to nothing needs no color
    const [r, g, b] = Array.isArray(color) ? color : [color?.r, color?.g, color?.b];
    if (!clears && ![r, g, b].every(Number.isFinite)) return;
    puts.set(`${x},${y}`, { x, y, exact, color: clears ? null : { r: channel(r), g: channel(g), b: channel(b) }, alpha: Math.min(1, Math.max(0, alpha)) });
  };
  const paint = Object.freeze({
    cols,
    rows,
    options: scriptOptions(def, values),
    fg: hex2rgb(workspace.editFgColor),
    bg: hex2rgb(workspace.editBgColor),
    shown: reader(shown),
    own: reader(own),
    put: (x, y, color, alpha) => write(x, y, color, alpha, false),
    set: (x, y, color, alpha) => write(x, y, color, alpha, true),
    // The Brush's dab: a size that isn't a number is none, and one past the Brush's own largest is that.
    dab(from, to, size, hardness) {
      if (!Number.isFinite(Number(size))) return [];
      const soft = Number.isFinite(Number(hardness)) ? Math.min(1, Math.max(0, Number(hardness))) : 1;
      return brushPixels(point(from), point(to), { size: Math.min(MAX_SIZE, Number(size)), flow: 1, hardness: soft }, cols, rows).map(({ x, y, alpha }) => ({ x, y, alpha }));
    },
  });
  return { paint, puts, base, shown, own, rows, written: new Set(), dead: false };
}

const CLEAR = { r: 0, g: 0, b: 0, a: 0 };
const samePaint = (a, b) => (a?.a ?? 0) === (b?.a ?? 0) && (!a?.a || (a.r === b.r && a.g === b.g && a.b === b.b));

// The writes of a call laid. Each is worked out as the paint it leaves, over what the picked layer had there when the
// stroke began (a put: its color at its alpha over that; a set: exactly its own), so a later write replaces an earlier
// one. One that leaves a pixel the stroke hasn't touched as it was is dropped, with no cell changed for it. Then Colors
// only's cells for the pixels left with paint (colorsOnlyCells: the paint shows in ANSI as the Brush's Colors only does,
// docs/model.md R5; a character of the layer's own with ink stays, the paint over it tinting it), and the paint
// (putEditPixels, clear where nothing's left, as the Eraser leaves a pixel). On the base every pixel is opaque: either
// kind of write is its color at its alpha over what shows there (paintEditPixels). Both pixels of each cell are read
// first, as they were: Colors only can turn a cell of the layer's own into paint.
function lay(project, stroke) {
  const pixels = [...stroke.puts.values()];
  stroke.puts.clear();
  if (!pixels.length) return;
  for (const { x, y } of pixels) {
    for (const py of [y & ~1, y | 1]) {
      if (py >= stroke.rows) continue;
      stroke.own(x, py);
      stroke.shown(x, py);
    }
  }
  if (stroke.base) {
    const laid = pixels.filter(({ alpha }) => alpha > 0);
    project.colorsOnlyCells(laid);
    return project.paintEditPixels(laid.map(({ x, y, color, alpha }) => ({ x, y, ...mix(stroke.shown(x, y), color, alpha), alpha: 1 })), 100, false);
  }
  const left = ({ x, y, exact, color, alpha }) => (exact ? (alpha > 0 ? { ...color, a: alpha } : CLEAR) : mixPaint(stroke.own(x, y), { ...color, a: 1 }, alpha) ?? CLEAR);
  const writes = pixels.map((pixel) => ({ x: pixel.x, y: pixel.y, ...left(pixel) }))
    .filter((pixel) => stroke.written.has(`${pixel.x},${pixel.y}`) || !samePaint(pixel, stroke.own(pixel.x, pixel.y)));
  if (!writes.length) return;
  for (const { x, y } of writes) stroke.written.add(`${x},${y}`);
  project.colorsOnlyCells(writes.filter(({ a }) => a > 0));
  project.putEditPixels(writes);
}

// The stroke going on (newStroke's), one at a time as the built-in tools' are; dead once the plugin threw in it. It's kept
// here, not in a tool, with the tool that began it (owner): the tools are made again when a plugin is reloaded, and a move
// or the release reaching a new one is the old one's, so the stroke ends on the script it began on.
let stroke = null;

export function makeBrushTool({ ref, pluginId, pluginName, hash, def, key }) {

  // A stroke that failed: what it laid is taken back with no undo step (cancelEdit), and the toast and the plugin's row
  // say why. Nothing more of it runs.
  const fail = (project, error) => {
    stroke.dead = true;
    stroke.puts.clear();
    project.cancelEdit();
    sayFailed('plugins.brushFailed', def.name, pluginId, error);
  };
  // One of the plugin's calls on the stroke's paint, its puts laid after: false when it threw (or the stroke is dead).
  const call = (project, fn) => {
    if (!stroke || stroke.dead) return false;
    try {
      fn(stroke.paint);
    } catch (error) {
      fail(project, error);
      return false;
    }
    lay(project, stroke);
    return true;
  };
  // Each hook's first call of a visit runs under the hang mark, under a key of its own.
  const marked = (hook, fn) => firstUnderMark(`brush-${hook}`, ref, hash, pluginId, fn);
  const move = (paint, from, to) => marked('move', () => def.move(point(from), point(to), paint));

  const tool = {
    id: ref,
    get title() { return t('tools.pluginTitle', { name: def.name, plugin: pluginName }); },
    icon: def.icon,
    keys: key ? [key] : [],
    views: ['input', 'output'],
    kind: 'paint',
    mirrors: true,
    section: 'plugin',
    altPicks: true,
    shiftLines: true,
    preview: def.size ? { shape: 'circle', size: (workspace) => valuesOf(workspace, 'brush', ref, def)[def.size] } : undefined,
    options: def.options.map((option) => toolOption('brush', ref, def, option)),
    // The press: the plugin's begin, then a move for the press itself (Shift: from where the last stroke ended).
    begin(ctx, pos, event) {
      stroke = Object.assign(newStroke(ctx, def, valuesOf(ctx.workspace, 'brush', ref, def)), { owner: tool });
      const from = (event?.shiftKey && ctx.workspace.strokeEnd) || pos;
      if (!def.begin || call(ctx.project, (paint) => marked('begin', () => def.begin(point(pos), paint)))) tool.move(ctx, from, pos);
      return true;
    },
    move(ctx, from, to) {
      if (stroke && stroke.owner !== tool) return stroke.owner.move(ctx, from, to);
      const { project, workspace } = ctx;
      if (!stroke || stroke.dead) return;
      workspace.strokeEnd = to;
      call(project, (paint) => move(paint, from, to));
    },
    // The release: the plugin's end, and the stroke is one undo step.
    end(ctx) {
      if (stroke && stroke.owner !== tool) return stroke.owner.end(ctx);
      const { project } = ctx;
      if (stroke && !stroke.dead && (!def.end || call(project, (paint) => marked('end', () => def.end(paint))))) project.commitEdit();
      stroke = null;
    },
  };
  return tool;
}
