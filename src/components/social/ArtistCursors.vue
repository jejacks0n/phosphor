<script setup>
import { computed, ref } from 'vue';
import { useEventListener, useResizeObserver } from '@vueuse/core';
import { useDrawingStore } from '@/store/DrawingStore';
import { nameColor } from '@/social/names';
import UserName from './UserName.vue';

// Others drawing: a mark and a name at each cell they're at, measured against the view (root) as it's
// scrolled. Someone out of view waits as a tag at the edge, with an arrow; pressing it goes there.
const props = defineProps({
  root: { type: Object, default: null },      // the scrolling element
  display: { type: Object, default: null },   // the element a grid position is measured against
  unit: { type: Object, default: null },      // { x, y }: CSS px per grid pixel
});
const drawing = useDrawingStore();
const moved = ref(0);   // the view scrolled or resized: every place changes
useEventListener(() => props.root, 'scroll', () => { moved.value++; }, { passive: true });
useResizeObserver(() => props.root, () => { moved.value++; });

const EDGE = 6;
const clamp = (n, most) => Math.max(EDGE, Math.min(n, most - EDGE));
const marks = computed(() => {
  void moved.value;
  const { root, display, unit } = props;
  if (!root || !display || !unit) return [];
  const seen = root.getBoundingClientRect(), box = display.getBoundingClientRect();
  const width = root.clientWidth, height = root.clientHeight;
  return Object.entries(drawing.others).map(([sub, { at, name }]) => {
    const x = box.left - seen.left + display.clientLeft + at.col * unit.x, y = box.top - seen.top + display.clientTop + at.row * 2 * unit.y;
    const arrow = x < 0 ? '←' : x >= width ? '→' : y < 0 ? '↑' : y >= height ? '↓' : null;
    const across = x > width / 2 ? -100 : 0, down = y > height / 2 ? -100 : 0;
    return {
      sub, name, arrow, x, y, color: nameColor(name),
      style: arrow
        ? { left: `${clamp(x, width)}px`, top: `${clamp(y, height)}px`, transform: `translate(${across}%, ${down}%)` }
        : { left: `${x}px`, top: `${y}px`, '--cursor': nameColor(name), width: `${unit.x}px`, height: `${unit.y * 2}px` },
    };
  });
});

function goTo({ x, y }) {
  props.root.scrollBy(x - props.root.clientWidth / 2, y - props.root.clientHeight / 2);
}
</script>

<template>
  <template v-for="mark in marks" :key="mark.sub">
    <button v-if="mark.arrow" class="off-view" :style="mark.style" :aria-label="`Go to ${mark.name}`" @pointerdown.stop @mousedown.stop @touchstart.stop @click="goTo(mark)">
      <span aria-hidden="true">{{ mark.arrow }}</span>
      <UserName :name="mark.name" />
    </button>
    <div v-else class="artist-cursor" :style="mark.style">
      <UserName class="tag" :name="mark.name" />
    </div>
  </template>
</template>

<style scoped>
div.artist-cursor {
  position: absolute;
  box-sizing: border-box;
  outline: 1px solid var(--cursor);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
}
span.tag, button.off-view {
  background: rgba(0, 0, 0, 0.85);
  color: #ffffff;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
}
span.tag {
  position: absolute;
  left: 100%;
  top: 100%;
  padding: 0 4px;
  border-radius: 0 4px 4px 4px;
}
button.off-view,
button.off-view:hover,
button.off-view:active {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 4px;
  width: max-content;
  height: auto;
  padding: 2px 6px;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  pointer-events: auto;
  filter: none;
}
</style>
