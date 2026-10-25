<script setup>
import { watch, onMounted } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { isProjectFile } from '@/document/projectIO';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';

import EditTabs from '@/components/EditTabs.vue';
import ZeroState from '@/components/ZeroState.vue';
import SauceEditor from '@/components/SauceEditor.vue';
import DropZone from '@/components/DropZone.vue';
import AnsiEditor from '@/components/AnsiEditor.vue';
import InputEditor from '@/components/InputEditor.vue';
import EditToolbar from '@/components/EditToolbar.vue';

const project = useProjectStore();
const workspace = useWorkspaceStore();
useKeyboardShortcuts(project, workspace);

onMounted(() => project.render());
watch(() => project.processParams, () => project.render(), { deep: true });

async function handleFileSelected(file) {
  project.commitPending(); // text typed a moment ago counts
  if (project.image && project.isDirty && !confirm(`You have unsaved changes. Open ${file.name} anyway?`)) return;
  if (isProjectFile(file.name)) await project.loadProject(file);
  else await project.setImageFromFile(file);
  workspace.editorTab = 'output';
}
</script>

<template>
  <section
      class="edit-workspace"
      :class="{ 'settings-open': workspace.settingsOpen, editing: workspace.editMode, image: !!project.image }"
      @click="workspace.settingsOpen && workspace.toggleSettings()"
  >
    <EditTabs v-model="workspace.editorTab"/>
    <EditToolbar v-if="project.image && workspace.editMode"/>
    <DropZone @file-dropped="handleFileSelected">
      <div class="edit-viewport viewport" :class="{ editing: workspace.editMode }" v-if="project.image">
        <InputEditor v-if="workspace.editorTab === 'input'"/>
        <AnsiEditor v-if="workspace.editorTab === 'output'"/>
        <SauceEditor v-if="workspace.editorTab === 'sauce'"/>
      </div>

      <ZeroState v-else @file-selected="handleFileSelected" @start-blank="project.setBlankCanvas"/>
    </DropZone>
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
