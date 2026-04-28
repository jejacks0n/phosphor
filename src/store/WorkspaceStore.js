import { defineStore } from 'pinia';

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    activeTool: 'pencil',
    previousTool: null,
    editFgColor:  '#ffffff',
    editZoom:  5,
    previewTab: 'source',
    editMode: false,
    isPainting: false,
    isCtrlPressed: false,
    isMiddleClick: false,
    settingsOpen: false,

    // Brush Settings
    editBrushSize:  2.5,
    editEraserSize: 1,
    editBrushOpacity:  100,
    editBrushFlow:  25,
    editBrushHardness:  50,

    // Fill Settings
    editFillTolerance:  10,
    editFillContiguous:  true,
  }),
  actions: {
    setActiveTool(tool) {
      if (this.activeTool !== tool) {
        this.previousTool = this.activeTool;
        this.activeTool = tool;
      }
    },
    setEditFgColor(color) {
      this.editFgColor = color;
    },
    setEditZoom(z) {
      this.editZoom = Math.max(1, Math.min(16, z));
    },
    setPreviewTab(tab) {
      this.previewTab = tab;
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
    resetToolToHand() {
      this.setActiveTool('hand');
    }
  }
});
