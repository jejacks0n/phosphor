<script setup>
import { computed } from 'vue';
import { nameColor, nameGlyph, nameInk } from '@/social/names';

// A person's name, wherever one shows: in the text around it, after a small cell of the name's own, its
// glyph on its color (a name itself isn't drawn in its color, since some colors can't be read on one theme
// or the other). Whatever goes in the slot follows the name, as " (you)".
const props = defineProps({ name: { type: String, required: true } });
const cell = computed(() => {
  const color = nameColor(props.name);
  return { background: color, color: nameInk(color) };
});
</script>

<template>
  <!-- The glyph is drawn by CSS, so it isn't part of the name's text (to copy, or to a screen reader). -->
  <span><span class="cell" aria-hidden="true" :data-glyph="nameGlyph(name)" :style="cell"></span>{{ name }}<slot /></span>
</template>

<style scoped>
span.cell {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 6px;
  border-radius: 2px;
  overflow: hidden;
  vertical-align: -2px;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 25%, transparent);   /* a white or a black cell shows on either theme */
  font: 400 16px/14px 'IBM VGA 8x16', monospace;   /* the font's own size, so it's sharp (the cell clips its blank top and bottom rows) */
  letter-spacing: 0;
  text-align: center;
  text-transform: none;
}
span.cell::before {
  content: attr(data-glyph) / '';
}
</style>
