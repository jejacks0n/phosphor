<script setup>
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

const project = useProjectStore();
const { image } = storeToRefs(project);
const { editorTab, saveDialog } = storeToRefs(useWorkspaceStore());

function confirmNewProject() {
  if (project.isDirty && !confirm('You have unsaved changes. Are you sure you want to start a new project?')) return;
  project.clearImage();
  editorTab.value = 'input';
}
</script>

<template>
  <article class="project-actions">
    <button @click="saveDialog = 'phosphor'" :disabled="!image" class="primary">Save Project (.phosphor)</button>
    <button @click="saveDialog = 'ans'" :disabled="!image" class="secondary">Export .ans</button>
    <button @click="saveDialog = 'utf8ans'" :disabled="!image" class="secondary">Export .utf8ans</button>
    <hr/>
    <button @click="confirmNewProject" :disabled="!image" class="danger">Start New Project</button>
  </article>
</template>

<style scoped>
article.project-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
