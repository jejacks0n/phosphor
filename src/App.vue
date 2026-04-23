<script>
import AnsiWorkspace from '@/components/AnsiWorkspace.vue';
import ControlPanel from '@/components/ControlPanel.vue';

export default {
  name: 'App',
  components: {
    AnsiWorkspace,
    ControlPanel,
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
  height: 100vh;
  width: 100%;
  gap: 2px;
  padding: 8px;
  box-sizing: border-box;
  background: #313439 radial-gradient(circle at 270px 0, rgba(255, 170, 73, 0.2) 0, #313439 400px);
}
</style>
