<script>
import { mapState, mapActions, mapWritableState } from 'pinia';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

export default {
  name: 'ProjectActions',
  computed: {
    ...mapState(useProjectStore, ['image', 'isDirty']),
    ...mapWritableState(useWorkspaceStore, ['editorTab']),
  },
  methods: {
    ...mapActions(useProjectStore, ['exportFile', 'saveProject', 'clearImage']),
    confirmNewProject() {
      if (this.isDirty) {
        if (!confirm('You have unsaved changes. Are you sure you want to start a new project?')) {
          return;
        }
      }
      this.clearImage();
      this.editorTab = 'input';
    },
  },
};
</script>

<template>
  <article class="project-actions">
    <button @click="saveProject" :disabled="!image" class="primary">Save Project (.phosphor)</button>
    <button @click="exportFile('ans')" :disabled="!image" class="secondary">Export .ans</button>
    <button @click="exportFile('utf8ans')" :disabled="!image" class="secondary">Export .utf8ans</button>
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
