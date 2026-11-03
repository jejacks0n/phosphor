<script setup>
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useDrawingStore } from '@/store/DrawingStore';

const { t } = useI18n();
const drawing = useDrawingStore();
const project = useProjectStore();
const { image } = storeToRefs(project);
const { editorTab, saveDialog, versionsOpen } = storeToRefs(useWorkspaceStore());

function confirmNewProject() {
  project.commitPending(); // text typed a moment ago counts
  if (project.isDirty && !confirm(t('actions.confirmNew'))) return;
  project.clearImage();
  editorTab.value = 'input';
}
</script>

<template>
  <article class="project-actions">
    <button @click="saveDialog = 'phosphor'" :disabled="!image" class="primary">{{ t('actions.saveProject') }}</button>
    <button @click="saveDialog = 'ans'" :disabled="!image" class="secondary">{{ t('actions.exportAns') }}</button>
    <button @click="saveDialog = 'utf8ans'" :disabled="!image" class="secondary">{{ t('actions.exportUtf8ans') }}</button>
    <template v-if="project.hasFrames">
      <button @click="saveDialog = 'ansimation'" :disabled="!image" class="secondary">{{ t('actions.exportAnimatedAns') }}</button>
      <button @click="saveDialog = 'utf8ansimation'" :disabled="!image" class="secondary">{{ t('actions.exportAnimatedUtf8ans') }}</button>
      <button @click="saveDialog = 'cast'" :disabled="!image" class="secondary">{{ t('actions.exportCast') }}</button>
      <button @click="saveDialog = 'gif'" :disabled="!image" class="secondary">{{ t('actions.exportGif') }}</button>
    </template>
    <button @click="versionsOpen = true" :disabled="!image || !!drawing.offWithOthers" :title="drawing.offWithOthers" class="secondary">{{ t('actions.versions') }}</button>
    <hr/>
    <button @click="confirmNewProject" :disabled="!image || !!drawing.offWithOthers" :title="drawing.offWithOthers" class="danger">{{ t('actions.newProject') }}</button>
  </article>
</template>

<style scoped>
article.project-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
