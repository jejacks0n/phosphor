// The editor's keyboard commands, one table that the keys, the ? list, the desktop menu and the command list read. A row:
//   id         stable, dotted by area ('file.save', 'tool.pencil')
//   keys       its keys in keymap.js's grammar: a string, a list, or { mac, other } where the platforms differ
//   group      the ? list's group it shows under (GROUPS)
//   label      () => its words
//   fixed      a key that stays where it's handled (an arrow that nudges, Escape's chain, Edit Mode's typing): shown in
//              the ? list, never matched here, never remapped
//   where      (ctx) => whether the key is the app's here at all (not in a field, the right view, not mid-drag)
//   available  (ctx) => true, or an i18n key saying why it can't run now
//   run        (ctx) => what it does
//   held       a fixed key that works while held down (Alt for the eyedropper, Space for the hand)
//   once       a held key's repeats are taken and do nothing (without it they run again, as a held Cmd+Z does)
// ctx = { project, workspace, event, view: workspace.editorTab, typing: Edit Mode's typing, uncommitted: focus is in a
// field holding typing it hasn't committed (its own undo has it) }.
import { t, te } from '@/i18n/index.js';
import { shortcut } from '@/lib/keyLabels';
import { keysFor, matches } from '@/lib/keymap';
import { ownsKey } from '@/lib/fields';
import { ADD_FRAME_KEY, PLAY_KEY, SWAP_COLORS_KEY } from '@/lib/TextKeys';
import { getTool, offeredTools, optionValue, setOptionValue } from '@/tools';
import { usePlayback } from '@/composables/usePlayback';
import { useVectorStyle } from '@/composables/useVectorStyle.js';

export const GROUPS = ['general', 'tools', 'drawing', 'view', 'colors', 'editMode', 'select', 'vector', 'animation', 'tabs',
  'layers', 'panels', 'file', 'drawingCommands', 'rooms'];

const words = (key, values) => () => t(`shortcuts.rows.${key}`, values?.());
const free = ({ event }) => !ownsKey(event.target, event); // not a key a field (or a menu, a slider) has
const shut = ({ workspace }) => !workspace.paletteLayerOpen && !workspace.colorBox; // the character palette and the color box have the keys
const ART = ['input', 'output']; // PIXEL and ANSI
const letter = (key) => [key.toUpperCase(), `Shift+${key.toUpperCase()}`]; // with Shift or without

// The tool's Size option on offer in this view, the one ] and [ change.
const sizeOption = ({ workspace, view }) => getTool(workspace.activeTool).options
  ?.find((o) => o.size && (!o.views || o.views.includes(view)) && (!o.when || o.when(workspace)));

// The animation keys: with Animate on, in the art views, never inside an art layer; the Alt forms of the frame steps
// while typing too.
const animating = (ctx, typingToo = false) => {
  const { project, workspace } = ctx;
  return project.animate && !!project.image && !project.artInside && (typingToo || !ctx.typing) && workspace.editMode && free(ctx)
    && !workspace.isPainting && shut(ctx);
};
const frameWords = words('prevNextFrame', () => ({ keys: `${shortcut('alt', ',')} ${shortcut('alt', '.')}` }));
const stepFrame = (by) => ({ project }) => {
  usePlayback().pause();
  project.stepFrame(by);
};

const zoom = (by) => ({
  where: (ctx) => !!ctx.project.image && [...ART, 'vector'].includes(ctx.view) && free(ctx),
  run: ({ workspace }) => { workspace.zoomRequest = { by }; },
});
const colorBox = (slot) => ({
  where: (ctx) => free(ctx) && !!ctx.project.image && ctx.workspace.editMode && !ctx.workspace.paletteLayerOpen,
  run: ({ project, workspace, view }) => {
    if (workspace.heldTool?.by === 'alt') workspace.releaseTool();
    // ASCII in the ANSI view has no colors to choose (ColorPair hides itself).
    if (!(view === 'output' && project.renderStyle === 'ascii')) workspace.openColors(slot);
  },
});
const sized = (by) => ({
  where: (ctx) => free(ctx) && !!ctx.project.image && ctx.workspace.editMode && !ctx.typing && ART.includes(ctx.view)
    && !ctx.workspace.isPainting && shut(ctx) && !!sizeOption(ctx),
  run: (ctx) => {
    const { workspace } = ctx, option = sizeOption(ctx), round = 10 ** (option.decimals ?? 0);
    setOptionValue(workspace, option, Math.min(option.max, Math.max(option.min, Math.round((optionValue(workspace, option) + by) * round) / round)));
  },
});

const fixed = (id, group, keys, label) => ({ id, group, keys, label, fixed: true });
const ARROWS = '← ↑ → ↓'; // the four, shown as one

export const COMMANDS = [
  // The shortcuts list: ?, or Alt+? while typing (where ? types; by physical key, as Option+? types ¿).
  { id: 'general.help', group: 'general', keys: ['?', 'Shift+Alt+Slash'], label: words('thisList', () => ({ key: shortcut('alt', '?') })),
    where: (ctx) => (!ctx.typing || ctx.event.altKey) && free(ctx) && shut(ctx),
    run: ({ workspace }) => { workspace.shortcutsOpen = true; } },
  // Not on SOCIAL's ROOM view, nor in a field with typing it hasn't committed: it undoes that itself.
  { id: 'general.undo', group: 'general', keys: 'Mod+Z', label: words('undo'),
    where: (ctx) => !ctx.uncommitted && ctx.view !== 'room', run: ({ project }) => project.undo() },
  { id: 'general.redo', group: 'general', keys: 'Shift+Mod+Z', label: words('redo'),
    where: (ctx) => !ctx.uncommitted && ctx.view !== 'room', run: ({ project }) => project.redo() },
  { id: 'file.save', group: 'general', keys: 'Mod+S', label: words('saveProject'), run: ({ workspace }) => workspace.saveFile({ as: false }) },
  { id: 'file.saveAs', group: 'general', keys: 'Shift+Mod+S', label: words('saveProjectAs'), run: ({ workspace }) => workspace.saveFile({ as: true }) },
  { id: 'file.export', group: 'general', keys: 'Mod+E', label: words('export'),
    available: ({ project }) => (project.image ? true : 'shortcuts.reasons.noDrawing'),
    run: ({ workspace }) => { workspace.exportModal = true; } },
  // The file chooser (EditWorkspace's, the start screen's too), so the browser's own box stays shut. Not in a field.
  { id: 'file.open', group: 'general', keys: 'Mod+O', label: words('openFile'), where: free,
    run: ({ workspace }) => { workspace.openRequest++; } },
  fixed('general.dialogChoices', 'general', '↑ ↓', words('dialogChoices')),

  { ...fixed('drawing.holdAlt', 'drawing', 'Alt', words('holdAlt')), held: true },
  { ...fixed('drawing.holdAltShift', 'drawing', 'Shift+Alt', words('holdAltShift')), held: true },
  { ...fixed('drawing.holdSpace', 'drawing', 'Space', words('holdSpace')), held: true },
  // ] and [ grow and shrink the tool's Size a whole step, within the slider's range, as in Photoshop.
  { id: 'drawing.sizeDown', group: 'drawing', keys: '[', label: words('size'), ...sized(-1) },
  { id: 'drawing.sizeUp', group: 'drawing', keys: ']', label: words('size'), ...sized(1) },

  // About the view's middle (EditorViewport), in place of the browser's page zoom.
  { id: 'view.zoomIn', group: 'view', keys: ['Mod+=', 'Mod++'], label: words('zoomInOut'), ...zoom(2) },
  { id: 'view.zoomOut', group: 'view', keys: ['Mod+-', 'Mod+_'], label: words('zoomInOut'), ...zoom(0.5) },
  { id: 'view.zoomBack', group: 'view', keys: 'Mod+0', label: words('zoomBack'), ...zoom(0) },
  fixed('view.scrollPage', 'view', ['Page Up', 'Page Down'], words('scrollPage')),
  fixed('view.scrollEnds', 'view', { mac: ['Home', 'End', 'Mod+ArrowUp', 'Mod+ArrowDown'], other: ['Home', 'End'] }, words('scrollEnds')),

  // Moebius's: Alt+F (or Alt+A) on the foreground, Alt+B on the background, by physical key (Option's ƒ, å, ∫ don't
  // matter). Typing too, and from a drawing tool: the held eyedropper gives way.
  { id: 'colors.openFg', group: 'colors', keys: ['Alt+KeyF', 'Alt+KeyA'], label: words('openFg'), ...colorBox('fg') },
  { id: 'colors.openBg', group: 'colors', keys: 'Alt+KeyB', label: words('openBg'), ...colorBox('bg') },
  // X while the art is showing, unless the Text tool has it (in Edit Mode, X types); Shift+Cmd/Ctrl+X typing too. On
  // VECTOR the shapes' Fill and Stroke trade places.
  { id: 'colors.swap', group: 'colors', keys: [SWAP_COLORS_KEY.toUpperCase(), 'Shift+Mod+KeyX'], label: words('swapColors'),
    where: (ctx) => free(ctx) && ctx.workspace.editMode && (ctx.event.shiftKey
      ? !!ctx.project.image && !ctx.workspace.paletteLayerOpen
      : ctx.workspace.activeTool !== 'text'),
    run: ({ workspace, view }) => (view === 'vector' ? useVectorStyle().swap() : workspace.swapColors()) },
  fixed('colors.moveSwatches', 'colors', ARROWS, words('moveSwatches')),
  fixed('colors.pickSwatch', 'colors', ['Enter', 'Space'], words('pickSwatch')),

  fixed('editMode.moveCursor', 'editMode', ARROWS, words('moveCursor')),
  fixed('editMode.selectFromCursor', 'editMode', `Shift+${ARROWS}`, words('selectFromCursor')),
  fixed('editMode.homeEnd', 'editMode', ['Home', 'End'], words('homeEnd')),
  fixed('editMode.nextLine', 'editMode', 'Enter', words('nextLine')),
  fixed('editMode.erase', 'editMode', ['Backspace', 'Delete'], words('erase')),
  fixed('editMode.insertOverwrite', 'editMode', ['Insert', 'Alt+Enter'], words('insertOverwrite')),
  fixed('editMode.typeFKey', 'editMode', 'F1–F12', words('typeFKey')),
  fixed('editMode.grabFKey', 'editMode', 'Ctrl+Shift+F1–F12', words('grabFKey')),
  fixed('editMode.prevNextPalette', 'editMode', ['Alt+ArrowLeft', 'Alt+ArrowRight'], words('prevNextPalette')),
  fixed('editMode.stepFgPalette', 'editMode', ['Alt+ArrowUp', 'Alt+ArrowDown'], words('stepFgPalette')),

  fixed('select.all', 'select', 'Mod+A', words('selectAll')),
  fixed('select.copyCutPaste', 'select', ['Mod+C', 'Mod+X', 'Mod+V'], words('copyCutPaste')),
  fixed('select.nudge', 'select', ARROWS, words('nudge')),
  fixed('select.growShrink', 'select', `Shift+${ARROWS}`, words('growShrink')),
  fixed('select.delete', 'select', ['Delete', 'Backspace', 'E'], words('deleteSelection')),
  fixed('select.stamp', 'select', ['S', 'C'], words('stamp')),
  fixed('select.deselect', 'select', ['Esc', 'Enter'], words('deselect')),

  fixed('vector.penEnd', 'vector', ['Enter', 'Esc'], words('penEnd')),
  fixed('vector.penBack', 'vector', 'Backspace', words('penBack')),
  fixed('vector.nudge', 'vector', ARROWS, words('vectorNudge')),
  fixed('vector.delete', 'vector', ['Delete', 'Backspace'], words('vectorDelete')),
  fixed('vector.esc', 'vector', 'Esc', words('vectorEsc')),

  // L plays and pauses, comma and period step, N adds a frame of the showing one's kind (held, it goes on adding them).
  { id: 'animation.play', group: 'animation', keys: letter(PLAY_KEY), label: words('playPause'), once: true,
    where: (ctx) => animating(ctx), run: () => usePlayback().toggle() },
  { id: 'animation.prevFrame', group: 'animation', keys: [',', 'Alt+Comma'], label: frameWords,
    where: (ctx) => animating(ctx, ctx.event.altKey), run: stepFrame(-1) },
  { id: 'animation.nextFrame', group: 'animation', keys: ['.', 'Alt+Period'], label: frameWords,
    where: (ctx) => animating(ctx, ctx.event.altKey), run: stepFrame(1) },
  { id: 'animation.newFrame', group: 'animation', keys: letter(ADD_FRAME_KEY), label: words('newFrame'),
    where: (ctx) => animating(ctx), run: ({ project }) => project.addFrame(project.currentFrame.kind) },

  fixed('tabs.switch', 'tabs', '← →', words('switchTabs')),
];

const BY_ID = new Map(COMMANDS.map((command) => [command.id, command]));
export const commandById = (id) => BY_ID.get(id);

// The tools as commands, one for each offered in the view that has keys (plugin brushes too): a letter chooses the
// tool. Not while typing (Edit Mode with its cursor, a field), mid-drag, with a tool held by a key, or with the color
// box or character palette open. The ? list's words where it has its own (the Eraser's says what E does to a selection).
const TOOL_WORDS = { text: 'editMode' };
const toolWhere = (ctx) => free(ctx) && !!ctx.project.image && ctx.workspace.editMode && !ctx.typing && !ctx.workspace.isPainting
  && !ctx.workspace.heldTool && shut(ctx);
export function toolCommands(view, project) {
  return offeredTools(view, project).filter((tool) => tool.keys?.length).map((tool) => {
    const path = `shortcuts.rows.${TOOL_WORDS[tool.id] ?? tool.id}`;
    return {
      id: `tool.${tool.id}`, group: tool.views.includes('vector') ? 'vector' : 'tools', keys: tool.keys, once: true,
      label: () => (tool.section !== 'plugin' && te(path) ? t(path, { alt: shortcut('alt') }) : tool.title),
      where: toolWhere, run: ({ workspace }) => workspace.setActiveTool(tool.id),
    };
  });
}

// Cmd or Ctrl on every platform: the chords have always taken either, so Ctrl+Z undoes on a Mac and Cmd+Z elsewhere.
const keyMatches = (e, key) => matches(e, key, { mac: true }) || matches(e, key, { mac: false });

// The first of ids (a trailing * takes a prefix: 'tool.*') whose key this is and whose where holds takes the key: its
// default prevented, then it runs when available (a held key's repeat with once runs nothing). True when taken.
export function takeKey(event, ctx, ids) {
  const pool = ids.some((id) => id.startsWith('tool.')) ? [...COMMANDS, ...toolCommands(ctx.view, ctx.project)] : COMMANDS;
  for (const id of ids) {
    const prefix = id.endsWith('*') ? id.slice(0, -1) : null;
    const command = pool.find((c) => c.run && (prefix ? c.id.startsWith(prefix) : c.id === id)
      && keysFor(c.keys).some((key) => keyMatches(event, key)) && (!c.where || c.where(ctx)));
    if (!command) continue;
    event.preventDefault();
    if (!(event.repeat && command.once) && (command.available?.(ctx) ?? true) === true) command.run(ctx);
    return true;
  }
  return false;
}
