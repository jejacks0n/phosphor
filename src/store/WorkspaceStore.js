import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';

const RECENT_COLORS = 12;

export const clampZoom = (z) => Math.max(1, Math.min(16, z));

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    inputActiveTool: 'brush',
    outputActiveTool: 'hand',
    previousTool: null,
    // The colour pair. Paint uses the foreground; typing uses both, where a none slot leaves that
    // attribute as it is underneath (with the background none, typed text sits on the image).
    editFgColor:  '#ffffff',
    editBgColor: '#000000',
    editFgNone: false,
    editBgNone: true,
    recentColors: useLocalStorage('phosphor.recentColors', []),
    activeChar: '█',       // what Fill and Shapes draw with; set by picks (and F-keys)
    pickSwapped: false,    // the picker is only held by Alt from a paint tool
    textCursor: null,      // { col, row } of the Text tool's cursor
    insertMode: false,     // typing pushes the row right instead of overwriting
    paletteLayerOpen: false, // the character palette layer has the keyboard
    editZoom:  5,
    editorTab: 'input',
    isPainting: false,
    isCtrlPressed: false,
    isMiddleClick: false,
    settingsOpen: false,
    showAboutModal: false,

    // Scroll state persistence
    inputScrollX: null,
    inputScrollY: null,
    ansiScrollX: null,
    ansiScrollY: null,

    // Brush Settings
    editBrushSize:  2.5,
    editEraserSize: 5,
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
  },
  actions: {
    setActiveTool(tool) {
      if (this.editorTab === 'input') {
        if (this.inputActiveTool !== tool) {
          this.previousTool = this.inputActiveTool;
          this.inputActiveTool = tool;
        }
      } else {
        if (this.outputActiveTool !== tool) {
          this.previousTool = this.outputActiveTool;
          this.outputActiveTool = tool;
        }
      }
    },
    // hex: choose that colour (and clear the slot's none flag); null: set the slot to none.
    // remember: false while a native picker is being dragged, so only the final colour is recent.
    setColor(slot, hex, { remember = true } = {}) {
      const none = slot === 'fg' ? 'editFgNone' : 'editBgNone';
      if (hex === null) {
        this[none] = true;
        return;
      }
      this[slot === 'fg' ? 'editFgColor' : 'editBgColor'] = hex;
      this[none] = false;
      if (remember) this.recentColors = [hex, ...this.recentColors.filter(c => c !== hex)].slice(0, RECENT_COLORS);
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

