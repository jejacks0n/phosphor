<script setup>
import { computed } from 'vue';
import { nameColor, nameGlyph, nameInk } from '@/social/names';
import { useRoomStore } from '@/store/RoomStore';

// A person's name, wherever one shows: in the text around it, after a small cell of the name's own, its
// glyph on its color (a name itself isn't drawn in its color, since some colors can't be read on one theme
// or the other). Whatever goes in the slot follows the name, as " (you)". On desktop, where anyone can pick any name,
// a name more than one person in the room goes by is told apart by the start of their sub: "wren #A1b2".
const props = defineProps({ name: { type: String, required: true }, sub: { type: String, default: null } });
const room = import.meta.env.VITE_DESKTOP === '1' ? useRoomStore() : null;
const mark = computed(() => (room && props.sub && room.sameNames.has(props.name) ? ` #${props.sub.slice(0, 4)}` : ''));
const cell = computed(() => {
  const color = nameColor(props.name);
  return { background: color, color: nameInk(color) };
});
</script>

<template>
  <!-- The glyph is drawn by CSS, so it isn't part of the name's text (to copy, or to a screen reader). -->
  <span><span class="cell" aria-hidden="true" :data-glyph="nameGlyph(name)" :style="cell"></span>{{ name }}{{ mark }}<slot /></span>
</template>

<style scoped>
span.cell {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 6px;
  border-radius: 2px;
  overflow: hidden;
  vertical-align: middle;   /* centered on the lowercase letters, at any size of text around it */
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
