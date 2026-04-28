<script>
import { mapState } from 'pinia';
import { useProjectStore } from '@/store/ProjectStore';
import AnsiWorkspace from '@/components/AnsiWorkspace.vue';
import ControlPanel from '@/components/ControlPanel.vue';

export default {
  name: 'App',
  components: {
    AnsiWorkspace,
    ControlPanel,
  },
  computed: {
    ...mapState(useProjectStore, ['image', 'hasEdits']),
  },
  mounted() {
    window.addEventListener('beforeunload', this.onBeforeUnload);
  },
  beforeUnmount() {
    window.removeEventListener('beforeunload', this.onBeforeUnload);
  },
  methods: {
    onBeforeUnload(e) {
      if (this.image && this.hasEdits) {
        e.preventDefault();
        e.returnValue = '';
      }
    },
  },
};
</script>

<template>
  <main>
    <ControlPanel/>
    <AnsiWorkspace/>
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
