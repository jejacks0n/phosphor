import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';
import { DISPLAY_FONT, DISPLAY_FONTS } from '@/lib/displayFonts';
import { familyOf } from '@/lib/userFonts';
import { clampZoom, clampAnsiZoom } from '@/lib/zoom';
import { measureAdvance } from '@/lib/CellCanvas';

const RECENT_COLORS = 12;

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    inputActiveTool: 'brush',
    outputActiveTool: 'hand',
    heldTool: null,          // a tool held with a key: { key, tool (the one to go back to), by: 'alt' | 'space' }
    // The color pair. Paint uses the foreground; typing uses both, where a none slot leaves that
    // attribute as it is underneath (with the background none, typed text sits on the image).
    editFgColor:  '#ffffff',
    editBgColor: '#000000',
    editFgNone: false,
    editBgNone: true,
    recentColors: useLocalStorage('phosphor.recentColors', []),
    ansiRenderer: useLocalStorage('phosphor.ansiRenderer', 'canvas'), // the ANSI view's renderer (trial): 'canvas' | 'dom'
    displayFont: useLocalStorage('phosphor.displayFont', 'jetbrains'), // the font the art is drawn in: an id in displayFonts.js, or a loaded font's
    displayFontSizes: useLocalStorage('phosphor.displayFontSizes', {}), // { font id: px } for the fonts you've resized
    userFonts: null,         // the fonts you've loaded ([{ id, name, lineHeight }], userFonts.js), once read from this browser (App.vue)
    displayFontLoaded: null, // displayFontSpec, once it's loaded and measured in (App.vue)
    theme: useLocalStorage('phosphor.theme', 'dark'), // the app's colors: 'dark' | 'light' | 'system' (the computer's; index.html sets it before the first paint)
    smoothText: useLocalStorage('phosphor.smoothText', true), // the art's text anti-aliased (both views), or sharp
    activeChar: '█',       // what Fill and Shapes draw with; set by picks (and F-keys)
    isShiftPressed: false,
    pointerOverEditor: false, // the pointer is over the canvas (Space pans even with a button focused)
    pickLayers: { fg: true, bg: true }, // ANSI view: what a plain picker click picks (both lit: both)
    lastPick: null,          // the Color Picker's last ANSI pick, for the status bar: { col, row, fg, bg, fgFrom, bgFrom }
    textCursor: null,      // { col, row } of the Text tool's cursor
    insertMode: false,     // typing pushes the row right instead of overwriting
    paletteLayerOpen: false, // the character palette layer has the keyboard
    ansiOverlay: 100,        // % opacity of the edit cells drawn over the pixel view
    ansiOverlayAll: false,   // draw every cell over the pixel view, not just the edit cells
    wand: null,              // the Magic Wand's selection: { view, width, height, mask (markRaw'd, a byte per unit: cells or grid pixels) }
    wandMatch: { fg: true, bg: false, char: true }, // ANSI view: what a cell must share with the one clicked
    wandContiguous: true,    // only what touches the unit clicked
    wandTolerance: 10,       // how far a color may be from the clicked one's and still match (0-100)
    selection: null,         // { c0, r0, c1, r1 }: the Select tool's cells (inclusive)
    selectionOffset: null,   // { dc, dr } while the selection is being dragged
    clipboard: null,         // the Select tool's copied Block (see ProjectStore.copySelection)
    clipboardText: null,     // the text the last copy put on the system clipboard, once written (clipboard.js)
    ansiViewOrigin: { col: 0, row: 0 }, // the top-left whole cell on screen in the ANSI view (AnsiEditor)
    ansiViewSize: { cols: 0, rows: 0 }, // how many whole cells from there are on screen (AnsiEditor)
    ansiViewZoom: 1,         // the ansiZoom those cells were measured at (AnsiEditor)
    inputView: { col: 0, row: 0, cols: 0, rows: 0, zoom: 5 }, // the whole cells on screen in the PIXEL view, and the editZoom they were measured at (InputEditor)
    viewToRestore: null,     // a resumed room's view { tab: 'input' | 'output', col, row }: that tab's editor scrolls there once, and publishes only after
    pixelViewOrigin: { col: 0, row: 0 }, // the same in the PIXEL view (InputEditor), where a paste lands with no selection
    selectLayers: { base: true, edit: true }, // what the Select tool acts on, and the Magic Wand's Delete: the base layer and/or the edit layer
    pencilDrawWith: 'normal', // Pencil, ANSI view: 'normal' (paint) | 'single' | 'double' (box lines) | 'half' (▄ half-blocks)
    pencilConnect: true,     // Pencil's Single and Double: join the lines it crosses or lands on
    shapeKind: 'rect',       // Shapes tool: 'rect' | 'ellipse' | 'line'
    shapeCharFill: false,    // Character mode: fill the inside with the character too (other modes fill with BG)
    shapeDrawWith: 'double', // ANSI view: 'single' | 'double' | 'half' | 'full' | 'char'
    shapeConnect: true,      // line boxes join the box characters they cross or meet
    shapeBlockChars: false,  // ANSI blocks: real ▄/█ characters, or paint over the cells' own
    shapeAntialias: false,   // ellipses and lines: edge pixels by coverage, or ░▒▓█ cells
    shapeVerticalHalves: false, // ANSI blocks: ▌▐ too (Half-block: quadrants), for lines and ellipses
    strokeEnd: null,         // where the last Pencil or Brush stroke ended (a grid position): Shift-click draws a line from there
    shapeDrag: null,         // { from, to } grid positions while a shape is being dragged
    editZoom:  5,
    ansiZoom:  1,            // the ANSI view's zoom: 25% to 100% of its cell size
    editorTab: 'input',      // 'input' (PIXEL), 'output' (ANSI or ASCII), 'sauce' or 'social'
    viewTab: 'output',       // the art tab last shown, 'input' or 'output' (its view mounts and sets it)
    tabAddressed: false,     // the landing address named a tab (router.js)
    documentSettled: false,  // autosave has finished bringing back what it can (useAutosave), or the start screen stopped waiting
    documentAnswered: false, // autosave's restore has really finished, however long it took (a room coming back waits for this)
    isPainting: false,
    isCtrlPressed: false,
    isMiddleClick: false,
    settingsOpen: false,
    showAboutModal: false,
    shortcutsOpen: false,    // the keyboard shortcuts list (ShortcutsDialog)
    legalPage: null,         // the Terms or the Privacy Policy while one's open (LegalDialog): 'terms' | 'privacy'
    colorBox: null,          // the color box (ColorPair's popover) while it's open: 'fg' | 'bg'
    versionsOpen: false,     // the autosaved versions list (VersionsDialog)
    saveDialog: null,        // the save dialog's format while it's open: 'phosphor' | 'ans' | 'utf8ans' (SaveDialog)

    // Scroll state persistence
    inputScrollX: null,
    inputScrollY: null,
    ansiScrollX: null,
    ansiScrollY: null,

    // Brush Settings
    editBrushSize:  2.5,
    editEraserSize: 5,
    eraseLayers: { base: false, edit: true }, // what the eraser erases: the base layer and/or the edit layer
    flipLayers: { base: false, edit: true },  // what Flip FG/BG flips: the base layer and/or the edit layer
    editBrushOpacity:  100,
    brushDrawWith: 'normal', // Brush, ANSI view: 'normal' (paint) | 'half' (each cell painted becomes a ▄ the paint colors)
    editBrushStack: true, // Stack opacity: each stroke lays up to the opacity on top of what's there (PaintLayer.paint)
    editBrushFlow:  50, // a stamp flow of 0.25 (brush.js squares it)
    editBrushHardness:  50,

    // Fill Settings
    editFillTolerance:  10,
    editFillContiguous:  true,
    editFillFeather: 2,
    bucketFillWith: 'normal', // ANSI view: 'normal' (the color you see) | 'cells' (whole cells, by Match and Set)
    bucketMatch: { fg: true, bg: true, char: true }, // Cells: what a cell must share with the one clicked
    bucketSet: { fg: true, bg: false, char: false }, // Cells: what the fill sets (your FG, BG, character)
  }),
  getters: {
    activeTool(state) {
      return state.editorTab === 'input' ? state.inputActiveTool : state.outputActiveTool;
    },
    editMode: (state) => state.editorTab === 'input' || state.editorTab === 'output', // the art is showing
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
    // The font the art is drawn in, at its size (a font displayFonts.js can set). A loaded font
    // starts at 16px; an unknown one (a loaded font since removed) is the default.
    displayFontSpec(state) {
      const loaded = state.userFonts?.find((f) => f.id === state.displayFont);
      const font = loaded
        ? { id: loaded.id, name: loaded.name, family: familyOf(loaded.id), size: 16, lineHeight: loaded.lineHeight }
        : DISPLAY_FONTS.find((f) => f.id === state.displayFont) ?? DISPLAY_FONTS[0];
      return { ...font, size: state.displayFontSizes[font.id] ?? font.size };
    },
  },
  actions: {
    // Select rect (the whole grid: project.gridRect()) with the Select tool.
    selectAll(rect) {
      this.selection = rect;
      this.wand = null;
      this.setActiveTool('select');
    },
    // The selection stays as you change tools: the painting tools change only what's inside it.
    setActiveTool(tool) {
      this.heldTool = null; // a tool chosen while another is held stays chosen
      if (this.editorTab === 'input') this.inputActiveTool = tool;
      else this.outputActiveTool = tool;
    },
    // A tool held with a key (Alt: the picker; Space: the hand) swaps in without what choosing a tool
    // does (the selection stays), and releaseTool puts the tool back. False when one is already held.
    holdTool(tool, by) {
      if (this.heldTool) return false;
      const key = this.editorTab === 'input' ? 'inputActiveTool' : 'outputActiveTool';
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
    // hex: choose that color (and clear the slot's none flag); null: set the slot to none.
    // remember: false while a native picker is being dragged, so only the final color is recent.
    setColor(slot, hex, { remember = true } = {}) {
      const none = slot === 'fg' ? 'editFgNone' : 'editBgNone';
      if (hex === null) {
        this[none] = true;
        return;
      }
      this[slot === 'fg' ? 'editFgColor' : 'editBgColor'] = hex;
      this[none] = false;
      if (remember) this.rememberColor(hex);
    },
    rememberColor(hex) {
      this.recentColors = [hex, ...this.recentColors.filter(c => c !== hex)].slice(0, RECENT_COLORS);
    },
    // The eyedropper: picks repeat while dragging, so they leave the recent colors alone until the
    // pick ends (endPick); then the color each pick replaced and the color it picked both go in,
    // so getting the old color back is one click.
    pickColor(slot, hex) {
      this._pickedFrom ??= {
        fg: this.editFgNone ? null : this.editFgColor,
        bg: this.editBgNone ? null : this.editBgColor,
      };
      this.setColor(slot, hex, { remember: false });
    },
    endPick() {
      const from = this._pickedFrom;
      this._pickedFrom = null;
      if (!from) return;
      for (const slot of ['fg', 'bg']) {
        const now = slot === 'fg' ? (this.editFgNone ? null : this.editFgColor) : (this.editBgNone ? null : this.editBgColor);
        if (now === from[slot]) continue;
        if (from[slot]) this.rememberColor(from[slot]);
        if (now) this.rememberColor(now);
      }
    },
    // What typing writes besides the character: a none slot is left out, so that attribute stays as it is.
    typingAttrs() {
      return {
        fg: this.editFgNone ? undefined : this.editFgColor,
        bg: this.editBgNone ? undefined : this.editBgColor,
      };
    },
    swapColors() {
      [this.editFgColor, this.editBgColor] = [this.editBgColor, this.editFgColor];
      [this.editFgNone, this.editBgNone] = [this.editBgNone, this.editFgNone];
    },
    setEditZoom(z) {
      this.editZoom = clampZoom(z);
    },
    setAnsiZoom(z) {
      this.ansiZoom = clampAnsiZoom(z);
    },
    toggleSettings() {
      this.settingsOpen = !this.settingsOpen;
    },
  }
});

