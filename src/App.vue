<script>
import { mapState } from 'pinia';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import EditWorkspace from '@/components/EditWorkspace.vue';
import ControlPanel from '@/components/ControlPanel.vue';

export default {
  name: 'App',
  components: {
    EditWorkspace,
    ControlPanel,
  },
  computed: {
    ...mapState(useProjectStore, ['image', 'hasEdits', 'isDirty']),
    ...mapState(useWorkspaceStore, ['activeTool', 'isPainting', 'isCtrlPressed', 'isMiddleClick']),
  },
  mounted() {
    window.addEventListener('beforeunload', this.onBeforeUnload);
  },
  beforeUnmount() {
    window.removeEventListener('beforeunload', this.onBeforeUnload);
  },
  methods: {
    onBeforeUnload(e) {
      if (this.image && (this.hasEdits || this.isDirty)) {
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
}
</style>
