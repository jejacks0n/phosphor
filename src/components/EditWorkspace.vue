<script setup>
import { computed, watch, onMounted } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { useSocialStore } from '@/store/SocialStore';
import { toast } from '@/composables/useToast';
import { isProjectFile } from '@/document/projectIO';
import { isArtFile, readArtFile } from '@/lib/ArtFile';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { usePlayback } from '@/composables/usePlayback';

import EditTabs from '@/components/EditTabs.vue';
import ZeroState from '@/components/ZeroState.vue';
import SauceEditor from '@/components/SauceEditor.vue';
import DropZone from '@/components/DropZone.vue';
import AnimationBar from '@/components/AnimationBar.vue';
import AnsiEditor from '@/components/AnsiEditor.vue';
import InputEditor from '@/components/InputEditor.vue';
import EditToolbar from '@/components/EditToolbar.vue';
import SocialTab from '@/components/social/SocialTab.vue';
import ConsentDialog from '@/components/social/ConsentDialog.vue';
import ChoiceDialog from '@/components/ChoiceDialog.vue';

defineProps({
  ready: { type: Boolean, default: true },
  recent: { type: Array, default: () => [] },
  openRecent: Function,
});

const project = useProjectStore();
const workspace = useWorkspaceStore();
const drawing = useDrawingStore();
const social = useSocialStore();
useKeyboardShortcuts(project, workspace);
const playback = usePlayback();

onMounted(() => project.render());
watch(() => project.processParams, () => project.render(), { deep: true });

async function handleFileSelected(file) {
  // An art file over a drawing asks whether to add it or open it (artDrop), even in a room: adding is a paste.
  if (project.image && isArtFile(file.name)) return (workspace.artDrop = { file, at: null });
  if (drawing.offWithOthers) return toast(drawing.offWithOthers);
  project.commitPending(); // text typed a moment ago counts
  if (project.image && project.isDirty && !confirm(`You have unsaved changes. Open ${file.name} anyway?`)) return;
  if (isProjectFile(file.name)) await project.loadProject(file);
  else if (isArtFile(file.name)) return openArt(file);
  else await project.setImageFromFile(file);
  workspace.editorTab = 'output';
}

async function openArt(file) {
  try {
    await project.openArtFile(file);
  } catch (error) {
    if (!error.userMessage) throw error;
    return toast(error.userMessage); // nothing changed, so stay where we are
  }
  workspace.editorTab = 'output';
}

// The dropped art file's question: added as a paste is (floating and selected, where it was dropped or at the
// view's top-left), or opened in place of this drawing (not in a room where opening is off).
const artChoices = computed(() => [
  { id: 'add', title: 'Add to this drawing', text: `It lands ${workspace.artDrop?.at ? 'where you dropped it' : 'at the top-left of the view'}, on the edit layer, to drag into place.` },
  ...(drawing.offWithOthers ? [] : [{ id: 'open', title: 'Open instead', text: 'In place of this drawing.' }]),
]);
async function chooseArt(choice) {
  const { file, at } = workspace.artDrop;
  workspace.artDrop = null;
  if (choice === 'open') {
    project.commitPending(); // text typed a moment ago counts
    if (project.isDirty && !confirm(`You have unsaved changes. Open ${file.name} anyway?`)) return;
    return openArt(file);
  }
  if (playback.playing) playback.pause(); // it lands on the frame showing
  let art;
  try {
    art = readArtFile(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch (error) {
    if (!error.userMessage) throw error;
    return toast(error.userMessage);
  }
  if (project._paused) return; // refused, as a paste is
  // Dropped beside the drawing (or on the SAUCE tab): the top-left of the art view last shown, which comes back.
  workspace.editorTab = workspace.viewTab;
  const { col, row } = at ?? (workspace.viewTab === 'output' ? workspace.ansiViewOrigin : workspace.pixelViewOrigin);
  const pasted = project.pasteSelection({ w: art.cols, h: art.rows, cells: art.cells }, col, row); // a block's h is lines, as the reader's rows are
  if (pasted) workspace.selectAll(pasted); // selected, with the Select tool, to drag into place
}
</script>

<template>
  <section
      class="edit-workspace"
      :class="{ 'settings-open': workspace.settingsOpen, editing: workspace.editMode, image: !!project.image }"
      @click="workspace.settingsOpen && workspace.toggleSettings()"
  >
    <EditTabs v-model="workspace.editorTab"/>
    <template v-if="workspace.editorTab === 'social'">
      <SocialTab v-if="social.allowed"/>
      <ConsentDialog v-else/>
    </template>
    <template v-else>
      <EditToolbar v-if="project.image && workspace.editMode"/>
      <DropZone @file-dropped="handleFileSelected">
        <div class="edit-viewport viewport" :class="{ editing: workspace.editMode }" v-if="project.image">
          <InputEditor v-if="workspace.editorTab === 'input'"/>
          <AnsiEditor v-if="workspace.editorTab === 'output'"/>
          <SauceEditor v-if="workspace.editorTab === 'sauce'"/>
        </div>

        <ZeroState v-else :ready="ready" :recent="recent" :open-recent="openRecent" @file-selected="handleFileSelected" @start-blank="project.setBlankCanvas"/>
      </DropZone>
      <ChoiceDialog
          v-if="workspace.artDrop"
          :title="`Add ${workspace.artDrop.file.name}?`"
          :sub="drawing.offWithOthers ? 'Add it to this drawing.' : 'Add it to this drawing, or open it in place of this one.'"
          :choices="artChoices"
          @choose="chooseArt"
          @cancel="workspace.artDrop = null"
      />
      <AnimationBar v-if="project.image && project.animate && ['input', 'output'].includes(workspace.editorTab)"/>
    </template>
  </section>
</template>

<style scoped>
section.edit-workspace {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
  border-radius: 5px;
  background: var(--surface-1);
  border: 1px solid var(--accent);
  overscroll-behavior: none;
}

section.edit-workspace.editing.image {
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0;
  background-color: var(--surface-0);
  background-image: linear-gradient(45deg, var(--surface-dark) 25%, transparent 25%),
  linear-gradient(-45deg, var(--surface-dark) 25%, transparent 25%),
  linear-gradient(45deg, transparent 75%, var(--surface-dark) 75%),
  linear-gradient(-45deg, transparent 75%, var(--surface-dark) 75%);
}

div.viewport {
  display: flex;
  flex: 1;
  min-width: 100%;
  min-height: 100%;
}

@media (max-width: 768px) {
  section.edit-workspace {
    position: fixed;
    width: 100vw;
    height: 100dvh;
    top: 0;
    left: 0;
    border: 0;
    border-radius: 0;
    transition: transform 0.2s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  section.edit-workspace.settings-open {
    transform: translateX(260px);
  }
}

@media (prefers-reduced-motion: reduce) {
  section.edit-workspace {
    transition: none;
  }
}
</style>
