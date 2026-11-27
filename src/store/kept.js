import { useLocalStorage } from '@vueuse/core';
import { TOOL_GROUPS } from '@/tools/groups';
import { isSolverRef } from '@/plugins/solvers';
import { fitsGrid } from '@/lib/charPalettes';

// The editor's own choices in the workspace store (WorkspaceStore.js): the color pair, what the picker picks, the tool
// on each tab and the tools' options. They're the person's, not the drawing's: kept in this browser, each under its
// storage key, so a reload or a crash brings them back, and New project or a file opened leaves them as they are. Never
// in the autosaved document or a project file. The moment's state (the selection, the wand's mask, a popover, the
// scroll) isn't here. Each one's good says what it can hold now: a stored value that isn't (a tool that's gone, a
// number out of range, something else's JSON) reads as the default. A plugin brush or shape not installed is kept,
// since the plugins load after: the store reads it as the Brush, or the Rectangle, until it's there (activeTool,
// vshape.shapeKind). Storage keys must never change: they hold people's choices.

const PIXEL_TOOLS = ['pencil', 'brush', 'eraser', 'bucket', 'gradient', 'blur', 'dodge', 'burn', 'shapes', 'picker', 'select', 'wand', 'hand', 'zoom'];
// The built-in tools each tab offers (tools/index.js has them, which the store mustn't import: a tool imports the stores).
export const TAB_TOOLS = {
  input: PIXEL_TOOLS,
  output: [...PIXEL_TOOLS, 'text', 'flip'],
  vector: ['vselect', 'vnode', 'pen', 'vshape', 'picker', 'hand', 'zoom'],
};

const bool = (v) => typeof v === 'boolean';
const oneOf = (...values) => (v) => values.includes(v);
const between = (min, max) => (v) => Number.isFinite(v) && v >= min && v <= max;
const whole = (min, max) => (v) => Number.isInteger(v) && v >= min && v <= max;
const hex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const index = (v) => v === undefined || whole(0, 255)(v);
const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const toolOf = (tab) => (v) => TAB_TOOLS[tab].includes(v) || (tab !== 'vector' && isSolverRef(v));
// An object of fields, each its own: a field that isn't good is its default. single: one of them lit (a row of toggles
// that lights one), else the whole default.
const fields = (goods, { single = false } = {}) => (v, fallback) => {
  if (!plain(v)) return fallback;
  const out = Object.fromEntries(Object.entries(goods).map(([k, good]) => [k, good(v[k]) ? v[k] : fallback[k]]));
  return single && Object.values(out).filter(Boolean).length !== 1 ? fallback : out;
};
const flags = (...keys) => fields(Object.fromEntries(keys.map((k) => [k, bool])));
// The toolbar slots' faces (slotFaces): a group's tool, each kept while it's still in its group.
const faces = (v) => (plain(v) ? Object.fromEntries(Object.entries(v).filter(([id, tool]) => TOOL_GROUPS.some((g) => g.id === id && g.tools.includes(tool)))) : {});
const paint = (v) => v === 'fg' || v === null || hex(v); // a new shape's fill or stroke: the foreground's, none or a color

// { key: the workspace's field, default, good (v) => boolean, or clean (v, default) => the value to use }.
export const KEPT = [
  // The color pair. Paint uses the foreground; typing uses both, where a none slot leaves that attribute as it is
  // underneath (with the background none, typed text sits on the image). A swatch's 256-color index when a lower index
  // shares its color (16 and 231 are 0's and 15's black and white, fixed where those follow a terminal's theme), so
  // what's drawn with it exports as it (edit cells' fgIndex, bgIndex).
  { key: 'editFgColor', default: '#ffffff', good: hex },
  { key: 'editBgColor', default: '#000000', good: hex },
  { key: 'editFgNone', default: false, good: bool },
  { key: 'editBgNone', default: true, good: bool },
  { key: 'editFgIndex', default: undefined, good: index },
  { key: 'editBgIndex', default: undefined, good: index },
  // What the picker picks, on ANSI, PIXEL and VECTOR.
  { key: 'pickLayers', default: () => ({ fg: true, bg: true }), clean: flags('fg', 'bg') }, // ANSI view: what a plain picker click picks (both lit: both)
  { key: 'pixelPickSlot', default: () => ({ fg: true, bg: false }), clean: fields({ fg: bool, bg: bool }, { single: true }) }, // pixel view: what a plain picker click picks, one lit (Shift: the other)
  { key: 'vectorPickSlot', default: () => ({ fill: true, stroke: false }), clean: fields({ fill: bool, stroke: bool }, { single: true }) }, // VECTOR: what a plain picker click sets, one lit (Shift: the other)
  // The tool on each tab, and the one each toolbar slot shows.
  { key: 'inputActiveTool', default: 'brush', good: toolOf('input') },
  { key: 'outputActiveTool', default: 'hand', good: toolOf('output') },
  { key: 'vectorActiveTool', default: 'vselect', good: toolOf('vector') },
  { key: 'slotFaces', default: () => ({}), clean: faces }, // a toolbar slot's tool, by group id (tools/groups.js): the one last chosen
  // The tools' options.
  { key: 'activeChar', default: '█', good: fitsGrid }, // what Fill and Shapes draw with; set by picks (and F-keys)
  { key: 'typingMode', default: 'overwrite', good: oneOf('overwrite', 'insert', 'partial') }, // typing replaces the cell ('overwrite'), or pushes the row right: its characters and paint ('insert'), or its characters alone ('partial')
  { key: 'selectAllLayers', default: false, good: bool }, // a selection's actions (selectionIds), Select's and the Magic Wand's: true = every shown cells layer, false = the picked layer only
  { key: 'wandMatch', default: () => ({ fg: true, bg: false, char: true }), clean: flags('fg', 'bg', 'char') }, // ANSI view: what a cell must share with the one clicked
  { key: 'wandContiguous', default: true, good: bool }, // only what touches the unit clicked
  { key: 'wandTolerance', default: 10, good: between(0, 100) }, // how far a color may be from the clicked one's and still match (0-100)
  { key: 'pencilDrawWith', default: 'normal', good: oneOf('normal', 'single', 'double', 'half', 'shade') }, // Pencil, ANSI view: 'normal' (paint) | 'single' | 'double' (box lines) | 'half' (▄ half-blocks) | 'shade' (░ ▒ ▓ █ a step a pass)
  { key: 'pencilConnect', default: true, good: bool }, // Pencil's Single and Double: join the lines it crosses or lands on
  { key: 'shapeKind', default: 'rect', good: oneOf('rect', 'ellipse', 'line') }, // Shapes tool: 'rect' | 'ellipse' | 'line'
  { key: 'shapeCharFill', default: false, good: bool }, // Character mode: fill the inside with the character too (other modes fill with BG)
  { key: 'shapeDrawWith', default: 'double', good: oneOf('single', 'double', 'half', 'full', 'char') }, // ANSI view: 'single' | 'double' | 'half' | 'full' | 'char'
  { key: 'shapeConnect', default: true, good: bool }, // line boxes join the box characters they cross or meet
  { key: 'shapeBlockChars', default: false, good: bool }, // ANSI blocks: real ▄/█ characters, or paint over the cells' own
  { key: 'shapeAntialias', default: false, good: bool }, // ellipses and lines: edge pixels by coverage, or ░▒▓█ cells
  { key: 'shapeVerticalHalves', default: false, good: bool }, // ANSI blocks: ▌▐ too (Half-block: quadrants), for lines and ellipses
  { key: 'editBrushSize', default: 2.5, good: between(1, 20) },
  { key: 'editEraserSize', default: 5, good: between(1, 20) }, // the PIXEL view's Eraser, in grid pixels
  { key: 'editEraserCells', default: 1, good: between(1, 20) }, // the ANSI view's, in cells
  { key: 'editEraserSoft', default: false, good: bool }, // a round, feathered eraser that takes paint away by its Flow, in grid pixels in both views, or (off) a hard square
  { key: 'editEraserFlow', default: 50, good: between(1, 100) }, // a soft eraser's Flow, as the Brush's (brush.js: stampFlow)
  { key: 'editBrushOpacity', default: 100, good: between(1, 100) },
  { key: 'brushDrawWith', default: 'normal', good: oneOf('normal', 'half', 'shade') }, // Brush, ANSI view: 'normal' (paint) | 'half' (each cell painted becomes a ▄ the paint colors) | 'shade' (░ ▒ ▓ █ a step a pass)
  { key: 'shadeLighter', default: false, good: bool }, // Shade's way, the Pencil's and Brush's: Darker (false, ░ to █) or Lighter (true, back to a space)
  { key: 'editBrushStack', default: true, good: bool }, // Stack opacity: each stroke lays up to the opacity on top of what's there (PaintLayer.paint)
  { key: 'editBrushFlow', default: 50, good: between(1, 100) }, // a stamp flow of 0.25 (brush.js squares it)
  { key: 'editBrushHardness', default: 50, good: between(0, 100) },
  { key: 'editFillTolerance', default: 10, good: between(0, 100) },
  { key: 'editFillContiguous', default: true, good: bool },
  { key: 'editFillAllLayers', default: true, good: bool }, // the Paint Bucket's and the Gradient's area: by what every shown layer shows together, or (off) the layer in use alone
  { key: 'editFillFeather', default: 2, good: between(0, 100) },
  { key: 'bucketFillWith', default: 'normal', good: oneOf('normal', 'cells') }, // ANSI view: 'normal' (the color you see) | 'cells' (whole cells, by Match and Set)
  { key: 'bucketMatch', default: () => ({ fg: true, bg: true, char: true }), clean: flags('fg', 'bg', 'char') }, // Cells: what a cell must share with the one clicked
  { key: 'bucketSet', default: () => ({ fg: true, bg: false, char: false }), clean: flags('fg', 'bg', 'char') }, // Cells: what the fill sets (your FG, BG, character)
  { key: 'gradientShape', default: 'linear', good: oneOf('linear', 'spherical') }, // the Gradient: 'linear' | 'spherical' (a drag from FG to BG)
  { key: 'retouchSize', default: 6, good: between(1, 20) },
  { key: 'retouchStrength', default: 50, good: between(1, 100) },
  { key: 'retouchHardness', default: 50, good: between(0, 100) },
  { key: 'retouchRange', default: 'midtones', good: oneOf('shadows', 'midtones', 'highlights') }, // Dodge and Burn: 'shadows' | 'midtones' | 'highlights'
  { key: 'vectorSnap', default: 'none', good: oneOf('none', 'cells', 'half') }, // VECTOR's Snap to: 'none' | 'cells' | 'half' (half cells, both ways); vectorSnap.js
  { // what a new shape gets: a color, 'fg' (the foreground's then) or null
    key: 'vectorStyle', default: () => ({ fill: 'fg', stroke: null, width: 1, cap: 'round', join: 'round', miter: 4, align: 'center' }),
    clean: fields({ fill: paint, stroke: paint, width: between(0.5, 64), cap: oneOf('round', 'butt', 'square'), join: oneOf('round', 'miter', 'bevel'), miter: between(1, 100), align: oneOf('center', 'inside', 'outside', 'left', 'right') }),
  },
  { key: 'vectorShapeKind', default: 'rect', good: (v) => ['rect', 'ellipse', 'polygon'].includes(v) || isSolverRef(v) }, // the Shape tool: 'rect' | 'ellipse' | 'polygon', or a plugin shape's ref (vshape.shapeKind reads it)
  { key: 'vectorSides', default: 5, good: whole(3, 12) }, // a polygon's sides, 3 to 12
  // How Save writes a .pho: laid out so that printed in a terminal it shows its drawing (phoTerminal.js), or (off) the
  // plain form, smaller, which copies of Phosphor from before the terminal form open too.
  { key: 'saveForTerminal', default: true, good: bool },
];

export const keptKey = (entry) => `phosphor.${entry.key}`;
const defaultOf = (entry) => (typeof entry.default === 'function' ? entry.default() : entry.default);

// What a kept choice is, from what storage holds for it (a string, or null when there's none): the stored value when
// it's good now, else the default.
export function keptValue(entry, raw) {
  const fallback = defaultOf(entry);
  if (typeof raw !== 'string') return fallback;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (entry.clean) return entry.clean(value, fallback);
  return entry.good(value) ? value : fallback;
}

// The workspace state's kept fields, each read from this browser and written back as it changes. Another browser tab's
// changes reach this one only on reload, as the settings' do. heldKey: the field a tool held with a key is in (the
// picker on Alt, the hand on Space), which isn't written while it's held, so a crash or a window closed with Alt down
// (Alt+F4) brings back the tool chosen, not the one held.
export function keptState(heldKey = () => null) {
  return Object.fromEntries(KEPT.map((entry) => [entry.key, useLocalStorage(keptKey(entry), defaultOf(entry), {
    serializer: { read: (raw) => keptValue(entry, raw), write: JSON.stringify },
    listenToStorageChanges: false,
    writeDefaults: false,
    eventFilter: (write) => { if (heldKey() !== entry.key) write(); },
    onError: () => {}, // storage blocked or full: the defaults, and nothing kept
  })]));
}

// The workspace's state with its kept fields added. Pinia keeps this very object as the store's state, so its heldTool
// ({ key, tool, by }) is the store's.
export const withKept = (state) => Object.assign(state, keptState(() => state.heldTool?.key));
