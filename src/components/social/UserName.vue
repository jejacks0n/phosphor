<script setup>
import { nameColor } from '@/social/names';

// A person's name, wherever one shows: in the text around it, after a small square of the name's color
// (a name itself isn't drawn in its color, since some colors can't be read on one theme or the other).
// Whatever goes in the slot follows the name, as " (you)".
defineProps({ name: { type: String, required: true } });
</script>

<template>
  <span><span class="swatch" aria-hidden="true" :style="{ background: nameColor(name) }"></span>{{ name }}<slot /></span>
</template>

<style scoped>
span.swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 6px;
  border-radius: 2px;
  vertical-align: -1px;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 25%, transparent);   /* so a white or a black square shows on either theme */
}
</style>
