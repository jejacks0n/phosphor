import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    activeTool: 'pencil',
    previousTool: null,
    editFgColor: useLocalStorage('phosphor.editFgColor', '#ffffff'),
    editZoom: useLocalStorage('phosphor.editZoom', 4),
    previewTab: useLocalStorage('phosphor.previewTab', 'source'),
    editMode: false,
    settingsOpen: false,

    // Brush Settings
    editBrushSize: useLocalStorage('phosphor.editBrushSize', 2.5),
    editBrushOpacity: useLocalStorage('phosphor.editBrushOpacity', 100),
    editBrushFlow: useLocalStorage('phosphor.editBrushFlow', 50),
    editBrushHardness: useLocalStorage('phosphor.editBrushHardness', 50),

    // Fill Settings
    editFillTolerance: useLocalStorage('phosphor.editFillTolerance', 0),
    editFillContiguous: useLocalStorage('phosphor.editFillContiguous', true),
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
      this.editZoom = Math.max(0.1, Math.min(32, z));
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
