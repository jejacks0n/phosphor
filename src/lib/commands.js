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
//   available  (ctx) => true, or why it can't run now: an i18n key, or [key, values] (offReasons.js; reasonWords says it)
//   run        (ctx) => what it does
//   held       a fixed key that works while held down (Alt for the eyedropper, Space for the hand)
//   once       a held key's repeats are taken and do nothing (without it they run again, as a held Cmd+Z does)
//   hidden     a key taken to keep it from the browser that does nothing: left out of the ? list and the command list
//   strictMod  Mod is only the platform's own (Cmd on a Mac), not Cmd or Ctrl as for the others
//   tool       a tool's row (toolCommands): its id, so its key with the tool chosen steps the kind instead (takeKey)
// A row with a run and no keys is the command list's alone (New project, Export .ans), and the ? list leaves it out.
// ctx = { project, workspace, event, view: workspace.editorTab, typing: Edit Mode's typing, uncommitted: focus is in a
// field holding typing it hasn't committed (its own undo has it), linux: a test's stand-in for the platform (isLinux) }.
import { markRaw, nextTick } from 'vue';
import { t, te } from '@/i18n/index.js';
import { isMac, shortcut } from '@/lib/keyLabels';
import { keyLabel, keysFor, matches } from '@/lib/keymap';
import { ownsKey } from '@/lib/fields';
import { ADD_FRAME_KEY, DRAW_WITH_KEY, PLAY_KEY, SWAP_COLORS_KEY, keptFromBrowser, typingKeepsAltU } from '@/lib/TextKeys';
import { getTool, offeredTools, optionValue, setOptionValue } from '@/tools';
import { usePlayback } from '@/composables/usePlayback';
import { stepColor } from '@/composables/colorSteps';
import { flipAtCursor, lineStep, typingNow, typingTakesKeys } from '@/composables/useTextTool';
import { pickedCell } from '@/store/project/reading.js';
import { usePaletteStore } from '@/store/PaletteStore';
import { useVectorStyle } from '@/composables/useVectorStyle.js';
import { useDrawingStore } from '@/store/DrawingStore';
import { usePluginStore } from '@/store/PluginStore';
import { EXPORT_FORMATS } from '@/document/projectIO';
import { canExportVideo } from '@/lib/VideoFile';
import { recentCommands } from '@/lib/recentCommands';
import { addOff, artLayerEmpty, artLayerOff, bakeOff, dimensionsOff, flattenOff, pausedOff, reasonWords } from '@/lib/offReasons';
import { useMergeDown } from '@/composables/useMergeDown';
import { duplicateShapes } from '@/composables/vectorClipboard.js';
import { toast } from '@/composables/useToast';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { MAX_ANIMATION_CELLS } from '@/lib/Cells';
import { formatNumber } from '@/i18n/format';

export { reasonWords };
const DESKTOP = import.meta.env.VITE_DESKTOP === '1';

export const GROUPS = ['general', 'tools', 'drawing', 'view', 'colors', 'editMode', 'select', 'vector', 'animation', 'tabs',
  'layers', 'panels', 'file', 'drawingCommands', 'rooms'];

const said = (path, values) => Object.assign(() => t(path, values?.()), { path });
const words = (key, values) => said(`shortcuts.rows.${key}`, values);
const free = ({ event }) => !ownsKey(event.target, event); // not a key a field (or a menu, a slider) has
const shut = ({ workspace }) => !workspace.paletteLayerOpen && !workspace.colorBox; // the character palette and the color box have the keys
const ART = ['input', 'output']; // PIXEL and ANSI
const letter = (key) => [key.toUpperCase(), `Shift+${key.toUpperCase()}`]; // with Shift or without

// The chosen tool's first option with a mark (tools/index.js: size, kind, drawWith, amount, hardness) that the toolbar
// shows in this view.
const markedOption = (mark, { workspace, view }) => getTool(workspace.activeTool).options
  ?.find((o) => o[mark] && (!o.views || o.views.includes(view)) && (!o.when || o.when(workspace)));

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
// typing too, but not mid-stroke (one stroke draws in one color). Moebius's Ctrl+arrows; a Mac keeps those for Spaces, so there they take Option too (and Ctrl+Option is
// bound on a Mac only: elsewhere it's AltGr, which types).
const colorStep = (slot, delta, arrow) => ({
  title: said(`shortcuts.commands.${slot}${delta < 0 ? 'Prev' : 'Next'}`),
  keys: { mac: [`Ctrl+Alt+${arrow}`], other: [`Ctrl+${arrow}`] },
  where: (ctx) => free(ctx) && !!ctx.project.image && ART.includes(ctx.view) && shut(ctx) && !ctx.workspace.isPainting
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

// Alt+U and Shift+Alt+U: the colors of the cell at Edit Mode's cursor, or else of the one under the pointer, set as the
// Picker sets them (and with Shift the character too); in PIXEL, where a pixel has one color, the pixel's as the
// foreground, with Shift the background. Typing too, but not on a Mac for now, where Option+U is the umlaut's dead key
// (TextKeys.js's MAC_TYPES_OPTION_U): the command list has them there.
const cellToTake = ({ workspace }) => (typingNow(workspace) ? workspace.textCursor : workspace.pointerCell);
const takeUnder = (withChar) => ({
  where: (ctx) => art(ctx) && ART.includes(ctx.view) && free(ctx) && shut(ctx) && !ctx.workspace.isPainting
    && !(ctx.typing && typingKeepsAltU()),
  available: (ctx) => (cellToTake(ctx) ? true : 'shortcuts.reasons.noCell'),
  run: (ctx) => {
    const { project, workspace } = ctx, cell = cellToTake(ctx);
    if (ctx.view === 'input') workspace.pickColor(withChar ? 'bg' : 'fg', project.rawColorAt(cell.col, cell.y));
    else {
      const picked = pickedCell(project, cell);
      workspace.pickColor('fg', picked.fg, picked.fgIndex);
      workspace.pickColor('bg', picked.bg, picked.bgIndex);
      if (withChar) workspace.activeChar = picked.char;
    }
    workspace.endPick(); // the old and new colors into the recent colors
  },
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

// The tools' option keys: where the art and the toolbar show, not typing, not mid-drag, with the option marked so.
const optionKey = (mark) => (ctx) => free(ctx) && !!ctx.project.image && ctx.workspace.editMode && !ctx.typing
  && [...ART, 'vector'].includes(ctx.view) && !ctx.workspace.isPainting && shut(ctx) && !!markedOption(mark, ctx);
// A slider's value as its slider sets it: within its range, to its places, committed as a key's nudge is (an option over
// VECTOR's selected shapes holds its edit open as a run, one undo step).
const setSlider = (workspace, option, value) => {
  const round = 10 ** (option.decimals ?? 0);
  setOptionValue(workspace, option, Math.min(option.max, Math.max(option.min, Math.round(value * round) / round)));
  option.commit?.({ nudge: true });
};
// A segmented row's or a dropdown's next or previous choice from the one the toolbar shows, past those it hides, wrapping.
const stepChoice = (mark, by) => (ctx) => {
  const { workspace, view } = ctx, option = markedOption(mark, ctx);
  const choices = option.choices.filter((c) => (!c.when || c.when(workspace)) && (!c.views || c.views.includes(view)));
  const at = choices.findIndex((c) => c.value === (option.drawn?.(workspace) ?? optionValue(workspace, option)));
  const next = at < 0 ? (by > 0 ? 0 : choices.length - 1) : (at + by + choices.length) % choices.length;
  setOptionValue(workspace, option, choices[next].value);
};

// ] and [ grow and shrink the tool's Size a whole step (on VECTOR, a polygon's Sides), as in Photoshop. Not with Shift
// on the bracket keys, which is the hardness's even where ] carries it; a layout that types [ or ] with Shift on
// another key keeps them.
const sized = (by) => ({
  title: said(`shortcuts.commands.${by < 0 ? 'sizeDown' : 'sizeUp'}`),
  where: (ctx) => optionKey('size')(ctx) && !(ctx.event.shiftKey && /^Bracket/.test(ctx.event.code)),
  run: (ctx) => {
    const option = markedOption('size', ctx);
    setSlider(ctx.workspace, option, optionValue(ctx.workspace, option) + by);
  },
});
// The digits set the tool's amount, as in Photoshop: a digit in tens (0 is 100), and a second within a second the two
// exactly (4 then 5 is 45, 0 then 5 is 5). The first is kept with its option, so one on another tool's starts again. The
// command list has no key to read a digit from, so it hasn't the row.
const DIGIT_JOINS = 1000; // ms
let firstDigit = null; // { digit, at, key }
const amount = {
  where: (ctx) => /^Digit\d$/.test(ctx.event.code) && optionKey('amount')(ctx),
  run: (ctx) => {
    const option = markedOption('amount', ctx), digit = Number(ctx.event.code.slice(5)), now = Date.now();
    const first = firstDigit?.key === option.key && now - firstDigit.at < DIGIT_JOINS ? firstDigit.digit : null;
    firstDigit = first === null ? { digit, at: now, key: option.key } : null;
    setSlider(ctx.workspace, option, first === null ? (digit || 10) * 10 : first * 10 + digit);
  },
};
// Shift+[ and Shift+]: the hardness a step of 10, or a Hard and Soft row (hardest first) set to its end.
const hardness = (by) => ({
  title: said(`shortcuts.commands.${by < 0 ? 'softer' : 'harder'}`),
  where: optionKey('hardness'),
  run: (ctx) => {
    const { workspace } = ctx, option = markedOption('hardness', ctx);
    if (option.type === 'segmented') setOptionValue(workspace, option, option.choices.at(by > 0 ? 0 : -1).value);
    else setSlider(workspace, option, optionValue(workspace, option) + 10 * by);
  },
});
const drawWith = (by) => ({
  title: said(`shortcuts.commands.${by < 0 ? 'drawWithPrev' : 'drawWithNext'}`), once: true,
  where: optionKey('drawWith'), run: stepChoice('drawWith', by),
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

// The command list's rows for buttons: a reason the button gives (offReasons.js), or true.
const ok = (reason) => reason ?? true;
const art = (ctx) => !!ctx.project.image && ctx.workspace.editMode; // the toolbar and LAYERS show
const picked = ({ workspace }) => workspace.shownPick; // the row LAYERS shows picked
// LAYERS has the picked row (on VECTOR before its first shape, the vector layer it will bring isn't there yet).
const onPick = (ctx) => art(ctx) && !!ctx.project.layerById(picked(ctx));
const layerWords = (key) => said('shortcuts.commands.layer', () => ({ action: t(key) }));
const notBase = (ctx) => (picked(ctx) === 'base' ? 'shortcuts.reasons.baseLayer' : null); // the base has no ⋯ menu
const hiddenPick = (ctx) => !!ctx.project.layerById(picked(ctx))?.hidden;
// Alt+] and Alt+[: the row above or below the picked one in LAYERS, picked as a click picks it, stopping at the ends (a
// row that's off refuses, and it's the bottom one). While typing, vector layers are passed, so the view stays ANSI and
// the cursor placed: asked of the workspace, as the command list runs it with no typing.
const stepLayer = (by) => ({
  where: (ctx) => art(ctx) && free(ctx) && shut(ctx) && !ctx.workspace.isPainting,
  run: ({ project, workspace }) => {
    const typing = typingNow(workspace);
    const layers = project.layers, from = layers.findIndex((layer) => layer.id === workspace.shownPick);
    if (from < 0) return; // VECTOR's pick before its first shape: the vector layer it will bring isn't a row yet
    for (let at = from + by; layers[at]; at += by) {
      if (!(typing && layers[at].kind === 'vector')) return workspace.pickLayer(layers[at].id);
    }
  },
});
// Shift+Alt+N and Shift+Alt+V: LAYERS' Add layer and Add vector layer, off as they are. Not while typing (Option's ˜ and ◊
// type there), and once a press.
const newLayer = (kind) => ({
  once: true,
  where: (ctx) => art(ctx) && free(ctx) && shut(ctx) && !ctx.typing && !ctx.workspace.isPainting,
  available: ({ project }) => ok(addOff(project, useDrawingStore())),
  run: ({ workspace }) => workspace.addLayerAbovePick(kind),
});
// VECTOR's buttons for the selected shapes.
const chosenShapes = ({ project, workspace }) => workspace.vectorSelected.filter((key) => project.shapes.has(key));
const onShapes = (id, key, run) => ({
  id, group: 'vector', label: said('shortcuts.commands.shapes', () => ({ action: t(key) })),
  where: (ctx) => art(ctx) && ctx.view === 'vector', available: (ctx) => (chosenShapes(ctx).length ? true : 'shortcuts.reasons.noShapes'), run,
});
const restack = (direction) => (ctx) => ctx.project.restackShapes(chosenShapes(ctx), direction);
// A room's: in one (a host's own, with host), or out of one to start or join another.
const inRoom = (host) => () => {
  const { role } = useRoomStore();
  return !role ? 'shortcuts.reasons.notInRoom' : host && role !== 'host' ? 'shortcuts.reasons.notHost' : true;
};
// Alt+1–4: the editor's tabs, in EditTabs' order, chosen as a click chooses one (its v-model: the router follows), when
// it shows and is on. Not while typing (Option's digits type on a Mac), mid-stroke, or over a dialog, but everywhere
// else, SAUCE and ROOM too, and taken there even when the tab isn't: Alt+4 out of a room does nothing. TAB_KEYS is
// where they live: should Linux's browsers switch their tab despite the preventDefault, the rows' keys become
// { mac, other, linux } there (Ctrl+Alt+1–4 on Linux, keysFor learning the platform), and the ? list follows.
const overNothing = (ctx) => shut(ctx) && !document.querySelector('dialog[open]');
const TAB_KEYS = ['Alt+Digit1', 'Alt+Digit2', 'Alt+Digit3', 'Alt+Digit4'];
const tabRow = (id, n, label, ids) => ({
  id, group: 'tabs', keys: TAB_KEYS[n - 1], label: words(label), once: true,
  where: (ctx) => !ctx.typing && free(ctx) && overNothing(ctx) && !ctx.workspace.isPainting,
  available: ({ project, workspace }) => {
    const tab = workspace.shownTabs(project, useRoomStore()).find((shown) => ids.includes(shown.id));
    if (tab) return tab.disabled ? 'shortcuts.reasons.noDrawing' : true;
    return id === 'tab.room' ? 'shortcuts.reasons.notWatching' : 'shortcuts.reasons.vectorPicked';
  },
  run: ({ project, workspace }) => {
    workspace.editorTab = workspace.shownTabs(project, useRoomStore()).find((shown) => ids.includes(shown.id)).id;
  },
});
// Alt+T: the side panel on SOCIAL, with focus kept to come back to; in a room the cursor in the chat box (a guest's "Sign
// in to chat", someone without a box the tab), out of one on the lobby's first control. In the box, Alt+T goes back, as
// its Escape does (ChatFoot): the one field it works in, typing or not, as typing doesn't take a field's keys.
const CHAT_BOX = 'aside.chat footer textarea';
const inChatBox = ({ event }) => !!event.target?.matches?.(CHAT_BOX);
const toChat = {
  where: (ctx) => (inChatBox(ctx) || (!ctx.typing && free(ctx))) && overNothing(ctx) && !ctx.workspace.isPainting,
  run: async (ctx) => {
    const { workspace } = ctx;
    if (inChatBox(ctx)) return workspace.leaveChat();
    const from = document.activeElement;
    workspace.chatReturn = from ? markRaw(from) : null;
    workspace.showSocial();
    await nextTick();
    if (document.querySelector('dialog[open]')) return; // SOCIAL's first question, say: the dialog has focus
    (document.querySelector(`${CHAT_BOX}, aside.chat footer button.sign-in`)
      ?? document.querySelector('.side-panel section.lobby :is(button, input, select, textarea, a[href]):not(:disabled)')
      ?? document.querySelector('.side-panel [role=tab][aria-selected=true]'))?.focus();
  },
};
const outOfRoom = () => (useRoomStore().role ? 'shortcuts.reasons.inRoom' : true);
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
    where: overNothing, run: ({ workspace }) => { workspace.commandListOpen = true; } },
  fixed('general.dialogChoices', 'general', words('dialogChoices'), { shown: ['↑ ↓'] }),

  { ...fixed('drawing.holdAlt', 'drawing', words('holdAlt'), { shown: () => [t('shortcuts.holdKey', { key: shortcut('alt') })] }), held: true },
  { ...fixed('drawing.holdAltShift', 'drawing', words('holdAltShift'), { shown: () => [t('shortcuts.holdKey', { key: shortcut('alt', 'shift') })] }), held: true },
  { ...fixed('drawing.holdSpace', 'drawing', words('holdSpace'), { shown: () => [t('shortcuts.holdSpace')] }), held: true },
  // ] and [ grow and shrink the tool's Size a whole step, within the slider's range, as in Photoshop.
  { id: 'drawing.sizeDown', group: 'drawing', keys: '[', label: words('size'), ...sized(-1) },
  { id: 'drawing.sizeUp', group: 'drawing', keys: ']', label: words('size'), ...sized(1) },
  // The tool's own keys: its key again steps its kind (takeKey), D and Shift+D its Draw with, a digit its amount,
  // Shift+[ and Shift+] its hardness, by code, whatever Shift makes those keys type ({ and } on a US layout).
  fixed('tool.kindNext', 'drawing', words('kindNext'), { shown: () => [t('shortcuts.keyAgain')] }),
  { id: 'tool.drawWithNext', group: 'drawing', keys: DRAW_WITH_KEY.toUpperCase(), label: words('drawWith'), ...drawWith(1) },
  { id: 'tool.drawWithPrev', group: 'drawing', keys: `Shift+${DRAW_WITH_KEY.toUpperCase()}`, label: words('drawWith'), ...drawWith(-1) },
  { id: 'tool.amount', group: 'drawing', keys: [...'0123456789'].map((n) => `Digit${n}`), shown: ['0–9'], label: words('amount'), once: true, ...amount },
  { id: 'tool.softer', group: 'drawing', keys: 'Shift+BracketLeft', label: words('hardness'), ...hardness(-1) },
  { id: 'tool.harder', group: 'drawing', keys: 'Shift+BracketRight', label: words('hardness'), ...hardness(1) },

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
  // VECTOR the shapes' Fill and Stroke trade places. Run by name (no key: the command list), as X outside typing.
  { id: 'colors.swap', group: 'colors', keys: [SWAP_COLORS_KEY.toUpperCase(), 'Shift+Mod+KeyX'], label: words('swapColors'),
    where: (ctx) => free(ctx) && ctx.workspace.editMode && (ctx.event.shiftKey
      ? !!ctx.project.image && !ctx.workspace.paletteLayerOpen
      : !ctx.event.key || ctx.workspace.activeTool !== 'text'),
    run: ({ workspace, view }) => (view === 'vector' ? useVectorStyle().swap() : workspace.swapColors()) },
  { id: 'colors.fgPrev', group: 'colors', label: words('stepFg'), ...colorStep('fg', -1, 'ArrowUp') },
  { id: 'colors.fgNext', group: 'colors', label: words('stepFg'), ...colorStep('fg', 1, 'ArrowDown') },
  { id: 'colors.bgPrev', group: 'colors', label: words('stepBg'), ...colorStep('bg', -1, 'ArrowLeft') },
  { id: 'colors.bgNext', group: 'colors', label: words('stepBg'), ...colorStep('bg', 1, 'ArrowRight') },
  { id: 'colors.takeUnder', group: 'colors', keys: 'Alt+KeyU', label: words(typingKeepsAltU() ? 'takeUnderMac' : 'takeUnder'), ...takeUnder(false) },
  { id: 'colors.takeUnderWithChar', group: 'colors', keys: 'Shift+Alt+KeyU', label: words(typingKeepsAltU() ? 'takeUnderWithCharMac' : 'takeUnderWithChar'),
    ...takeUnder(true) },
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
  // Alt+X: the cursor's cell flipped as the Flip tool flips it (Option+X's ≈ gives way), in the ANSI art style alone.
  { id: 'edit.flipCell', group: 'editMode', keys: 'Alt+KeyX', label: words('flipCell'), once: true,
    where: (ctx) => art(ctx) && typingNow(ctx.workspace) && free(ctx) && shut(ctx),
    available: ({ project }) => (project.renderStyle === 'ansi' ? true : 'shortcuts.reasons.ansiOnly'),
    run: ({ project, workspace }) => flipAtCursor(project, workspace) },
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
  tabRow('tab.picture', 1, 'tabPicture', ['input', 'vector']),
  tabRow('tab.ansi', 2, 'tabAnsi', ['output']),
  tabRow('tab.sauce', 3, 'tabSauce', ['sauce']),
  tabRow('tab.room', 4, 'tabRoom', ['room']),
  // On Linux, where the browser would switch its own tabs, the four wherever the rows above don't take them (typing,
  // mid-stroke, with the color box open): taken, and nothing. Typing gives them up there (TextKeys.js).
  { id: 'tab.keptFromBrowser', group: 'tabs', keys: TAB_KEYS, label: words('tabsKeptFromBrowser'), hidden: true,
    where: (ctx) => keptFromBrowser(ctx.event, ctx.linux) && free(ctx), run: () => {} },

  // Panels, by the words of their tabs and buttons.
  { id: 'panels.layers', group: 'panels', label: said('sidePanel.layers'),
    run: ({ workspace }) => { workspace.toggleSidePanel(true); workspace.sidePanelTab = 'layers'; } },
  { id: 'panels.social', group: 'panels', keys: 'Alt+KeyT', once: true, label: words('social'), title: said('sidePanel.social'), ...toChat },
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

  // The drawing's: the toolbar's buttons where it shows (Bake and Flatten ask first as their buttons do: the workspace
  // holds the question, EditToolbar asks it), and the settings'.
  { id: 'drawing.bake', group: 'drawingCommands', label: said('toolbar.bake'), where: art,
    available: ({ project }) => ok(bakeOff(project, useDrawingStore())), run: ({ workspace }) => workspace.bake() },
  { id: 'drawing.flatten', group: 'drawingCommands', label: said('toolbar.flatten'), where: art,
    available: ({ project }) => ok(flattenOff(project, useDrawingStore())), run: ({ workspace }) => { workspace.flattening = true; } },
  // The toolbar's Merge down: the picked layer, or on VECTOR the selected shapes. Into the base it asks how (exactly, or
  // into the image), so Blend into source image is that question's.
  { id: 'drawing.mergeDown', group: 'drawingCommands', label: said('toolbar.mergeDown'), where: art,
    available: ({ workspace }) => {
      const merge = useMergeDown();
      return ok(merge.offWhy(workspace.pickedLayer) ?? (merge.hasAny(workspace.pickedLayer) ? null : 'shortcuts.reasons.nothingToMerge'));
    },
    run: ({ workspace }) => useMergeDown().mergePicked(workspace) },
  // Dimensions, as the settings and the field lock it.
  { id: 'drawing.canvasSize', group: 'drawingCommands', label: said('settings.cols.label'),
    available: (ctx) => ok(drawn(ctx) !== true ? drawn(ctx) : dimensionsOff(ctx.project, useDrawingStore())),
    run: ({ workspace }) => { workspace.dimensionsRequest++; } },
  // The Animate switch (EditTabs): turned on as it allows, off always.
  { id: 'drawing.animate', group: 'drawingCommands', label: said('tabs.animate'),
    available: ({ project }) => {
      if (project.animate) return true;
      if (project.inRoom) return 'tabs.animateInRoom';
      if (!project.canAnimate) return ['tabs.animateTooLargeTitle', { max: formatNumber(MAX_ANIMATION_CELLS) }];
      return project.image ? true : 'tabs.animateNeedArt';
    },
    run: ({ project }) => {
      usePlayback().pause();
      project.setAnimate(!project.animate);
    } },
  { id: 'drawing.font', group: 'drawingCommands', label: said('font.manage'), run: ({ workspace }) => workspace.openFonts() },

  // The layers': LAYERS' ⋯ menu's on the picked row, and the selection's Make art layer.
  { id: 'layer.makeArt', group: 'layers', label: said('art.make'), where: (ctx) => art(ctx) && ART.includes(ctx.view),
    available: ({ project, workspace }) => ok(artLayerOff(project)
      ?? (workspace.selection || (workspace.activeTool === 'wand' && workspace.wand) ? null : ['toolbar.selection.selectFirstTitle', { action: t('art.make') }])
      ?? artLayerEmpty(project, workspace)),
    run: ({ project }) => project.makeArtLayer() },
  { id: 'layer.rename', group: 'layers', label: layerWords('layers.rename'), where: onPick, available: () => ok(pausedOff(useDrawingStore())),
    run: ({ workspace }) => {
      workspace.showLayers();
      workspace.renameRequest = workspace.shownPick; // LayersList turns the row into its box
    } },
  { id: 'layer.duplicate', group: 'layers', label: layerWords('layers.duplicate'), where: onPick,
    available: (ctx) => ok(notBase(ctx) ?? addOff(ctx.project, useDrawingStore())), run: (ctx) => ctx.project.duplicateLayer(picked(ctx)) },
  { id: 'layer.delete', group: 'layers', label: layerWords('layers.delete'), where: onPick,
    available: (ctx) => ok(notBase(ctx) ?? pausedOff(useDrawingStore())), run: (ctx) => ctx.workspace.removeLayer(picked(ctx)) },
  // The base row picked, as a click picks it (off for an artist, and inside an art layer).
  { id: 'layer.pickBase', group: 'layers', label: layerWords('layers.pickBase'), where: art,
    available: ({ project }) => (useDrawingStore().mayDraw ? 'social.drawing.onlyHost' : project.artInside ? 'art.baseOff' : true),
    run: ({ workspace }) => workspace.pickLayer('base') },
  // The picked row's eye: Hide while it shows, Show while it's hidden.
  { id: 'layer.hide', group: 'layers', label: layerWords('layers.hide'), where: (ctx) => onPick(ctx) && !hiddenPick(ctx),
    run: (ctx) => ctx.project.setLayerHidden(picked(ctx), true) },
  { id: 'layer.show', group: 'layers', label: layerWords('layers.show'), where: (ctx) => onPick(ctx) && hiddenPick(ctx),
    run: (ctx) => ctx.project.setLayerHidden(picked(ctx), false) },
  { id: 'layer.above', group: 'layers', keys: 'Alt+BracketRight', label: words('layerAboveBelow'), title: said('shortcuts.commands.layerAbove'), ...stepLayer(1) },
  { id: 'layer.below', group: 'layers', keys: 'Alt+BracketLeft', label: words('layerAboveBelow'), title: said('shortcuts.commands.layerBelow'), ...stepLayer(-1) },
  { id: 'layer.newCells', group: 'layers', keys: 'Shift+Alt+KeyN', label: said('layers.addCells'), ...newLayer('cells') },
  { id: 'layer.newVector', group: 'layers', keys: 'Shift+Alt+KeyV', label: said('layers.addVector'), ...newLayer('vector') },

  // VECTOR's: the stacking order (Forward and Back as their buttons, and to the front or back of the layer), and copies
  // of the selected shapes.
  onShapes('vector.forward', 'vector.forward', restack('forward')),
  onShapes('vector.backward', 'vector.back', restack('back')),
  onShapes('vector.toFront', 'vector.toFront', restack('toFront')),
  onShapes('vector.toBack', 'vector.toBack', restack('toBack')),
  onShapes('vector.duplicate', 'layers.duplicate', ({ project, workspace }) => duplicateShapes(project, workspace)),

  // A room's: the desktop's Room menu and the room's own buttons (RoomMenu, ChatPanel). The menu runs them by id.
  { id: 'rooms.start', group: 'rooms', label: said('social.lobby.startRoom'), available: outOfRoom,
    run: ({ workspace }) => {
      const social = useSocialStore();
      workspace.showSocial();
      // Without what starting needs (a name on the desktop; signed in, confirmed and not silenced on the web), the page
      // that asks for it.
      if (DESKTOP ? social.desktopName : social.signedIn && social.me?.emailVerified !== false && !(social.claims?.silencedUntil > Date.now())) social.page = 'start-room';
    } },
  { id: 'rooms.join', group: 'rooms', label: said('menu.joinRoom'), available: outOfRoom,
    run: ({ workspace }) => {
      workspace.showSocial();
      useSocialStore().page = 'lobby';
    } },
  { id: 'rooms.copyAddress', group: 'rooms', label: said(DESKTOP ? 'social.desktop.copyAddress' : 'common.copyLink'), available: inRoom(true),
    run: async () => { if (await useRoomStore().copyLink()) toast(t(DESKTOP ? 'menu.addressCopied' : 'common.copied')); } },
  { id: 'rooms.stats', group: 'rooms', label: said('social.menu.settingsAndStats'), available: inRoom(true),
    run: ({ workspace }) => {
      workspace.showSocial();
      useRoomStore().statsOpen = true;
    } },
  // End room asks first, as Back past going live does (App's question).
  { id: 'rooms.end', group: 'rooms', label: said('social.host.endRoom'), available: inRoom(true),
    run: async () => {
      const room = useRoomStore();
      if (await room.askToEnd()) room.endRoom();
    } },
  { id: 'rooms.leave', group: 'rooms', label: said('menu.leaveRoom'), where: () => useRoomStore().role !== 'host', available: inRoom(false),
    run: () => useRoomStore().leave() },
  { id: 'rooms.showCursors', group: 'rooms', label: said('social.chat.showCursors'),
    available: ({ project }) => (project._sharing ? true : 'shortcuts.reasons.notSharing'),
    run: () => {
      const drawing = useDrawingStore();
      drawing.showCursors = !drawing.showCursors;
    } },
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
      id: `tool.${tool.id}`, tool: tool.id, group: tool.views.includes('vector') ? 'vector' : 'tools', keys: tool.keys, once: true,
      label: () => (tool.section !== 'plugin' && te(path) ? t(path, { alt: shortcut('alt') }) : tool.title),
      where: toolWhere, run: ({ workspace }) => workspace.setActiveTool(tool.id),
    };
  });
}

// A tool's options as the command list's rows, for those it shows in the view: a checkbox toggled ("Magic Wand:
// Contiguous"), and each choice of a segmented row ("Shapes: Ellipse"), a dropdown and a toggle group ("Magic Wand: Match
// BG") its own. Each holds where the toolbar shows it (its when, a dropdown choice's when), chooses the tool and sets
// the value as the toolbar does. Sliders, a character and a color take a value dragged or typed: not here.
export function optionCommands(tool, view) {
  const rows = [];
  for (const option of tool.options ?? []) {
    if (option.views && !option.views.includes(view)) continue;
    const row = (id, said, value, shows = () => true) => rows.push({
      id: `option.${tool.id}.${id}`, group: 'tools',
      label: () => {
        const [words, choice] = said();
        return t(choice ? 'shortcuts.commands.optionChoice' : 'shortcuts.commands.option', { tool: tool.title, option: words, choice });
      },
      where: (ctx) => toolWhere(ctx) && (!option.when || option.when(ctx.workspace)) && shows(ctx.workspace),
      run: ({ workspace }) => {
        workspace.setActiveTool(tool.id);
        setOptionValue(workspace, option, value(workspace));
      },
    });
    if (option.type === 'checkbox') row(option.key, () => [option.label], (workspace) => !optionValue(workspace, option));
    else if (option.type === 'segmented') for (const choice of option.choices) row(`${option.key}.${choice.value}`, () => [choice.label], () => choice.value);
    else if (option.type === 'dropdown') {
      for (const choice of option.choices) row(`${option.key}.${choice.value}`, () => [option.label, choice.label], () => choice.value, (workspace) => !choice.when || choice.when(workspace));
    } else if (option.type === 'toggles') {
      // As ToggleGroup: a single one lights its choice alone, any other flips it, never leaving none lit.
      for (const toggle of option.options) {
        row(`${option.key}.${toggle.key}`, () => [option.label, toggle.label], (workspace) => {
          const value = optionValue(workspace, option);
          if (option.single) return value[toggle.key] ? value : Object.fromEntries(option.options.map(({ key }) => [key, key === toggle.key]));
          const next = { ...value, [toggle.key]: !value[toggle.key] };
          return Object.values(next).some(Boolean) ? next : value;
        }, () => !toggle.disabled);
      }
    }
  }
  return rows;
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
      && keysFor(c.keys ?? []).some((key) => keyMatches(event, key, c.strictMod, mac)) && (!c.where || c.where(ctx)));
    if (!command) continue;
    event.preventDefault();
    if (command.hidden || (event.repeat && command.once) || (command.available?.(ctx) ?? true) !== true) return true;
    if (event.altKey && ctx.workspace.heldTool?.by === 'alt') ctx.workspace.releaseTool();
    // A tool's key with the tool chosen: its next kind, where it shows one (tool.kindNext). Without, chosen again.
    if (command.tool && command.tool === ctx.workspace.activeTool && markedOption('kind', ctx)) stepChoice('kind', 1)(ctx);
    else command.run(ctx);
    return true;
  }
  return false;
}

// A command run by name (the command list, the desktop menu): no key pressed, so its where is asked of a key that's
// nobody's (no field has it, no modifier held) and not typing, which leaves the view and the state it asks about.
export const commandContext = (project, workspace) => ({
  project, workspace, event: new KeyboardEvent('keydown'), view: workspace.editorTab, typing: false, uncommitted: false,
});

// The commands the list offers here: every row with a run whose where holds, the view's tools and their options too,
// never a hidden one.
export const listedCommands = (ctx) => [...COMMANDS, ...toolCommands(ctx.view, ctx.project),
  ...offeredTools(ctx.view, ctx.project).flatMap((tool) => optionCommands(tool, ctx.view))]
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
