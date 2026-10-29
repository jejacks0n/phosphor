<script setup>
import { nameColor } from '@/social/names';

// A name's color, as a small square before it: names themselves are all in the text color, since some
// colors can't be read against one theme or the other.
defineProps({ name: { type: String, required: true } });
</script>

<template>
  <span class="swatch" aria-hidden="true" :style="{ background: nameColor(name) }"></span>
</template>

<style scoped>
span.swatch {
  display: inline-block;
  width: 0.8em;
  height: 0.8em;
  margin-right: 0.45em;
  border-radius: 2px;
  vertical-align: -0.05em;
}
</style>
