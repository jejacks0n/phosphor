import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';

const RECENT_COLORS = 12;

export const clampZoom = (z) => Math.max(1, Math.min(16, z));

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
    selection: null,         // { c0, r0, c1, r1 }: the Select tool's cells (inclusive)
    selectionOffset: null,   // { dc, dr } while the selection is being dragged
    clipboard: null,         // the Select tool's copied Block (see ProjectStore.copySelection)
    clipboardText: null,     // the text the last copy put on the system clipboard, once written (clipboard.js)
    ansiViewOrigin: { col: 0, row: 0 }, // the top-left whole cell on screen in the ANSI view (AnsiEditor)
    selectLayers: { base: true, edit: true }, // what the Select tool acts on: the base layer and/or the edit layer
    shapeKind: 'rect',       // Shapes tool: 'rect' | 'ellipse'
    shapeCharFill: false,    // Character mode: fill the inside with the character too (other modes fill with BG)
    shapeDrawWith: 'double', // ANSI view: 'single' | 'double' | 'half' | 'full' | 'char'
    shapeConnect: true,      // line boxes join the box characters they cross or meet
    shapeBlockChars: false,  // ANSI blocks: real ▄/█ characters, or paint over the cells' own
    shapeAntialias: false,   // ellipses: edge pixels by coverage, or ░▒▓█ cells
    shapeDrag: null,         // { from, to } grid positions while a shape is being dragged
    editZoom:  5,
    editorTab: 'input',
    isPainting: false,
    isCtrlPressed: false,
    isMiddleClick: false,
    settingsOpen: false,
    showAboutModal: false,
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
    editBrushFlow:  25,
    editBrushHardness:  50,

    // Fill Settings
    editFillTolerance:  10,
    editFillContiguous:  true,
    editFillFeather: 2,
  }),
  getters: {
    activeTool(state) {
      return state.editorTab === 'input' ? state.inputActiveTool : state.outputActiveTool;
    },
    editMode: (state) => state.editorTab !== 'sauce',
    pickSwapped: (state) => state.heldTool?.by === 'alt', // the picker is only held by Alt from a drawing tool
  },
  actions: {
    // Select rect (the whole grid: project.gridRect()) with the Select tool.
    selectAll(rect) {
      this.selection = rect;
      this.setActiveTool('select');
    },
    // Choosing any tool but Select in the ANSI view (where the selection lives) clears the selection.
    setActiveTool(tool) {
      if (tool !== 'select' && this.editorTab === 'output') {
        this.selection = null;
        this.selectionOffset = null;
      }
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
    toggleSettings() {
      this.settingsOpen = !this.settingsOpen;
    },
  }
});

