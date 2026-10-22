<script>
import { mapState, mapWritableState } from 'pinia';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { setGlyphRasterizer, rasterizeCoverage, DISPLAY_FONT_CSS } from '@/lib/GlyphCoverage';
import { charRowsOf } from '@/lib/Cells';

import EditWorkspace from '@/components/EditWorkspace.vue';
import ControlPanel from '@/components/ControlPanel.vue';
import AboutPhosphor from '@/components/AboutPhosphor.vue';
import AppToast from '@/components/AppToast.vue';

export default {
  name: 'App',
  components: {
    EditWorkspace,
    ControlPanel,
    AboutPhosphor,
    AppToast,
  },
  computed: {
    ...mapState(useProjectStore, ['image', 'isDirty']),
    ...mapState(useWorkspaceStore, ['activeTool', 'isPainting', 'isCtrlPressed', 'isMiddleClick']),
    ...mapWritableState(useWorkspaceStore, ['showAboutModal']),
  },
  mounted() {
    window.addEventListener('beforeunload', this.onBeforeUnload);
    // Glyph coverage is measured in the ANSI view's font, which loads lazily; either view can be
    // shown first, so install the rasterizer here once that font is ready, then re-render.
    document.fonts.load(DISPLAY_FONT_CSS).then(() => {
      setGlyphRasterizer(rasterizeCoverage);
      const project = useProjectStore();
      if (project.image) project.render();
    });

    // When the grid or image changes (in either view), the Text cursor stays on the grid and the
    // selection, which may no longer fit, is dropped.
    const project = useProjectStore(), workspace = useWorkspaceStore();
    this.$watch(() => [project.cols, project.rows, project.image], () => {
      workspace.selection = null;
      const cursor = workspace.textCursor;
      if (cursor) {
        workspace.textCursor = {
          col: Math.min(cursor.col, Math.max(0, project.cols - 1)),
          row: Math.min(cursor.row, Math.max(0, charRowsOf(project.rows) - 1)),
        };
      }
    });
  },
  beforeUnmount() {
    window.removeEventListener('beforeunload', this.onBeforeUnload);
  },
  methods: {
    onBeforeUnload(e) {
      if (this.image && this.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    },
  },
};
</script>

<template>
  <main :class="[`tool-${activeTool}`, { 'is-painting': isPainting, 'with-image': !!image, 'ctrl-pressed': isCtrlPressed, 'middle-clicking': isMiddleClick }]">
    <ControlPanel/>
    <EditWorkspace/>
    <AboutPhosphor v-if="showAboutModal" @close="showAboutModal = false"/>
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
