// The editor's keyboard commands, one table that the keys, the ? list, the desktop menu and the command list read. A row:
//   id         stable, dotted by area ('file.save', 'tool.pencil')
//   keys       its keys in keymap.js's grammar: a string, a list, or { mac, other } where the platforms differ
//   shown      what the ? list prints in place of keys, for keys the grammar can't write (the four arrows as one, Page Up,
//              a held key's words) or to print fewer of them: a list of words, or a function giving it (a platform's)
//   menu       the desktop menu command that shows this key (useDesktopMenu's accelerators)
//   group      the ? list's group it shows under (GROUPS)
//   label      () => its words (with .path, its i18n key)
//   title      () => the command list's words, where they aren't label's: a button's (Export…), or one of a pair that
//              shares the ? list's line (Zoom in, Zoom out)
//   fixed      a key that stays where it's handled (an arrow that nudges, Escape's chain, Edit Mode's typing): shown in
//              the ? list, never matched here, never remapped (a run on one is for the command list)
//   where      (ctx) => whether the key is the app's here at all (not in a field, the right view, not mid-drag)
//   available  (ctx) => true, or an i18n key saying why it can't run now
//   run        (ctx) => what it does
//   held       a fixed key that works while held down (Alt for the eyedropper, Space for the hand)
//   once       a held key's repeats are taken and do nothing (without it they run again, as a held Cmd+Z does)
//   hidden     a key taken to keep it from the browser that does nothing: left out of the ? list and the command list
//   strictMod  Mod is only the platform's own (Cmd on a Mac), not Cmd or Ctrl as for the others
// A row with a run and no keys is the command list's alone (New project, Export .ans), and the ? list leaves it out.
// ctx = { project, workspace, event, view: workspace.editorTab, typing: Edit Mode's typing, uncommitted: focus is in a
// field holding typing it hasn't committed (its own undo has it) }.
import { nextTick } from 'vue';
import { t, te } from '@/i18n/index.js';
import { isMac, shortcut } from '@/lib/keyLabels';
import { keyLabel, keysFor, matches } from '@/lib/keymap';
import { ownsKey } from '@/lib/fields';
import { ADD_FRAME_KEY, PLAY_KEY, SWAP_COLORS_KEY } from '@/lib/TextKeys';
import { getTool, offeredTools, optionValue, setOptionValue } from '@/tools';
import { usePlayback } from '@/composables/usePlayback';
import { stepColor } from '@/composables/colorSteps';
import { lineStep, typingTakesKeys } from '@/composables/useTextTool';
import { usePaletteStore } from '@/store/PaletteStore';
import { useVectorStyle } from '@/composables/useVectorStyle.js';
import { useDrawingStore } from '@/store/DrawingStore';
import { usePluginStore } from '@/store/PluginStore';
import { EXPORT_FORMATS } from '@/document/projectIO';
import { canExportVideo } from '@/lib/VideoFile';
import { recentCommands } from '@/lib/recentCommands';

export const GROUPS = ['general', 'tools', 'drawing', 'view', 'colors', 'editMode', 'select', 'vector', 'animation', 'tabs',
  'layers', 'panels', 'file', 'drawingCommands', 'rooms'];

const said = (path, values) => Object.assign(() => t(path, values?.()), { path });
const words = (key, values) => said(`shortcuts.rows.${key}`, values);
const free = ({ event }) => !ownsKey(event.target, event); // not a key a field (or a menu, a slider) has
const shut = ({ workspace }) => !workspace.paletteLayerOpen && !workspace.colorBox; // the character palette and the color box have the keys
const ART = ['input', 'output']; // PIXEL and ANSI
const letter = (key) => [key.toUpperCase(), `Shift+${key.toUpperCase()}`]; // with Shift or without

// The tool's Size option on offer in this view, the one ] and [ change.
const sizeOption = ({ workspace, view }) => getTool(workspace.activeTool).options
  ?.find((o) => o.size && (!o.views || o.views.includes(view)) && (!o.when || o.when(workspace)));

// The animation keys: with Animate on, in the art views, never inside an art layer, not while typing (Edit Mode keeps its
// keys: Alt+, and Alt+. type ≤ and ≥ there on a Mac).
const animating = (ctx) => {
  const { project, workspace } = ctx;
  return project.animate && !!project.image && !project.artInside && !ctx.typing && workspace.editMode && free(ctx)
    && !workspace.isPainting && shut(ctx);
};
const frameWords = words('prevNextFrame', () => ({ keys: `${shortcut('alt', ',')} ${shortcut('alt', '.')}` }));
const stepFrame = (by) => ({ project }) => {
  usePlayback().pause();
  project.stepFrame(by);
};

const zoom = (by, title) => ({
  title: title && said(title),
  where: (ctx) => !!ctx.project.image && [...ART, 'vector'].includes(ctx.view) && free(ctx),
  run: ({ workspace }) => { workspace.zoomRequest = { by }; },
});
const colorBox = (slot) => ({
  where: (ctx) => free(ctx) && !!ctx.project.image && ctx.workspace.editMode && !ctx.workspace.paletteLayerOpen,
  run: ({ project, workspace, view }) => {
    // ASCII in the ANSI view has no colors to choose (ColorPair hides itself).
    if (!(view === 'output' && project.renderStyle === 'ascii')) workspace.openColors(slot);
  },
});
// The color steps: wherever the color pair shows (PIXEL and ANSI, not Monochrome ASCII's ANSI, which has no colors),
// typing too. Moebius's Ctrl+arrows; a Mac keeps those for Spaces, so there they take Option too (and Ctrl+Option is
// bound on a Mac only: elsewhere it's AltGr, which types).
const colorStep = (slot, delta, arrow) => ({
  title: said(`shortcuts.commands.${slot}${delta < 0 ? 'Prev' : 'Next'}`),
  keys: { mac: [`Ctrl+Alt+${arrow}`], other: [`Ctrl+${arrow}`] },
  where: (ctx) => free(ctx) && !!ctx.project.image && ART.includes(ctx.view) && shut(ctx)
    && !(ctx.view === 'output' && ctx.project.renderStyle === 'ascii'),
  run: ({ project, workspace }) => stepColor(project, workspace, slot, delta),
});
// The character set's steps, Moebius's Ctrl+, and Ctrl+.: wherever the F-key set shows (the ANSI view's Edit Mode),
// typing or not.
const charSet = (delta) => ({
  title: said(`palette.strip.${delta < 0 ? 'prev' : 'next'}Aria`),
  where: (ctx) => free(ctx) && !!ctx.project.image && ctx.view === 'output' && !!getTool(ctx.workspace.activeTool).palette && shut(ctx),
  run: () => usePaletteStore().flip(delta),
});

// Lines and columns: their keys are Edit Mode's (useTextTool, through textKeyAction), so the rows are fixed; the command
// list runs them at the cursor.
const lines = (id, label, keys, type, delta) => ({
  ...fixed(id, 'editMode', words(label), { keys }),
  available: ({ workspace, view }) => (view === 'output' && workspace.activeTool === 'text' && workspace.textCursor ? true : 'shortcuts.reasons.noCursor'),
  run: ({ project, workspace }) => lineStep(project, workspace, type, delta),
});
// Alt+← and Alt+→ where Edit Mode's typing won't take them (useTextTool leaves a form field's, a dialog's and the
// character palette's keys alone: typingTakesKeys is its own test). Not left to the handlers' order: taking a key typing
// would take would lose its column. On a Mac a field that owns them keeps them (Option+arrows move by word), and the
// browser has no Back on them.
const backKept = (ctx) => ctx.workspace.editMode && (isMac ? free(ctx) : true) && !typingTakesKeys(ctx.workspace);

const sized = (by) => ({
  title: said(`shortcuts.commands.${by < 0 ? 'sizeDown' : 'sizeUp'}`),
  where: (ctx) => free(ctx) && !!ctx.project.image && ctx.workspace.editMode && !ctx.typing && ART.includes(ctx.view)
    && !ctx.workspace.isPainting && shut(ctx) && !!sizeOption(ctx),
  run: (ctx) => {
    const { workspace } = ctx, option = sizeOption(ctx), round = 10 ** (option.decimals ?? 0);
    setOptionValue(workspace, option, Math.min(option.max, Math.max(option.min, Math.round((optionValue(workspace, option) + by) * round) / round)));
  },
});

const drawn = ({ project }) => (project.image ? true : 'shortcuts.reasons.noDrawing');
// What a drawing in a room allows: the host's alone, and not even the host's while others are drawing too.
const alone = (ctx) => {
  const drawing = useDrawingStore(), done = drawn(ctx);
  if (done !== true) return done;
  return drawing.mayDraw ? 'social.drawing.onlyHost' : drawing.othersHere ? 'social.drawing.notWithOthers' : true;
};
const linkedPlugins = () => usePluginStore().plugins.filter((plugin) => plugin.handle);

// The window loaded again with ?plugins=off (docs/plugins.md), asked first with unsaved work as any reload is. An object,
// so a test can stand in for the navigation.
export const reloading = {
  withPluginsOff: () => { location.search = '?plugins=off'; },
};

const fixed = (id, group, label, { keys, shown }) => ({ id, group, label, keys, shown, fixed: true });
const ARROWS = '← ↑ → ↓'; // the four, shown as one
const shiftArrows = () => [shortcut('shift', ARROWS)];

export const COMMANDS = [
  // The shortcuts list: ?, or Alt+? while typing (where ? types; by physical key, as Option+? types ¿).
  { id: 'general.help', group: 'general', keys: ['?', 'Shift+Alt+Slash'], shown: ['?'], label: words('thisList', () => ({ key: shortcut('alt', '?') })),
    title: said('shortcuts.title'),
    where: (ctx) => (!ctx.typing || ctx.event.altKey) && free(ctx) && shut(ctx),
    run: ({ workspace }) => { workspace.shortcutsOpen = true; } },
  // Not on SOCIAL's ROOM view, nor in a field with typing it hasn't committed: it undoes that itself.
  { id: 'general.undo', group: 'general', keys: 'Mod+Z', menu: 'undo', label: words('undo'),
    where: (ctx) => !ctx.uncommitted && ctx.view !== 'room', run: ({ project }) => project.undo() },
  { id: 'general.redo', group: 'general', keys: 'Shift+Mod+Z', menu: 'redo', label: words('redo'),
    where: (ctx) => !ctx.uncommitted && ctx.view !== 'room', run: ({ project }) => project.redo() },
  { id: 'file.save', group: 'general', keys: 'Mod+S', menu: 'save', label: words('saveProject'), available: drawn,
    run: ({ workspace }) => workspace.saveFile({ as: false }) },
  { id: 'file.saveAs', group: 'general', keys: 'Shift+Mod+S', menu: 'saveAs', label: words('saveProjectAs'), available: drawn,
    run: ({ workspace }) => workspace.saveFile({ as: true }) },
  { id: 'file.export', group: 'general', keys: 'Mod+E', menu: 'export', label: words('export'), title: said('actions.export'), available: drawn,
    run: ({ workspace }) => { workspace.exportModal = true; } },
  // The file chooser (EditWorkspace's, the start screen's too), so the browser's own box stays shut. Not in a field.
  { id: 'file.open', group: 'general', keys: 'Mod+O', menu: 'open', label: words('openFile'), where: free,
    run: ({ workspace }) => { workspace.openRequest++; } },
  // The command list: everywhere but over a dialog (the color box, the character palette, any modal one), typing and in
  // a field too. Cmd+K on a Mac only: Ctrl+K there is a text field's, deleting to the end of the line.
  { id: 'ui.commandList', group: 'general', keys: 'Mod+KeyK', strictMod: true, once: true, menu: 'commandList', label: words('commandList'),
    where: (ctx) => shut(ctx) && !document.querySelector('dialog[open]'), run: ({ workspace }) => { workspace.commandListOpen = true; } },
  fixed('general.dialogChoices', 'general', words('dialogChoices'), { shown: ['↑ ↓'] }),

  { ...fixed('drawing.holdAlt', 'drawing', words('holdAlt'), { shown: () => [t('shortcuts.holdKey', { key: shortcut('alt') })] }), held: true },
  { ...fixed('drawing.holdAltShift', 'drawing', words('holdAltShift'), { shown: () => [t('shortcuts.holdKey', { key: shortcut('alt', 'shift') })] }), held: true },
  { ...fixed('drawing.holdSpace', 'drawing', words('holdSpace'), { shown: () => [t('shortcuts.holdSpace')] }), held: true },
  // ] and [ grow and shrink the tool's Size a whole step, within the slider's range, as in Photoshop.
  { id: 'drawing.sizeDown', group: 'drawing', keys: '[', label: words('size'), ...sized(-1) },
  { id: 'drawing.sizeUp', group: 'drawing', keys: ']', label: words('size'), ...sized(1) },

  // About the view's middle (EditorViewport), in place of the browser's page zoom.
  { id: 'view.zoomIn', group: 'view', keys: ['Mod++', 'Mod+='], shown: () => [keyLabel('Mod++')], label: words('zoomInOut'), ...zoom(2, 'menu.zoomIn') },
  { id: 'view.zoomOut', group: 'view', keys: ['Mod+-', 'Mod+_'], shown: () => [keyLabel('Mod+-')], label: words('zoomInOut'), ...zoom(0.5, 'menu.zoomOut') },
  { id: 'view.zoomBack', group: 'view', keys: 'Mod+0', label: words('zoomBack'), ...zoom(0) },
  fixed('view.scrollPage', 'view', words('scrollPage'), { shown: ['Page Up', 'Page Down'] }),
  fixed('view.scrollEnds', 'view', words('scrollEnds'), { keys: { mac: ['Home', 'End', 'Mod+ArrowUp', 'Mod+ArrowDown'], other: ['Home', 'End'] } }),

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
  { id: 'colors.fgPrev', group: 'colors', label: words('stepFg'), ...colorStep('fg', -1, 'ArrowUp') },
  { id: 'colors.fgNext', group: 'colors', label: words('stepFg'), ...colorStep('fg', 1, 'ArrowDown') },
  { id: 'colors.bgPrev', group: 'colors', label: words('stepBg'), ...colorStep('bg', -1, 'ArrowLeft') },
  { id: 'colors.bgNext', group: 'colors', label: words('stepBg'), ...colorStep('bg', 1, 'ArrowRight') },
  fixed('colors.moveSwatches', 'colors', words('moveSwatches'), { shown: [ARROWS] }),
  fixed('colors.pickSwatch', 'colors', words('pickSwatch'), { shown: ['Enter', 'Space'] }),

  fixed('editMode.moveCursor', 'editMode', words('moveCursor'), { shown: [ARROWS] }),
  fixed('editMode.selectFromCursor', 'editMode', words('selectFromCursor'), { shown: shiftArrows }),
  fixed('editMode.homeEnd', 'editMode', words('homeEnd'), { keys: ['Home', 'End'] }),
  fixed('editMode.nextLine', 'editMode', words('nextLine'), { keys: 'Enter' }),
  fixed('editMode.erase', 'editMode', words('erase'), { keys: ['Backspace', 'Delete'] }),
  fixed('editMode.insertOverwrite', 'editMode', words('insertOverwrite'), { keys: ['Insert', 'Alt+Enter'] }),
  fixed('editMode.typeFKey', 'editMode', words('typeFKey'), { shown: ['F1–F12'] }),
  fixed('editMode.grabFKey', 'editMode', words('grabFKey'), { shown: () => [shortcut('ctrl', 'shift', 'F1–F12')] }),
  { id: 'characters.setPrev', group: 'editMode', keys: 'Ctrl+Comma', label: words('prevNextPalette'), ...charSet(-1) },
  { id: 'characters.setNext', group: 'editMode', keys: 'Ctrl+Period', label: words('prevNextPalette'), ...charSet(1) },
  // Moebius's lines and columns, on the picked layer at the cursor (useTextTool, by textKeyAction).
  lines('edit.insertLine', 'insertLine', 'Alt+ArrowUp', 'line', 1),
  lines('edit.deleteLine', 'deleteLine', 'Alt+ArrowDown', 'line', -1),
  lines('edit.insertColumn', 'insertColumn', 'Alt+ArrowRight', 'column', 1),
  lines('edit.deleteColumn', 'deleteColumn', 'Alt+ArrowLeft', 'column', -1),
  // Alt+← and Alt+→ anywhere else the art shows: nothing, so Windows and Linux don't go Back or Forward out of the editor.
  { id: 'edit.altArrowsElsewhere', group: 'editMode', keys: ['Alt+ArrowLeft', 'Alt+ArrowRight'], label: words('altArrowsElsewhere'), hidden: true,
    where: backKept, run: () => {} },

  fixed('select.all', 'select', words('selectAll'), { keys: 'Mod+A' }),
  fixed('select.copyCutPaste', 'select', words('copyCutPaste'), { keys: ['Mod+C', 'Mod+X', 'Mod+V'] }),
  fixed('select.nudge', 'select', words('nudge'), { shown: [ARROWS] }),
  fixed('select.growShrink', 'select', words('growShrink'), { shown: shiftArrows }),
  fixed('select.delete', 'select', words('deleteSelection'), { keys: ['Delete', 'Backspace', 'E'] }),
  fixed('select.stamp', 'select', words('stamp'), { keys: ['S', 'C'] }),
  fixed('select.deselect', 'select', words('deselect'), { shown: ['Esc', 'Enter'] }),

  fixed('vector.penEnd', 'vector', words('penEnd'), { shown: ['Enter', 'Esc'] }),
  fixed('vector.penBack', 'vector', words('penBack'), { keys: 'Backspace' }),
  fixed('vector.nudge', 'vector', words('vectorNudge'), { shown: [ARROWS] }),
  fixed('vector.delete', 'vector', words('vectorDelete'), { keys: ['Delete', 'Backspace'] }),
  fixed('vector.esc', 'vector', words('vectorEsc'), { shown: ['Esc'] }),

  // L plays and pauses, comma and period step, N adds a frame of the showing one's kind (held, it goes on adding them).
  { id: 'animation.play', group: 'animation', keys: letter(PLAY_KEY), shown: [PLAY_KEY.toUpperCase()], label: words('playPause'), once: true,
    where: (ctx) => animating(ctx), run: () => usePlayback().toggle() },
  { id: 'animation.prevFrame', group: 'animation', keys: [',', 'Alt+Comma'], shown: [','], label: frameWords, title: said('animation.prevFrame'),
    where: animating, run: stepFrame(-1) },
  { id: 'animation.nextFrame', group: 'animation', keys: ['.', 'Alt+Period'], shown: ['.'], label: frameWords, title: said('animation.nextFrame'),
    where: animating, run: stepFrame(1) },
  { id: 'animation.newFrame', group: 'animation', keys: letter(ADD_FRAME_KEY), shown: [ADD_FRAME_KEY.toUpperCase()], label: words('newFrame'),
    where: (ctx) => animating(ctx), run: ({ project }) => project.addFrame(project.currentFrame.kind) },

  fixed('tabs.switch', 'tabs', words('switchTabs'), { shown: ['← →'] }),

  // Panels, by the words of their tabs and buttons.
  { id: 'panels.layers', group: 'panels', label: said('sidePanel.layers'),
    run: ({ workspace }) => { workspace.toggleSidePanel(true); workspace.sidePanelTab = 'layers'; } },
  { id: 'panels.social', group: 'panels', label: said('sidePanel.social'), run: ({ workspace }) => workspace.showSocial() },
  { id: 'panels.plugins', group: 'panels', label: said('menu.plugins'), run: ({ workspace }) => { workspace.pluginsOpen = true; } },
  // Each plugin picked from a file or folder read again, as each one's Reload in Plugins.
  { id: 'panels.reloadPlugins', group: 'panels', label: said('shortcuts.commands.reloadPlugins'),
    available: () => (linkedPlugins().length ? true : 'shortcuts.reasons.noLinkedPlugins'),
    run: () => Promise.all(linkedPlugins().map(({ id }) => usePluginStore().reload(id))) },
  { id: 'panels.pluginsOff', group: 'panels', label: said('menu.startPluginsOff'), run: () => reloading.withPluginsOff() },

  // The File menu's (ProjectActions' buttons): New and Versions are off while drawing with others, as their buttons are.
  { id: 'file.new', group: 'file', label: said('actions.newProject'), available: alone, run: ({ workspace }) => workspace.newProject() },
  { id: 'file.versions', group: 'file', label: said('actions.versions'), available: alone,
    run: ({ workspace }) => { workspace.versionsOpen = true; } },
  // Export with its format chosen, one row for each (Export… is file.export). The animated ones only with Animate on and
  // frames to animate, as Export offers them.
  ...EXPORT_FORMATS.map((format) => ({
    id: `file.export.${format.id}`, group: 'file', label: said(`save.formats.${format.id}.title`),
    where: () => format.id !== 'mp4' || canExportVideo(),
    available: (ctx) => {
      const drawing = drawn(ctx);
      return drawing !== true || !format.animated || (ctx.project.hasFrames && ctx.project.animate) ? drawing : 'shortcuts.reasons.notAnimated';
    },
    run: ({ workspace }) => { workspace.exportModal = format.id; },
  })),
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

// Cmd or Ctrl on every platform: the chords have always taken either, so Ctrl+Z undoes on a Mac and Cmd+Z elsewhere. A
// strictMod row's is the platform's own.
const keyMatches = (e, key, strict, mac) => (strict ? matches(e, key, { mac }) : matches(e, key, { mac: true }) || matches(e, key, { mac: false }));

// The first of ids (a trailing * takes a prefix: 'tool.*') whose key this is and whose where holds takes the key: its
// default prevented, then it runs when available (a held key's repeat with once runs nothing). True when taken. An Alt
// chord that runs lets an Alt-held eyedropper go first, so a chord that changes the view or the layer doesn't hand it back
// to the wrong one.
export function takeKey(event, ctx, ids, { mac = isMac } = {}) {
  const pool = ids.some((id) => id.startsWith('tool.')) ? [...COMMANDS, ...toolCommands(ctx.view, ctx.project)] : COMMANDS;
  for (const id of ids) {
    const prefix = id.endsWith('*') ? id.slice(0, -1) : null;
    const command = pool.find((c) => c.run && !c.fixed && (prefix ? c.id.startsWith(prefix) : c.id === id)
      && keysFor(c.keys).some((key) => keyMatches(event, key, c.strictMod, mac)) && (!c.where || c.where(ctx)));
    if (!command) continue;
    event.preventDefault();
    if (command.hidden || (event.repeat && command.once) || (command.available?.(ctx) ?? true) !== true) return true;
    if (event.altKey && ctx.workspace.heldTool?.by === 'alt') ctx.workspace.releaseTool();
    command.run(ctx);
    return true;
  }
  return false;
}

// A command run by name (the command list, the desktop menu): no key pressed, so its where is asked of a key that's
// nobody's (no field has it, no modifier held) and not typing, which leaves the view and the state it asks about.
export const commandContext = (project, workspace) => ({
  project, workspace, event: new KeyboardEvent('keydown'), view: workspace.editorTab, typing: false, uncommitted: false,
});

// The commands the list offers here: every row with a run whose where holds, the view's tools too, never a hidden one.
export const listedCommands = (ctx) => [...COMMANDS, ...toolCommands(ctx.view, ctx.project)]
  .filter((c) => c.run && !c.hidden && (!c.where || c.where(ctx)));

// Run it by id if it may run now (its where holds and it's available), giving what its run gives (a save's promise).
export function runCommand(id, ctx) {
  const command = listedCommands(ctx).find((c) => c.id === id);
  if (command && (command.available?.(ctx) ?? true) === true) return command.run(ctx);
}

// The command list shut (App.vue), with a command chosen or none: the list goes and focus goes back where it was (the
// list hands it back as it goes), then the command runs, so a dialog it opens opens over nothing. It's kept as recent.
export async function chooseCommand(id, project, workspace) {
  workspace.commandListOpen = false;
  await nextTick();
  if (!id) return;
  recentCommands.add(id);
  return runCommand(id, commandContext(project, workspace));
}
