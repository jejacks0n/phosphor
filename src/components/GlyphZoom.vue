<script setup>
import { onMounted, ref, useTemplateRef } from 'vue';

// A glyph large (useGlyphZoom's), in the top layer so a scrolling sheet can't cut it: over its cell, or under it when
// there's no room above, and focused, so Escape puts it away (close). `label` names it and is its caption.
const props = defineProps({
  char: { type: String, required: true },
  family: { type: String, required: true },
  size: { type: Number, required: true },
  cell: { type: Object, required: true }, // the cell's DOMRect
  label: { type: String, required: true },
});
const emit = defineEmits(['close']);
const el = useTemplateRef('el');
const at = ref({ left: 0, top: 0 });
onMounted(() => {
  el.value.showPopover();
  const { offsetWidth: w, offsetHeight: h } = el.value, cell = props.cell, above = cell.top - h - 6;
  at.value = { left: Math.min(Math.max(8, cell.left + cell.width / 2 - w / 2), innerWidth - w - 8), top: above >= 8 ? above : cell.bottom + 6 };
  el.value.focus({ preventScroll: true });
});
</script>

<template>
  <div
      ref="el"
      popover="manual"
      class="glyph-zoom"
      role="dialog"
      tabindex="-1"
      :aria-label="props.label"
      :style="{ left: `${at.left}px`, top: `${at.top}px` }"
      @keydown.esc.stop="emit('close')"
  >
    <div class="glyph" :style="{ fontFamily: props.family, fontSize: `${props.size}px` }">{{ props.char }}</div>
    <div class="caption">{{ props.label }}</div>
  </div>
</template>

<style scoped>
div.glyph-zoom {
  position: fixed;
  inset: auto;
  margin: 0;
  padding: 8px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--surface-1);
  color: var(--text);
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.4);
  outline: none;
}

div.glyph {
  min-width: 1ch;
  line-height: 1;
  text-align: center;
  white-space: pre;
}

div.caption {
  margin-top: 6px;
  color: var(--text-muted);
  font-size: 11px;
  text-align: center;
}
</style>
