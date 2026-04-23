<!--<script setup>-->

<!--import { ref, onMounted } from 'vue'-->

<!--// reactive state-->
<!--const count = ref(0)-->

<!--// functions that mutate state and trigger updates-->
<!--function increment() {-->
<!--  count.value++-->
<!--}-->

<!--// lifecycle hooks-->
<!--onMounted(() => {-->
<!--  console.log(`The initial count is ${count.value}.`)-->
<!--})-->

<!--</script>-->

<script>
import PlayCoreCanvas from '@/components/PlayCoreCanvas.vue';
import CommandPanel from '@/components/CommandPanel.vue';

export default {
  name: 'App',
  components: {
    PlayCoreCanvas,
    CommandPanel,
  },
  // created() {
  //   // console.log(storeToRefs(useCurrentFileStore()))
  //   // this.$watch(allCurrentFileKeys, storeToRefs(useCurrentFileStore()), this.storeWatcher)
  //   useCurrentFileStore().$subscribe((a, b) => {
  //     // eslint-disable-next-line
  //     debugger
  //
  //     console.log(a, b)
  //   }, { detached: true })
  // },
};
//<img alt="Vue logo" src="./assets/logo.png">
</script>

<template>
  <PlayCoreCanvas/>
  <CommandPanel/>
</template>

<style>
html, body {
  margin: 0;
  padding: 0;
  font-family: Avenir, Helvetica, Arial, sans-serif;
  background: #222222;
}
</style>
