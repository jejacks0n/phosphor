<script setup>
import { watch, watchEffect, onMounted, onBeforeUnmount } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { useAutosave } from '@/composables/useAutosave';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore } from '@/store/RoomStore';
import { setGlyphRasterizer, rasterizeCoverage } from '@/lib/GlyphCoverage';
import { setDisplayFont } from '@/lib/displayFonts';
import { loadFonts } from '@/lib/userFonts';
import { charRowsOf } from '@/lib/Cells';

import EditWorkspace from '@/components/EditWorkspace.vue';
import ChatPanel from '@/components/social/ChatPanel.vue';
import ControlPanel from '@/components/ControlPanel.vue';
import AboutPhosphor from '@/components/AboutPhosphor.vue';
import LegalDialog from '@/components/LegalDialog.vue';
import SaveDialog from '@/components/SaveDialog.vue';
import VersionsDialog from '@/components/VersionsDialog.vue';
import ShortcutsDialog from '@/components/ShortcutsDialog.vue';
import AppToast from '@/components/AppToast.vue';

const project = useProjectStore();
const workspace = useWorkspaceStore();
const room = useRoomStore();
const { image } = storeToRefs(project);
const { activeTool, isPainting, isCtrlPressed, isMiddleClick, showAboutModal, saveDialog, shortcutsOpen, legalPage, versionsOpen } = storeToRefs(workspace);

// The theme on <html>, for global.css: the one picked, or with System the computer's (and it follows a change).
const prefersLight = useMediaQuery('(prefers-color-scheme: light)');
watchEffect(() => {
  document.documentElement.dataset.theme = workspace.theme === 'system' ? (prefersLight.value ? 'light' : 'dark') : workspace.theme;
});

// SOCIAL: a link back from the server is read at load; the rest waits for the tab (a server that can't
// be reached leaves the editor be).
useSocialStore().start();

const autosave = useAutosave();
const { ready, recent, openRecent } = autosave;

// Leaving with unsaved changes asks first, unless they're safe in the browser and the art has been
// saved to a file at least once. A room you host always asks.
function onBeforeUnload(e) {
  project.commitPending(); // text typed a moment ago counts
  if ((project.image && project.isDirty && !(project.savedToFile && autosave.current.value)) || room.role === 'host') {
    e.preventDefault();
    e.returnValue = '';
  }
}

// Select and the Magic Wand go with you: leave the PIXEL or ANSI tab (by way of SAUCE or not) with
// either in hand, and the other one takes it. Every other tool stays with its own tab.
let lastEditTab = workspace.editorTab;
watch(() => workspace.editorTab, (tab) => {
  if (tab !== 'input' && tab !== 'output') return;
  const left = lastEditTab;
  lastEditTab = tab;
  if (left === tab) return;
  const tool = left === 'input' ? workspace.inputActiveTool : workspace.outputActiveTool;
  if (tool === 'select' || tool === 'wand') workspace[tab === 'input' ? 'inputActiveTool' : 'outputActiveTool'] = tool;
});

// When the grid changes (in either view), the Text cursor stays on the grid and the selection (and
// the Picker's last pick), which may no longer fit, are dropped. A new document drops them too
// (ProjectStore.newDocument).
watch(() => [project.cols, project.rows], () => {
  workspace.selection = null;
  workspace.wand = null;
  workspace.lastPick = null;
  const cursor = workspace.textCursor;
  if (cursor) {
    workspace.textCursor = {
      col: Math.min(cursor.col, Math.max(0, project.cols - 1)),
      row: Math.min(cursor.row, Math.max(0, charRowsOf(project.rows) - 1)),
    };
  }
});

// The fonts you've loaded, from this browser. Until they're read, no font is set (the one chosen may
// be one of them).
loadFonts().then((fonts) => { workspace.userFonts = fonts; }, () => { workspace.userFonts = []; });

// Glyph coverage is measured in the font the art is drawn in, which loads lazily; either view can be
// shown first, so install the rasterizer here once that font is ready (again when it or its size
// changes: that drops what was measured before), then re-render.
let fontChange = 0;
watch(() => workspace.userFonts && JSON.stringify(workspace.displayFontSpec), (spec) => {
  if (!spec) return;
  const font = JSON.parse(spec), change = ++fontChange;
  setDisplayFont(font).then(() => {
    if (change !== fontChange) return; // changed again meanwhile
    setGlyphRasterizer(rasterizeCoverage);
    workspace.displayFontLoaded = font;
    if (project.image) project.render();
  });
}, { immediate: true });

// Smooth (anti-aliased) or sharp text, for the art's text styled in CSS (the DOM view, glyph cells,
// the Characters field); the canvas view follows the setting itself (AnsiEditor).
watch(() => workspace.smoothText, (smooth) => {
  const style = document.documentElement.style;
  style.setProperty('--display-font-smoothing', smooth ? 'antialiased' : 'none');
  style.setProperty('--display-moz-font-smoothing', smooth ? 'grayscale' : 'unset');
}, { immediate: true });

onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload));
</script>

<template>
  <main :class="[`tool-${activeTool}`, { 'is-painting': isPainting, 'with-image': !!image, 'ctrl-pressed': isCtrlPressed, 'middle-clicking': isMiddleClick }]">
    <ControlPanel/>
    <EditWorkspace :ready="ready" :recent="recent" :open-recent="openRecent"/>
    <ChatPanel v-if="room.inRoom"/>
    <AboutPhosphor v-if="showAboutModal" @close="showAboutModal = false"/>
    <SaveDialog v-if="saveDialog" :ext="saveDialog" @close="saveDialog = null"/>
    <VersionsDialog v-if="versionsOpen" :flush="autosave.flush" :restore-version="autosave.restoreVersion" @close="versionsOpen = false"/>
    <ShortcutsDialog v-if="shortcutsOpen" @close="shortcutsOpen = false"/>
    <LegalDialog v-if="legalPage" :page="legalPage" @open="legalPage = $event" @close="legalPage = null"/>
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
