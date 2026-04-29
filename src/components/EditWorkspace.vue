<script>
import { mapState, mapWritableState, mapActions } from 'pinia';
import { useProjectStore, projectStateKeys, projectActionKeys } from '@/store/ProjectStore';
import { useWorkspaceStore, workspaceStateKeys, workspaceActionKeys } from '@/store/WorkspaceStore';
import { PROJECT_EXTENSION } from '@/lib/SaveFormat';
import { useImagePipeline } from '@/composables/useImagePipeline';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';

import WorkspaceTabs from '@/components/WorkspaceTabs.vue';
import ZeroState from '@/components/ZeroState.vue';
import SauceEditor from '@/components/SauceEditor.vue';
import DropZone from '@/components/DropZone.vue';
import AnsiEditor from '@/components/AnsiEditor.vue';
import InputEditor from '@/components/InputEditor.vue';
import EditToolbar from '@/components/EditToolbar.vue';

export default {
  name: 'EditWorkspace',
  components: {
    WorkspaceTabs,
    ZeroState,
    SauceEditor,
    DropZone,
    AnsiEditor,
    InputEditor,
    EditToolbar,
  },
  setup() {
    const projectStore = useProjectStore();
    const workspaceStore = useWorkspaceStore();
    
    const { pipelineCanvas, outputCanvas, queueSetup } = useImagePipeline(projectStore);
    useKeyboardShortcuts(projectStore, workspaceStore);

    return {
      pipelineCanvas,
      outputCanvas,
      queueSetup,
    };
  },
  computed: {
    ...mapWritableState(useProjectStore, projectStateKeys),
    ...mapWritableState(useWorkspaceStore, workspaceStateKeys),
    ...mapState(useProjectStore, ['hasEdits', 'clearEditsFlag', 'editCanvas', 'image', 'processParams']),
  },
  mounted() {
    this.queueSetup(this.processParams);
  },
  watch: {
    processParams: {
      deep: true,
      handler() {
        this.queueSetup(this.processParams);
        this.markDirty();
      },
    },
    clearEditsFlag() {
      this.queueSetup(this.processParams);
    },
    editorTab: {
      immediate: true,
      handler(newTab) {
        this.editMode = (newTab === 'output' || newTab === 'input');
      },
    },
  },
  methods: {
    ...mapActions(useProjectStore, projectActionKeys),
    ...mapActions(useWorkspaceStore, workspaceActionKeys),
    async handleFileSelected(file) {
      if (file.name.endsWith(PROJECT_EXTENSION)) {
        await this.loadProject(file);
      } else {
        if (this.image && this.hasEdits) {
          if (!confirm('You have unsaved changes. Are you sure you want to load a new image?')) {
            return;
          }
        }
        await this.setImageFromFile(file);
      }
      this.editorTab = 'output';
    },
  },
};
</script>

<template>
  <section
      class="ansi-workspace"
      :class="{ 'settings-open': settingsOpen, editing: editMode, image: !!image }"
      @click="settingsOpen && toggleSettings()"
  >
    <WorkspaceTabs v-model="editorTab"/>
    <EditToolbar v-if="image && editMode"/>
    <DropZone @file-dropped="handleFileSelected">
      <div class="edit-viewport viewport" :class="{ editing: editMode }" v-if="image">
        <InputEditor
            ref="inputEditor"
            v-if="editorTab === 'input'"
            :canvas="outputCanvas"
            :pipeline-canvas="pipelineCanvas"
        />
        <AnsiEditor
            v-if="editorTab === 'output'"
            :pipeline-canvas="pipelineCanvas"
            :output-canvas="outputCanvas"
        />
        <SauceEditor v-if="editorTab === 'sauce'"/>
      </div>

      <ZeroState v-else @file-selected="handleFileSelected"/>
    </DropZone>
  </section>
</template>

<style scoped>
section.ansi-workspace {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
  border-radius: 5px;
  background: var(--surface-1);
  border: 1px solid var(--accent);
}

section.ansi-workspace.editing.image {
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0;
  background-color: var(--surface-0);
  background-image: linear-gradient(45deg, var(--surface-dark) 25%, transparent 25%),
  linear-gradient(-45deg, var(--surface-dark) 25%, transparent 25%),
  linear-gradient(45deg, transparent 75%, var(--surface-dark) 75%),
  linear-gradient(-45deg, transparent 75%, var(--surface-dark) 75%);
}

div.viewport {
  display: inline-flex;
  min-width: 100%;
  min-height: 100%;
  overflow: hidden;
}

@media (max-width: 768px) {
  section.ansi-workspace {
    position: absolute;
    width: 100vw;
    height: 100dvh;
    top: 0;
    left: 0;
    border: 0;
    border-radius: 0;
    transition: transform 0.2s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  section.ansi-workspace.settings-open {
    transform: translateX(260px);
  }
}

@media (prefers-reduced-motion: reduce) {
  section.ansi-workspace {
    transition: none;
  }
}
</style>
