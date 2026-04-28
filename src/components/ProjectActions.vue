<script>
import { mapState, mapActions } from 'pinia';
import { useProjectStore } from '@/store/ProjectStore';

export default {
  name: 'ProjectActions',
  computed: {
    ...mapState(useProjectStore, ['image', 'hasEdits']),
  },
  methods: {
    ...mapActions(useProjectStore, ['exportFile', 'saveProject', 'clearImage']),
    confirmNewProject() {
      if (this.hasEdits) {
        if (!confirm('You have unsaved changes. Are you sure you want to start a new project?')) {
          return;
        }
      }
      this.clearImage();
    },
  },
};
</script>

<template>
  <div class="project-actions">
    <button @click="saveProject" :disabled="!image" class="secondary">Save Project (.phosphor)</button>
    <button @click="exportFile('ans')" :disabled="!image" class="primary">Export .ans</button>
    <button @click="exportFile('utf8ans')" :disabled="!image" class="primary">Export .utf8ans</button>
    <div class="divider"></div>
    <button @click="confirmNewProject" :disabled="!image" class="danger">Start New Project</button>
  </div>
</template>

<style scoped>
.project-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 10px 0;
}

button.danger {
  background: #ff4444;
  border-color: #ff4444;
  color: white;
}

button.danger:hover:not(:disabled) {
  background: #ff2222;
  border-color: #ff2222;
  color: white;
}
</style>
