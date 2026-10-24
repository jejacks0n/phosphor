<script setup>
import { watch, onMounted, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { setGlyphRasterizer, rasterizeCoverage, DISPLAY_FONT_CSS } from '@/lib/GlyphCoverage';
import { charRowsOf } from '@/lib/Cells';

import EditWorkspace from '@/components/EditWorkspace.vue';
import ControlPanel from '@/components/ControlPanel.vue';
import AboutPhosphor from '@/components/AboutPhosphor.vue';
import SaveDialog from '@/components/SaveDialog.vue';
import ShortcutsDialog from '@/components/ShortcutsDialog.vue';
import AppToast from '@/components/AppToast.vue';

const project = useProjectStore();
const workspace = useWorkspaceStore();
const { image } = storeToRefs(project);
const { activeTool, isPainting, isCtrlPressed, isMiddleClick, showAboutModal, saveDialog, shortcutsOpen } = storeToRefs(workspace);

// Leaving with unsaved changes asks first.
function onBeforeUnload(e) {
  if (project.image && project.isDirty) {
    e.preventDefault();
    e.returnValue = '';
  }
}

// When the grid changes (in either view), the Text cursor stays on the grid and the selection (and
// the Picker's last pick), which may no longer fit, are dropped. A new document drops them too
// (ProjectStore.newDocument).
watch(() => [project.cols, project.rows], () => {
  workspace.selection = null;
  workspace.lastPick = null;
  const cursor = workspace.textCursor;
  if (cursor) {
    workspace.textCursor = {
      col: Math.min(cursor.col, Math.max(0, project.cols - 1)),
      row: Math.min(cursor.row, Math.max(0, charRowsOf(project.rows) - 1)),
    };
  }
});

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload);
  // Glyph coverage is measured in the ANSI view's font, which loads lazily; either view can be
  // shown first, so install the rasterizer here once that font is ready, then re-render.
  document.fonts.load(DISPLAY_FONT_CSS).then(() => {
    setGlyphRasterizer(rasterizeCoverage);
    if (project.image) project.render();
  });
});
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload));
</script>

<template>
  <main :class="[`tool-${activeTool}`, { 'is-painting': isPainting, 'with-image': !!image, 'ctrl-pressed': isCtrlPressed, 'middle-clicking': isMiddleClick }]">
    <ControlPanel/>
    <EditWorkspace/>
    <AboutPhosphor v-if="showAboutModal" @close="showAboutModal = false"/>
    <SaveDialog v-if="saveDialog" :ext="saveDialog" @close="saveDialog = null"/>
    <ShortcutsDialog v-if="shortcutsOpen" @close="shortcutsOpen = false"/>
    <AppToast/>
  </main>
</template>

<style scoped>
main {
  display: flex;
  flex-direction: row;
  height: 100svh;
  width: 100%;
  gap: 2px;
  padding: 8px;
  box-sizing: border-box;
  background: var(--background) radial-gradient(circle at 270px 0, var(--background-highlight) 0, transparent 400px);
  overscroll-behavior: none;
}
</style>
