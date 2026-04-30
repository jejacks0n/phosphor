import { defineStore } from 'pinia';

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    inputActiveTool: 'hand',
    outputActiveTool: 'pencil',
    previousTool: null,
    editFgColor:  '#ffffff',
    editZoom:  5,
    editorTab: 'input',
    editMode: false,
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
    }
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
    setEditFgColor(color) {
      this.editFgColor = color;
    },
    setEditZoom(z) {
      this.editZoom = Math.max(1, Math.min(16, z));
    },
    setEditorTab(tab) {
      this.editorTab = tab;
    },
    setEditMode(mode) {
      this.editMode = mode;
    },
    toggleSettings() {
      this.settingsOpen = !this.settingsOpen;
    },
    setEditBrushSize(size) {
      this.editBrushSize = size;
    },
    setEditEraserSize(size) {
      this.editEraserSize = size;
    },
    setEditBrushOpacity(opacity) {
      this.editBrushOpacity = opacity;
    },
    setEditBrushFlow(flow) {
      this.editBrushFlow = flow;
    },
    setEditBrushHardness(hardness) {
      this.editBrushHardness = hardness;
    },
    setEditFillTolerance(tolerance) {
      this.editFillTolerance = tolerance;
    },
    setEditFillContiguous(contiguous) {
      this.editFillContiguous = contiguous;
    },
    setEditFillFeather(feather) {
      this.editFillFeather = feather;
    },
    setShowAboutModal(show) {
      this.showAboutModal = show;
    },
  }
});

export const workspaceStateKeys = [
  'activeTool',
  'inputActiveTool',
  'outputActiveTool',
  'previousTool',
  'editFgColor',
  'editZoom',
  'editorTab',
  'editMode',
  'isPainting',
  'isCtrlPressed',
  'isMiddleClick',
  'settingsOpen',
  'showAboutModal',
  'inputScrollX',
  'inputScrollY',
  'ansiScrollX',
  'ansiScrollY',
  'editBrushSize',
  'editEraserSize',
  'editBrushOpacity',
  'editBrushFlow',
  'editBrushHardness',
  'editFillTolerance',
  'editFillContiguous',
  'editFillFeather'
];

export const workspaceActionKeys = [
  'setActiveTool',
  'setEditFgColor',
  'setEditZoom',
  'setEditorTab',
  'setEditMode',
  'toggleSettings',
  'setShowAboutModal',
  'setEditBrushSize',
  'setEditEraserSize',
  'setEditBrushOpacity',
  'setEditBrushFlow',
  'setEditBrushHardness',
  'setEditFillTolerance',
  'setEditFillContiguous',
  'setEditFillFeather',
];
