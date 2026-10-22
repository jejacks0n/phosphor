import { defineStore } from 'pinia';

export const clampZoom = (z) => Math.max(1, Math.min(16, z));

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    inputActiveTool: 'brush',
    outputActiveTool: 'hand',
    previousTool: null,
    editFgColor:  '#ffffff',
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
    setEditZoom(z) {
      this.editZoom = clampZoom(z);
    },
    toggleSettings() {
      this.settingsOpen = !this.settingsOpen;
    },
  }
});

