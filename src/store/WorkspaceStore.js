import { markRaw, shallowRef, watch } from 'vue';
import { defineStore } from 'pinia';
import { StorageSerializers, useLocalStorage } from '@vueuse/core';
import { DISPLAY_FONT, DISPLAY_FONTS, DEFAULT_FONT, DEFAULT_FONT_ID } from '@/lib/displayFonts';
import { familyOf } from '@/lib/userFonts';
import { fontId, fontKey } from '@/lib/BitmapFont';
import { clampZoom, clampViewZoom, PIXEL_ZOOM_START } from '@/lib/zoom';
import { measureAdvance } from '@/lib/CellCanvas';
import { charRowsOf } from '@/lib/Cells';
import { loadGuides, saveGuides } from '@/lib/guideStorage';
import { snapCursor } from '@/document/wideChars';
import { savesInPlace } from '@/document/projectIO';
import { isArtFile, readArtFile } from '@/lib/ArtFile';
import { knownBlocksOf } from '@/lib/userFonts';
import { useProjectStore } from '@/store/ProjectStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { usePluginStore } from '@/store/PluginStore';
import { useRoomStore } from '@/store/RoomStore';
import { groupOf } from '@/tools/groups';
import { withKept } from '@/store/kept';
import { snapsLate } from '@/lib/CharResolver';
import { brushOffered, isSolverRef } from '@/plugins/solvers';
import { t } from '@/i18n';
import { toast } from '@/composables/useToast';
import { busyWhile } from '@/composables/useBusy';
import { desktopQuery } from '@/social/config';

const DESKTOP = import.meta.env.VITE_DESKTOP === '1';
let saving = false;   // a save under way (saveFile), where it's not the save dialog's

const RECENT_COLORS = 12;

// A recent color as kept: its hex, with its index after a '/' when a lower index shares its color (16, 231), so 16's
// black and 0's are two recent colors. A list kept before indexes is plain hex, which still reads.
const recentEntry = (hex, index) => (index === undefined ? hex : `${hex}/${index}`);
export function recentColor(entry) {
  const [hex, index] = entry.split('/');
  return { hex, index: index === undefined ? undefined : Number(index) };
}

// The field that holds a tab's tool: PIXEL's, VECTOR's, or ANSI's (which SAUCE and SOCIAL keep).
const toolKey = (tab) => (tab === 'input' ? 'inputActiveTool' : tab === 'vector' ? 'vectorActiveTool' : 'outputActiveTool');

export const useWorkspaceStore = defineStore('workspace', {
  // With the person's own choices, kept in this browser (kept.js: the color pair, what the picker picks, the tool on each
  // tab and the tools' options).
  state: () => withKept({
    heldTool: null,          // a tool held with a key: { key, tool (the one to go back to), by: 'alt' | 'space' }
    pluginTools: useLocalStorage('phosphor.pluginTools', {}), // { ['brush:' or 'shape:' + ref]: { [optionId]: value } }: the options of plugin brushes and shapes (tools/pluginTool.js), kept in the browser
    recentColors: useLocalStorage('phosphor.recentColors', []),
    ansiRenderer: useLocalStorage('phosphor.ansiRenderer', 'canvas'), // the ANSI view's renderer (trial): 'canvas' | 'dom'
    displayFont: useLocalStorage('phosphor.displayFont', DEFAULT_FONT_ID), // the font the art is drawn in: an id in displayFonts.js, or a loaded font's
    displayFontSizes: useLocalStorage('phosphor.displayFontSizes', {}), // { font id: px } for the fonts you've resized
    userFonts: null,         // the fonts you've loaded ([{ id, name, lineHeight }], userFonts.js), once read from this browser (App.vue)
    roomFont: null,          // while drawing in someone's room, their font (wire.fontFor), in place of the two above; never kept
    displayFontLoaded: null, // displayFontSpec, once it's loaded and measured in (App.vue)
    theme: useLocalStorage('phosphor.theme', 'dark'), // the app's colors: 'dark' | 'light' | 'system' (the computer's) | a plugin's, 'plugin:<id>/<theme>' (useTheme.js; index.html sets it before the first paint)
    smoothText: useLocalStorage('phosphor.smoothText', true), // the art's text anti-aliased (both views), or sharp
    rulers: useLocalStorage('phosphor.rulers', false), // the character rulers (and the guides) shown on PIXEL, ANSI and VECTOR
    rulerOpacity: useLocalStorage('phosphor.rulerOpacity', 100), // the rulers' strips, in %; the guides and labels stay solid
    guides: [],              // { axis: 'v' | 'h', pos }: the open drawing's guides, in cells (kept per drawing in this browser, never part of the document)
    rulerZero: { x: 0, y: 0 }, // where the rulers count from
    mirror: false,           // mirror mode: the drawing tools lay what they draw on the other side of the rulers' zero too
    guidesFile: null,        // the file id the guides belong to; null: they last until the page closes
    isShiftPressed: false,
    isAltPressed: false,     // Option on a Mac: Vector select scales from the middle
    pointerOverEditor: false, // the pointer is over the canvas (Space pans even with a button focused)
    pointerCell: null,     // { col, row, y } of the cell a mouse or pen is over in the art (y: its grid pixel row), for Alt+U
    lastPick: null,          // the Color Picker's last ANSI pick, for the status bar: { col, row, fg, bg, fgFrom, bgFrom }
    textCursor: null,      // { col, row } of the Text tool's cursor
    lastTextCursor: null,  // where it was when Escape put it away: choosing Edit Mode puts it back there if it's in view
    placedCursor: null,    // the cursor a click or choosing Edit Mode placed: the view doesn't follow it there (AnsiEditor)
    selectFromText: false, // the Select tool took over from Edit Mode (a drag, Shift+arrows): setting the selection down goes back
    paletteLayerOpen: false, // the character palette layer has the keyboard
    paletteLayerPage: 'palettes', // the palette layer's page: 'palettes' | 'fonts'
    fontSetup: null,         // { id, block }: the Fonts page chooses that font and picks that block (useFontSetup's Set up its blocks)
    playing: false,          // an animation is playing (usePlayback)
    playFrame: 0,            // and this frame is on screen
    played: shallowRef(null), // that frame, built (FrameBuilder): what the views show meanwhile
    ghost: true,             // earlier frames show dimmed on a Blank frame
    cellsStay: false,        // cells drawn from now on show on their frame only (frames.js: stays)
    ghostStrength: useLocalStorage('phosphor.ghostStrength', 35), // % of their own colors they keep: 0 gone, 100 solid
    ghostFramesBefore: useLocalStorage('phosphor.ghostFramesBefore', 1), // how many frames before the ghost pictures (1 to 5)
    ghostFramesAfter: useLocalStorage('phosphor.ghostFramesAfter', 0),   // and after (0 to 5)
    ansiOverlay: 100,        // % opacity of the edit cells drawn over the pixel view
    ansiOverlayAll: false,   // draw every cell over the pixel view, not just the edit cells
    wand: null,              // the Magic Wand's selection: { view, width, height, mask (markRaw'd, a byte per unit: cells or grid pixels) }
    selection: null,         // { c0, r0, c1, r1 }: the Select tool's cells (inclusive)
    selectionOffset: null,   // { dc, dr } while the selection is being dragged
    clipboard: null,         // the Select tool's copied Block (see ProjectStore.copySelection)
    vectorClipboard: null,   // VECTOR's copied shapes, bottom to top (Cmd/Ctrl+C or X there)
    vectorClipboardKeys: null, // the keys they were copied from, so a follower pasted with its path follows the copy
    vectorClipboardId: null, // which copy that was, to know it on the system clipboard
    vectorTrim: null,        // the Start or End handle being dragged, { part, share }, for its label
    pickingPath: null,       // Follow a path…: the key of the shape or art layer whose next click on VECTOR picks the path it follows (vselect), or null
    vectorMarquee: null,     // the box Vector select drags over empty canvas, { x0, y0, x1, y1 } in grid pixels
    clipboardText: null,     // the text the last copy put on the system clipboard, once written (clipboard.js)
    clipboardId: null,       // the last copy's id, in the block it put on the system clipboard (clipboard.js)
    openRequest: 0,          // counts Cmd/Ctrl+O presses: EditWorkspace opens its file chooser for each
    fileRequest: null,       // a File to open (double-clicked, Open With, the desktop's Open Recent), which EditWorkspace takes as chosen
    zoomRequest: null,       // { by }: a zoom key, for the view showing (EditorViewport): by 2 or 0.5, or 0 for the view's own zoom
    artDrop: null,           // { file, at: { col, row } | null, picture?, art? (an art file, as read) }: a picture on an open still drawing, asking to add it as paint or open it; an art file opening from the start screen, asking to edit it, draw on top or open it as an image; or dropped on an open drawing, asking to add it or open it (EditWorkspace)
    ansiViewOrigin: { col: 0, row: 0 }, // the top-left whole cell on screen in the ANSI view (AnsiEditor)
    ansiViewSize: { cols: 0, rows: 0 }, // how many whole cells from there are on screen (AnsiEditor)
    ansiViewZoom: 1,         // the ansiZoom those cells were measured at (AnsiEditor)
    inputView: { col: 0, row: 0, cols: 0, rows: 0, zoom: 5 }, // the whole cells on screen in the PIXEL view, and the editZoom they were measured at (InputEditor)
    viewToRestore: null,     // a resumed room's view { tab: 'input' | 'output', col, row }: that tab's editor scrolls there once, and publishes only after
    pixelViewOrigin: { col: 0, row: 0 }, // the same in the PIXEL view (InputEditor), where a paste lands with no selection
    strokeEnd: null,         // where the last Pencil, Brush or Retouch stroke ended (a grid position): Shift-click draws a line from there
    shapeDrag: null,         // { from, to, line? } grid positions while a shape (or the Gradient's line) is being dragged
    editZoom:  PIXEL_ZOOM_START,
    ansiZoom:  1,            // the ANSI (and VECTOR) view's zoom: 25% to 800% of its cell size
    editorTab: 'input',      // 'input' (PIXEL), 'output' (ANSI or ASCII), 'vector', 'sauce' or 'room' (the room you watch)
    viewTab: 'output',       // the art tab last shown, 'input' or 'output' (its view mounts and sets it)
    pickedLayer: 'edit',     // the layer picked in LAYERS, its id; it decides the art tabs, and followLayerPick keeps it in step with editorTab
    lastCellsPick: 'edit',   // the cells layer picked last, which the art tabs go back to from a vector layer
    tabAddressed: false,     // the landing address named a tab (router.js)
    documentSettled: false,  // autosave has finished bringing back what it can (useAutosave), or the start screen stopped waiting
    documentAnswered: false, // autosave's restore has really finished, however long it took (a room coming back waits for this)
    isPainting: false,
    isCtrlPressed: false,
    isMetaPressed: false,    // Cmd on a Mac (with Ctrl, it turns VECTOR's Snap to off for a drag)
    isMiddleClick: false,
    settingsOpen: false,
    showAboutModal: false,
    issueReportOpen: false,  // the issue report, from a pre-release build's banner or the desktop Help menu in any version (BetaBanner, useDesktopMenu, IssueReportDialog)
    pluginsOpen: false,      // the Plugins dialog (PluginsDialog)
    shortcutsOpen: false,    // the keyboard shortcuts list (ShortcutsDialog)
    commandListOpen: false,  // the command list (CommandList), Cmd+K
    legalPage: null,         // the Terms, Privacy Policy or Community Guidelines while one's open (LegalDialog): 'terms' | 'privacy' | 'guidelines'
    colorBox: null,          // the color box (ColorLayer) while it's open, for this slot: 'fg' | 'bg'
    colorLayerPage: 'colors', // the color layer's page: 'colors' | 'palettes'
    versionsOpen: false,     // the autosaved versions list (VersionsDialog)
    saveDialog: null,        // the save dialog's format while it's open: 'phosphor' | 'png' and the animated formats (SaveDialog)
    unsavedAsk: null,        // { name, go, stay?, saving? } while UnsavedDialog asks before leaving unsaved work (confirmLeave)
    deleteLayerAsk: null,    // { id } while DeleteLayerDialog asks, in a room, before the layer with the id is deleted for everyone; going: asked, till it's gone
    exportModal: false,      // the export modal (ExportModal) open: true, or the id of the format it opens on (the command list's Export .ans)
    baking: null,            // Bake's question (EditToolbar) while it's open: the palette's name, to lock the picture to or not (bake)
    bakingFinal: false,      // Bake's question while others are drawing: it can't be undone (bake)
    flattening: false,       // Flatten's question (EditToolbar): Edit artwork or Draw on top
    renameRequest: null,     // a layer's id whose row LAYERS turns into its name box (LayersList takes it): the command list's Rename
    dimensionsRequest: 0,    // bumped to put the cursor in Dimensions (ControlPanel): the command list's canvas size

    // Scroll state persistence
    inputScrollX: null,
    inputScrollY: null,
    ansiScrollX: null,
    ansiScrollY: null,

    // The VECTOR tab
    vectorSelected: [],      // the keys of the shapes Vector select has selected (follows project.shapes: one gone drops out)
    vectorPoints: null,      // the key of the shape whose points are being edited (a double-click), or null
    vectorPoint: null,       // the point selected there: its index, or null (the last taken, with more)
    vectorPicked: [],        // the points taken with it (Shift, a box), it among them: indices (vnode's pickedPoints)
    vectorStop: null,        // the selected gradient stop (the Node tool's, Vector select's): its index in the gradient shown, or null
    vectorGradientSlot: 'fill', // which gradient the Node tool edits on a shape with two: 'fill' or 'stroke'
    vectorPen: null,         // the key of the Pen's shape while it's being drawn, or null
    vectorHover: null,       // where the pointer is over VECTOR's art, in grid pixels, for the Pen's next segment
    sidePanelWidth: useLocalStorage('phosphor.sidePanelWidth', 280, { serializer: StorageSerializers.number, listenToStorageChanges: false }), // the side panel's (SidePanel) width in px, as dragged: each tab its own, the last kept for the next
    sidePanelFolded: useLocalStorage('phosphor.sidePanelFolded', false, { listenToStorageChanges: false }), // the side panel folded away (it starts open; a fold is kept in the browser)
    chatTone: useLocalStorage('phosphor.chatTone', true), // a tone for someone else's chat message while you aren't in the chat (RoomStore.chime)
    sidePanelOpen: false,    // a narrow screen's side panel, over the art (not kept: each load starts with it shut); a wide one's is sidePanelFolded
    sidePanelUnread: 0,      // what was said while the chat wasn't showing (SidePanel counts it)
    sidePanelTab: 'layers',  // the side panel's tab: 'layers' | 'social' (Social out of a room, CHAT in one) | 'history' (where it's shown: dev/historyTab.js)
    chatReturn: null,        // the element Alt+T took focus from into SOCIAL, for Escape or Alt+T in the chat box to give it back (markRaw)
    keysOpen: useLocalStorage('phosphor.keysOpen', true), // the Keys panel (KeysPanel) open, or folded away
    keysZoom: useLocalStorage('phosphor.keysZoom', null, { serializer: StorageSerializers.number }), // its lanes' px a frame, or null to fit (keyLanes.js)
    keysScroll: 0,           // how far along they're scrolled, in px, when they don't fit
    keysView: null,          // the frames in view while they don't fit, for the scrubber's band: { first, last, px }
    selectedKeys: [],        // the keys selected there, of the first selected shape: [{ part, at }] (keys.js's refs)
  }),
  getters: {
    shownPick: (state) => (useProjectStore().artInside ? useProjectStore().drawsOn : state.pickedLayer), // inside an art layer its vector layer's row shows as picked
    // A plugin's brush that's gone (its plugin dropped or off, or a room started) reads as the Brush.
    activeTool(state) {
      const id = state[toolKey(state.editorTab)];
      return isSolverRef(id) && !brushOffered(id, usePluginStore(), useRoomStore().inRoom) ? 'brush' : id;
    },
    // The layers a selection's actions act on (Select's Copy, Cut, Delete, Stamp, moves by drag or arrow key, flip and
    // turn; the Magic Wand's Delete; Set FG / Set BG), every one of them: the picked layer, or with All layers on
    // (selectAllLayers, on both tools' rows) every shown cells layer, the base among them, bottom first. A hidden layer
    // is left out either way.
    selectionIds(state) {
      const shown = useProjectStore().layers.filter((layer) => layer.kind === 'cells' && !layer.hidden).map((layer) => layer.id);
      return state.selectAllLayers ? shown : shown.filter((id) => id === state.pickedLayer);
    },
    // Whether a cells layer above the bottom is picked: what Clear clears (off with the base or a vector layer picked).
    pickedCells(state) {
      const layer = useProjectStore().layerById(state.pickedLayer);
      return layer?.kind === 'cells' && layer.id !== 'base';
    },
    editMode: (state) => ['input', 'output', 'vector'].includes(state.editorTab), // the art is showing
    // The editor's tabs, in order, as EditTabs shows them and Alt+1–4 choose them (commands.js): [{ id, disabled }]. The
    // picked layer decides the art tabs, by its kind: a cells layer (the base among them) shows PIXEL and ANSI, a vector
    // layer VECTOR, and inside an art layer VECTOR and ANSI (shownPick is its vector layer's row then). 'vector' before
    // the first shape brings its layer is the vector layer it will be. The art tabs wait for something to show; from ROOM
    // (the room you watch) they're the way back to the start screen.
    shownTabs() {
      return (project, room) => {
        const noArt = !project.image && this.editorTab !== 'room';
        const isVector = (id) => project.layerById(id)?.kind === 'vector' || id === 'vector';
        return [
          ...(!isVector(this.shownPick) ? [{ id: 'input', disabled: noArt }] : []),
          ...(isVector(this.shownPick) ? [{ id: 'vector', disabled: noArt }] : []),
          ...(!isVector(this.pickedLayer) || project.artInside ? [{ id: 'output', disabled: noArt }] : []),
          { id: 'sauce', disabled: noArt },
          ...(room.role === 'watch' || this.editorTab === 'room' ? [{ id: 'room', disabled: false }] : []),
        ];
      };
    },
    // The view the room's host is looking at, for watchers: whole cells and the zoom to draw them at
    // (a fraction of the font's cell), of the art tab last shown (SAUCE and SOCIAL keep it). PIXEL's
    // zoom is its pixels per column against the font's cell width. Each zoom is the one its cells were
    // measured at, never the live one: a new zoom goes with its cells.
    sharedView(state) {
      if (state.viewTab === 'output') return { ...state.ansiViewOrigin, ...state.ansiViewSize, zoom: state.ansiViewZoom };
      return { ...state.inputView, zoom: Math.min(1, state.inputView.zoom / this.displayAdvance) };
    },
    // The display font's character width in CSS px, measured once per font.
    displayAdvance(state) {
      void this.displayFontSpec;   // a font change measures again
      void state.displayFontLoaded;   // and again once it's loaded
      return measureAdvance(DISPLAY_FONT);
    },
    pickSwapped: (state) => state.heldTool?.by === 'alt', // the picker is only held by Alt from a drawing tool
    // The font the art is drawn in, at its size (a font displayFonts.js can set): a room's, else the
    // drawing's own bitmap font (at its height), else the one picked. A loaded font starts at 16px; an
    // unknown one (a loaded font since removed) is the default.
    displayFontSpec(state) {
      if (state.roomFont) return state.roomFont;
      const project = useProjectStore(), drawn = project.drawingFont;
      if (drawn) {
        const id = fontId(drawn);
        return { id, name: drawn.name, family: familyOf(fontKey(drawn)), size: state.displayFontSizes[id] ?? drawn.height, lineHeight: 1, bitmap: true, height: drawn.height, source: project.fontBitmap, blocks: project.fontBlocks, width: drawn.cellWidth, lines: project.fontLines };
      }
      const loaded = state.userFonts?.find((f) => f.id === state.displayFont);
      const font = loaded
        ? { id: loaded.id, name: loaded.name, family: familyOf(loaded.id), size: 16, lineHeight: loaded.lineHeight }
        : DISPLAY_FONTS.find((f) => f.id === state.displayFont) ?? DEFAULT_FONT;
      return { ...font, size: state.displayFontSizes[font.id] ?? font.size };
    },
  },
  actions: {
    // Pick a layer: the tabs follow. A vector layer is the VECTOR tab; the cells layers share PIXEL and ANSI, so picking
    // one steps out of an art layer, makes it the one the tools draw on (project.useLayer) and leaves VECTOR for the art tab
    // last shown. False when refused: a layer that isn't there, or the base, which isn't an artist's to pick, nor from inside
    // an art layer.
    pickLayer(id) {
      const project = useProjectStore(), layer = project.layerById(id);
      if (!layer) return false;
      if (layer.kind === 'vector') {
        this.pickedLayer = id;
        this.editorTab = 'vector';
        return true;
      }
      if (id === 'base' && (useDrawingStore().hostOnly || project.artInside)) return false;
      if (project.artInside) project.leaveArt();
      this.pickedLayer = id;
      project.useLayer(id);
      if (this.editorTab === 'vector') this.editorTab = this.viewTab;
      return true;
    },
    // Select rect (the whole grid: project.gridRect()) with the Select tool.
    selectAll(rect) {
      this.selection = rect;
      this.wand = null;
      this.setActiveTool('select');
    },
    // The selection stays as you change tools: the painting tools change only what's inside it.
    // Edit Mode chosen drops the selection and the Magic Wand's (typing ignores them; an undo step),
    // and never moves the view: its cursor comes back where it was (or where Escape put it away) if
    // that's in view, else (and the first time) to the top-left whole cell of the view, where a paste
    // lands; on the grid and on a wide character's lead. Setting down a selection made from Edit Mode
    // goes back to typing at the cursor, wherever it is.
    setActiveTool(tool) {
      const back = this.selectFromText;
      this.heldTool = null; // a tool chosen while another is held stays chosen
      this.selectFromText = false;
      this[toolKey(this.editorTab)] = tool;
      const group = groupOf(tool);
      if (group) this.slotFaces[group.id] = tool;
      if (tool !== 'text' || this.editorTab !== 'output') return;
      const project = useProjectStore();
      if (this.selection || this.wand) project.changeSelection((w) => { w.selection = null; w.wand = null; });
      if (back && this.textCursor) return;
      const onGrid = ({ col, row }) => ({ col: Math.min(col, Math.max(0, project.cols - 1)), row: Math.min(row, Math.max(0, charRowsOf(project.rows) - 1)) });
      const view = this.ansiViewOrigin, { cols, rows } = this.ansiViewSize;
      const at = onGrid(this.textCursor ?? this.lastTextCursor ?? view);
      const seen = at.col >= view.col && at.col < view.col + cols && at.row >= view.row && at.row < view.row + rows;
      this.textCursor = this.placedCursor = snapCursor(project.cells, project.cols, seen ? at : onGrid(view), 0);
    },
    // A tool held with a key (Alt: the picker; Space: the hand) swaps in without what choosing a tool
    // does (the selection stays), and releaseTool puts the tool back. False when one is already held.
    holdTool(tool, by) {
      if (this.heldTool) return false;
      const key = toolKey(this.editorTab);
      this.heldTool = { key, tool: this[key], by };
      this[key] = tool;
      return true;
    },
    releaseTool() {
      const held = this.heldTool;
      if (!held) return;
      this.heldTool = null;
      this[held.key] = held.tool;
      if (held.by === 'alt') this.endPick(); // a pick that ended with the key, not the pointer
    },
    showGuidesFor(fileId) {
      const kept = fileId ? loadGuides(fileId) : null;
      this.guidesFile = fileId;
      this.guides = kept?.guides ?? [];
      this.rulerZero = kept?.zero ?? { x: 0, y: 0 };
    },
    persistGuides() {
      if (this.guidesFile) saveGuides(this.guidesFile, { guides: this.guides, zero: this.rulerZero });
    },
    addGuide(axis, pos) {
      this.guides.push({ axis, pos });
      this.persistGuides();
    },
    moveGuide(index, pos) {
      this.guides[index].pos = pos;
      this.persistGuides();
    },
    removeGuide(index) {
      this.guides.splice(index, 1);
      this.persistGuides();
    },
    clearGuides() {
      this.guides = [];
      this.persistGuides();
    },
    setRulerZero(axis, pos) {
      this.rulerZero[axis] = pos;
      this.persistGuides();
    },
    resetRulerZero(axis) {
      if (axis) this.rulerZero[axis] = 0;
      else this.rulerZero = { x: 0, y: 0 };
      this.persistGuides();
    },
    // hex: choose that color (and clear the slot's none flag); null: set the slot to none.
    // remember: false while a native picker is being dragged, so only the final color is recent.
    // index: the swatch's, when a lower index shares its color (sharedIndex); otherwise the color has none.
    // kept: what the recent colors keep, when it isn't hex: a palette swatch's palette color, not the color it stores.
    setColor(slot, hex, { remember = true, index, kept = hex } = {}) {
      const none = slot === 'fg' ? 'editFgNone' : 'editBgNone';
      if (hex === null) {
        this[none] = true;
        return;
      }
      this[slot === 'fg' ? 'editFgColor' : 'editBgColor'] = hex;
      this[slot === 'fg' ? 'editFgIndex' : 'editBgIndex'] = index;
      this[none] = false;
      if (remember) this.rememberColor(kept, index);
    },
    rememberColor(hex, index) {
      const entry = recentEntry(hex, index);
      this.recentColors = [entry, ...this.recentColors.filter(c => c !== entry)].slice(0, RECENT_COLORS);
    },
    // The eyedropper: picks repeat while dragging, so they leave the recent colors alone until the
    // pick ends (endPick); then the color each pick replaced and the color it picked both go in,
    // so getting the old color back is one click.
    pickColor(slot, hex, index) {
      this._pickedFrom ??= { fg: this.slotEntry('fg'), bg: this.slotEntry('bg') };
      this.setColor(slot, hex, { remember: false, index });
    },
    endPick() {
      const from = this._pickedFrom;
      this._pickedFrom = null;
      if (!from) return;
      for (const slot of ['fg', 'bg']) {
        const now = this.slotEntry(slot);
        if (now === from[slot]) continue;
        for (const entry of [from[slot], now]) if (entry) this.rememberColor(...Object.values(recentColor(entry)));
      }
    },
    // A slot's color as a recent entry (recentEntry), null when it's none.
    slotEntry(slot) {
      const fg = slot === 'fg';
      return this[fg ? 'editFgNone' : 'editBgNone'] ? null : recentEntry(this[fg ? 'editFgColor' : 'editBgColor'], this[fg ? 'editFgIndex' : 'editBgIndex']);
    },
    // What typing writes besides the character: a none slot is left out, so that attribute stays as it is. A color's
    // index (16, 231) goes with it.
    // The Insert key, and the status bar's button: Overwrite, Insert, Partial, and round again.
    cycleTypingMode() {
      this.typingMode = { overwrite: 'insert', insert: 'partial', partial: 'overwrite' }[this.typingMode];
    },
    typingAttrs() {
      return {
        fg: this.editFgNone ? undefined : this.editFgColor,
        bg: this.editBgNone ? undefined : this.editBgColor,
        fgIndex: this.editFgNone ? undefined : this.editFgIndex,
        bgIndex: this.editBgNone ? undefined : this.editBgIndex,
      };
    },
    // The color layer opened for a slot, on a page: Colors (that slot's picker) or Palettes. Opening it again for another
    // slot or page moves it there; the chips close it for the slot already open (ColorPair).
    openColors(slot = 'fg', page = 'colors') {
      this.colorBox = slot;
      this.colorLayerPage = page;
    },
    swapColors() {
      [this.editFgColor, this.editBgColor] = [this.editBgColor, this.editFgColor];
      [this.editFgNone, this.editBgNone] = [this.editBgNone, this.editFgNone];
      [this.editFgIndex, this.editBgIndex] = [this.editBgIndex, this.editFgIndex];
    },
    setEditZoom(z) {
      this.editZoom = clampZoom(z);
    },
    setAnsiZoom(z) {
      this.ansiZoom = clampViewZoom(z);
    },
    toggleSettings() {
      this.settingsOpen = !this.settingsOpen;
      if (this.settingsOpen) this.sidePanelOpen = false;   // a narrow screen shows one drawer at a time
    },
    // The side panel folded or open on a wide screen; on a narrow one, over the art or not (and the settings drawer shut).
    toggleSidePanel(open = matchMedia(desktopQuery).matches ? this.sidePanelFolded : !this.sidePanelOpen) {
      if (matchMedia(desktopQuery).matches) this.sidePanelFolded = !open;
      else Object.assign(this, { sidePanelOpen: open, settingsOpen: open ? false : this.settingsOpen });
    },
    // A file asking how it comes in (artDrop). An art file is read first, so one that can't open (too big, empty) says so
    // before anything's asked, and what's chosen opens what was read; a .utf8ans read as CP437 says that too.
    async askArt(file, { at = null, picture = false } = {}) {
      let art = null;
      if (isArtFile(file.name)) {
        try {
          art = await busyWhile(t('document.opening', { name: file.name }), async () => markRaw(readArtFile(new Uint8Array(await file.arrayBuffer()), file.name, await knownBlocksOf(this.userFonts))));
        } catch (error) {
          if (!error.userMessage) throw error;
          return void toast(error.userMessage);
        }
        if (art.notUtf8) toast(t('document.notUtf8', { name: file.name }));
        if (art.binNoSauce) toast(t('document.binNoSauce', { name: file.name }));
      }
      this.artDrop = { file, at, ...(picture && { picture }), ...(art && { art }) };
    },
    // Goes on (go) at once when the drawing has nothing unsaved; otherwise asks first (UnsavedDialog): save the
    // project, then go on; go on without saving; or stay (then stay, if given). name: the file that would open, or null
    // for New project.
    confirmLeave(name, go, stay) {
      const project = useProjectStore();
      project.commitPending(); // text typed a moment ago counts
      if (!project.image || !project.unsavedChanges) return void go();
      this.unsavedAsk = markRaw({ name, go, stay });
    },
    // New project (the button, the desktop menu, Back onto the start screen): asked first when there's unsaved work.
    // Resolves whether the drawing closed.
    newProject() {
      const project = useProjectStore();
      if (!project.image || useDrawingStore().offWithOthers) return Promise.resolve(false);
      return new Promise((resolve) => this.confirmLeave(null, () => {
        project.clearImage();
        this.editorTab = 'input';
        this.settingsOpen = false; // a phone's drawer: the start screen shows
        resolve(true);
      }, () => resolve(false)));
    },
    // Save project (the button, Cmd/Ctrl+S, the desktop menu; Save As with Shift or from the menu): on desktop, and on
    // the web where the browser savesInPlace, straight over the project's own file, or where the system's save box says
    // (always, for Save As: `as`); elsewhere the save dialog, for a download.
    async saveFile({ as = false } = {}) {
      const project = useProjectStore();
      if (!project.image) return;
      if (!DESKTOP && !savesInPlace()) return void (this.saveDialog = 'phosphor');
      if (saving) return;   // one at a time: a second Save while the box is open would open another
      saving = true;
      try {
        await project.saveProject(undefined, { as });
      } catch (error) {
        console.warn('Could not save the file', error);
        toast(error.userMessage ?? t('save.saveFailed'));
      } finally {
        saving = false;
      }
    },
    // The side panel open on its Social (or, in a room, CHAT) tab.
    showSocial() {
      this.toggleSidePanel(true);
      this.sidePanelTab = 'social';
    },
    // Out of the chat box (Escape or Alt+T there): focus back where Alt+T found it, or on the art when that's gone (off
    // the page, in a dialog that's shut, or in a narrow screen's panel, which shuts), and with no art showing (SAUCE,
    // ROOM) nowhere, so the keys are the app's again. A narrow screen's panel shuts too, as it's over the art.
    leaveChat() {
      const back = this.chatReturn, box = document.activeElement, narrow = !matchMedia(desktopQuery).matches;
      this.chatReturn = null;
      if (narrow) this.toggleSidePanel(false);
      const gone = !back?.isConnected || back === document.body || back.closest('dialog:not([open])') || (narrow && back.closest('.side-panel'));
      if (!gone) back.focus({ preventScroll: true });
      if (document.activeElement !== box) return;
      const art = document.querySelector('[data-art]');
      if (art) art.focus({ preventScroll: true });
      else box?.blur();
    },
    // The side panel open on LAYERS.
    showLayers() {
      this.toggleSidePanel(true);
      this.sidePanelTab = 'layers';
    },
    // Add layer and Add vector layer (LAYERS' header, the command list): directly above the pick, and picked (an artist's
    // in a room when the host's stack comes, project.applyLayers). The new layer's id, or null when refused.
    addLayerAbovePick(kind) {
      const id = useProjectStore().addLayer(kind, this.shownPick);
      if (id) this.pickLayer(id);
      return id;
    },
    // Delete in a layer's ⋯ menu (and the command list's): an undo step alone; in a room it asks first
    // (DeleteLayerDialog), as no one can undo it. True when it's gone now.
    removeLayer(id) {
      const project = useProjectStore();
      if (project._sharing) this.deleteLayerAsk = { id };
      else return !!project.deleteLayer(id);
      return false;
    },
    // Bake (the toolbar's and the command list's). Under CGA or VGA it asks whether to lock the picture to the palette
    // (exact, but the in-between colors are gone) or keep full color (a few cells near palette boundaries can tip);
    // other palettes bake exactly either way, and so do CGA and VGA dithered or resolved (they snap on the grid then).
    // Others drawing, it can't be undone, so it asks first. EditToolbar asks.
    bake() {
      const project = useProjectStore(), palette = !snapsLate(project.processParams) && { cga: 'CGA', vga: 'VGA' }[project.quantize];
      if (palette) this.baking = palette;
      else if (useDrawingStore().othersHere) this.bakingFinal = true;
      else project.bake();
    },
    // The palette layer on its Fonts page, whatever tool is in hand; from SAUCE, the art is shown first. With no drawing
    // it opens over the start screen (EditWorkspace). A phone's settings drawer shuts so the page shows whole.
    openFonts() {
      if (useProjectStore().image && !this.editMode) this.editorTab = 'output';
      this.settingsOpen = false;
      this.paletteLayerPage = 'fonts';
      this.paletteLayerOpen = true;
    },
  }
});


// Keeps pickedLayer in step with editorTab, which many places set (a tab chosen, Make art layer, a key): VECTOR picks the
// topmost vector layer when a cells layer is picked, and the art tabs pick the cells layer picked last (or the topmost one
// while it's gone) when a vector layer is. A picked layer that leaves the stack picks the one that was under it (one that
// can be picked: an artist's isn't the base), a base picked becoming an artist's picks as the art tabs do, and a new
// document picks its edit layer (or its topmost cells layer). Every pick made here goes through pick, so the tools draw on
// it (project.useLayer). Returns a function that stops it.
export function followLayerPick({ workspace, project, drawing }) {
  // Before its first shape a drawing may have no vector layer: VECTOR picks the one that shape will bring ('vector').
  const kindOf = (id) => project.layerById(id)?.kind ?? (id === 'vector' ? 'vector' : 'cells');
  const pickable = (layer) => layer?.kind === 'cells' && (layer.id !== 'base' || !(drawing.hostOnly || project.artInside));
  const cellsPick = () => (pickable(project.layerById(workspace.lastCellsPick)) ? workspace.lastCellsPick : project.layers.findLast(pickable)?.id ?? 'edit');
  // A pick made here: the edit layer's fields are a cells layer picked, and the tabs follow, as pickLayer has them.
  const pick = (id, { tabs = true } = {}) => {
    workspace.pickedLayer = id;
    project.useLayer(id);
    if (!tabs) return;
    if (kindOf(id) === 'vector') workspace.editorTab = 'vector';
    else if (workspace.editorTab === 'vector') workspace.editorTab = workspace.viewTab;
  };
  let started = project._layersStarted; // every document opened starts its layers over (document.js: newLayers)
  const stops = [
    watch(() => workspace.pickedLayer, (id) => {
      if (project.layerById(id)?.kind === 'cells') workspace.lastCellsPick = id;
    }, { flush: 'sync', immediate: true }),
    watch(() => workspace.editorTab, (tab) => {
      const kind = kindOf(workspace.pickedLayer);
      if (tab === 'vector' && kind !== 'vector') pick(project.layers.findLast((layer) => layer.kind === 'vector')?.id ?? 'vector', { tabs: false });
      else if ((tab === 'input' || tab === 'output') && kind === 'vector') pick(cellsPick(), { tabs: false });
    }, { flush: 'sync', immediate: true }),
    watch(() => project.layers, (now, was) => {
      const topVector = () => now.findLast((layer) => layer.kind === 'vector')?.id ?? 'vector';
      if (project._layersStarted !== started) {
        // On VECTOR it stays VECTOR (a restore, a file opened): the topmost vector layer, or the one the first shape will
        // bring. A document opens with the bottom and the edit layer and gets its own layers right after, when the
        // topmost of those is picked (document.js: showParts).
        started = project._layersStarted;
        if (workspace.editorTab === 'vector') pick(topVector(), { tabs: false });
        else pick(now.some((layer) => layer.id === 'edit') ? 'edit' : now.findLast((layer) => layer.kind === 'cells').id);
        return;
      }
      const at = was.findIndex((layer) => layer.id === workspace.pickedLayer);
      if (now.some((layer) => layer.id === workspace.pickedLayer)) return;
      if (at < 0) { // picked before it was there ('vector', the first one's id): the document's own vector layer, now that it's here
        if (workspace.editorTab === 'vector' && now.some((layer) => layer.kind === 'vector')) pick(topVector(), { tabs: false });
        return;
      }
      // The vector layer a first shape brought, taken back with its stroke before it was a step (cancelEdit, a lone Pen
      // point removed): on VECTOR that's the drawing before its first shape again, so VECTOR stays, as it was then.
      if (project._takingBack && workspace.editorTab === 'vector' && !now.some((layer) => layer.kind === 'vector')) return void pick('vector', { tabs: false });
      const under = was.slice(0, at).findLast((layer) => now.some(({ id }) => id === layer.id) && (layer.kind === 'vector' || pickable(layer)));
      pick(under?.id ?? cellsPick()); // the nearest one still there that can be picked
    }, { flush: 'sync' }),
    watch(() => drawing.hostOnly, (reason) => {
      if (reason && workspace.pickedLayer === 'base') pick(cellsPick());
    }, { flush: 'sync' }),
  ];
  return () => stops.forEach((stop) => stop());
}
