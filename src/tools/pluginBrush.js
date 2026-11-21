import { brushPixels } from '@/lib/Brushes';
import { selectionClip } from '@/lib/selectionClip';
import { mix } from '@/lib/Cells.js';
import { hex2rgb } from '@/lib/ColorUtils.js';
import { mixPaint } from '@/lib/Retouch.js';
import { onBottom, ownPixelAt } from '@/store/project/shared.js';
import { optionValues, scriptOptions } from '@/plugins/solvers.js';
import { beginRun, endRun } from '@/plugins/hangMark';
import { usePluginStore } from '@/store/PluginStore';
import { toast } from '@/composables/useToast';
import { t } from '@/i18n/index.js';
import brushTool from '@/tools/brush';

// A plugin brush as a tool (tools/index.js's pluginTools makes one for each brush of a plugin that's on). Its looks, keys,
// options and the modes it works in are here; its painting is the plugin's own work, behind its begin, move and end, each
// handed the stroke's paint (below). The options it declares are kept by ref in workspace.pluginTools, { [optionId]: value },
// and read back through optionValues, so a value that no longer fits (a plugin's update changed a range) is its default.
// The digits a step shows: those after its point, less its exponent when it's written 1e-7 style (toFixed takes up to 100).
const decimals = (step) => {
  const [digits, exponent] = String(step).split('e');
  return Math.min(100, Math.max(0, (digits.split('.')[1] ?? '').length - Number(exponent ?? 0)));
};

const valuesOf = (workspace, ref, def) => optionValues(def, workspace.pluginTools[ref]);

// One declared option as a toolbar option: the plugin's words for its label, and get and set over the kept values.
function toolOption(ref, def, option) {
  const base = {
    key: `${ref}/${option.id}`, // RangeField's element id: unique on the page, whatever ids plugins pick
    label: option.name,
    title: option.name,
    get: (workspace) => valuesOf(workspace, ref, def)[option.id],
    set: (workspace, value) => { workspace.pluginTools[ref] = { ...workspace.pluginTools[ref], [option.id]: value }; },
  };
  if (option.kind === 'slider') return { ...base, min: option.min, max: option.max, step: option.step, decimals: decimals(option.step), size: option.id === def.size };
  if (option.kind === 'checkbox') return { ...base, type: 'checkbox' };
  if (option.kind === 'color') return { ...base, type: 'color' };
  return { ...base, type: 'dropdown', choices: option.choices.map((label, value) => ({ value, label })) };
}

// The brushes whose first move this visit has run, by ref and script hash: that first one runs under the hang mark
// (plugins/hangMark.js), so a brush that freezes the page is turned off next time.
const ran = new Set();
const point = ({ x, y }) => ({ x: Number(x), y: Number(y) });
const MAX_SIZE = brushTool.options.find((option) => option.size).max; // the Brush's largest size
const MAX_MESSAGE = 200; // the longest of a plugin's own words shown in a toast and its row
const channel = (v) => Math.min(255, Math.max(0, Math.round(v)));

// A stroke's paint, the one object its begin, moves and end are handed (docs/plugins.md), with the puts of the call going
// on. What it reads is as the stroke began, read once a pixel: shown, the colors up to the picked layer (as Retouch reads
// them), and own, the picked layer's own paint (ownPixelAt; on the base, shown). A put is kept until the call returns;
// one that isn't a whole grid pixel, or is outside the selection, is dropped.
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
  const shown = cached((x, y) => hex2rgb(project.rawColorAt(x, y, { upTo })));
  const own = base ? shown : cached((x, y) => ownPixelAt(project, x, y));
  // A read for the plugin: a copy (its changes stay its own), null off the grid.
  const reader = (read) => (x, y) => {
    x = Math.floor(x);
    y = Math.floor(y);
    const color = inGrid(x, y) ? read(x, y) : null;
    return color && { ...color };
  };
  const puts = new Map();
  const paint = Object.freeze({
    cols,
    rows,
    options: scriptOptions(def, values),
    fg: hex2rgb(workspace.editFgColor),
    bg: hex2rgb(workspace.editBgColor),
    shown: reader(shown),
    own: reader(own),
    put(x, y, color, alpha) {
      if (!Number.isInteger(x) || !Number.isInteger(y) || !inGrid(x, y) || (clip && !clip.pixel(x, y))) return;
      if (![color?.r, color?.g, color?.b, alpha].every(Number.isFinite)) return;
      puts.set(`${x},${y}`, { x, y, color: { r: channel(color.r), g: channel(color.g), b: channel(color.b) }, alpha: Math.min(1, Math.max(0, alpha)) });
    },
    // The Brush's dab: a size that isn't a number is none, and one past the Brush's own largest is that.
    dab(from, to, size, hardness) {
      if (!Number.isFinite(Number(size))) return [];
      const soft = Number.isFinite(Number(hardness)) ? Math.min(1, Math.max(0, Number(hardness))) : 1;
      return brushPixels(point(from), point(to), { size: Math.min(MAX_SIZE, Number(size)), flow: 1, hardness: soft }, cols, rows).map(({ x, y, alpha }) => ({ x, y, alpha }));
    },
  });
  return { paint, puts, base, shown, own, rows, dead: false };
}

// The puts of a call laid: Colors only's cells first (colorsOnlyCells: the paint shows in ANSI as the Brush's Colors only
// does, docs/model.md R5), then each pixel the color at its alpha over what the picked layer had there when the stroke
// began, so a later put replaces an earlier one: on a layer its paint exactly (putEditPixels, clear where nothing's left),
// on the base its pixels, opaque (paintEditPixels). Both pixels of each cell are read first, as they were: Colors only
// can turn a cell of the layer's own into paint.
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
  project.colorsOnlyCells(pixels);
  if (stroke.base) project.paintEditPixels(pixels.map(({ x, y, color, alpha }) => ({ x, y, ...mix(stroke.shown(x, y), color, alpha), alpha: 1 })), 100, false);
  else project.putEditPixels(pixels.map(({ x, y, color, alpha }) => ({ x, y, ...(mixPaint(stroke.own(x, y), { ...color, a: 1 }, alpha) ?? { r: 0, g: 0, b: 0, a: 0 }) })));
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
    let message;
    try {
      message = String(error?.message ?? error).slice(0, MAX_MESSAGE);
    } catch {
      message = '?';
    }
    const words = t('plugins.brushFailed', { name: def.name, message });
    toast(words);
    usePluginStore().problems[pluginId] = words;
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
  const move = (paint, from, to) => {
    const run = `${ref}\u0000${hash}`;
    if (ran.has(run)) return def.move(point(from), point(to), paint);
    ran.add(run);
    beginRun(pluginId);
    try {
      def.move(point(from), point(to), paint);
    } finally {
      endRun();
    }
  };

  const tool = {
    id: ref,
    get title() { return t('tools.pluginTitle', { name: def.name, plugin: pluginName }); },
    icon: def.icon,
    keys: key ? [key] : [],
    views: ['input', 'output'],
    kind: 'paint',
    section: 'plugin',
    altPicks: true,
    shiftLines: true,
    preview: def.size ? { shape: 'circle', size: (workspace) => valuesOf(workspace, ref, def)[def.size] } : undefined,
    options: def.options.map((option) => toolOption(ref, def, option)),
    // The press: the plugin's begin, then a move for the press itself (Shift: from where the last stroke ended).
    begin(ctx, pos, event) {
      stroke = Object.assign(newStroke(ctx, def, valuesOf(ctx.workspace, ref, def)), { owner: tool });
      const from = (event?.shiftKey && ctx.workspace.strokeEnd) || pos;
      if (!def.begin || call(ctx.project, (paint) => def.begin(point(pos), paint))) tool.move(ctx, from, pos);
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
      if (stroke && !stroke.dead && (!def.end || call(project, (paint) => def.end(paint)))) project.commitEdit();
      stroke = null;
    },
  };
  return tool;
}
