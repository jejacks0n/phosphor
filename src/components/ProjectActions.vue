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
const workspace = useWorkspaceStore();
const { exportModal, versionsOpen } = storeToRefs(workspace);
</script>

<template>
  <article class="project-actions">
    <button @click="workspace.saveFile()" :disabled="!image" class="primary">{{ t('actions.saveProject') }}</button>
    <button @click="exportModal = true" :disabled="!image" class="secondary">{{ t('actions.export') }}</button>
    <button @click="versionsOpen = true" :disabled="!image || !!drawing.offWithOthers" :title="drawing.offWithOthers" class="secondary">{{ t('actions.versions') }}</button>
    <hr/>
    <button @click="workspace.newProject()" :disabled="!image || !!drawing.offWithOthers" :title="drawing.offWithOthers" class="danger">{{ t('actions.newProject') }}</button>
  </article>
</template>

<style scoped>
article.project-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
