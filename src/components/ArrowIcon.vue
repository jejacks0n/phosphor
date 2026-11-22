<script setup>
// A drawn arrow, for the places that used a typed one (◂ ▸ » ↗ →), which are too small to make out. `shape` is the
// drawing, `turn` the degrees clockwise from pointing right, `size` the pixels. It takes the text's color, so a button's
// hover and disabled looks reach it. Hidden from screen readers: whoever shows it names what it's for.
defineProps({
  shape: { type: String, default: 'chevron' },   // 'triangle' | 'chevron' | 'double' | 'arrow' | 'out'
  turn: { type: Number, default: 0 },
  size: { type: Number, default: 16 },
});

const PATHS = {
  triangle: 'M5 2v12l8-6z',
  chevron: 'M6 3l5 5-5 5',
  double: 'M3 3l5 5-5 5M8 3l5 5-5 5',
  arrow: 'M2 8h11M9 4l4 4-4 4',
  out: 'M9 2.5h4.5V7M13.5 2.5l-6 6M12 10v3.5H2.5V4H6',
};
</script>

<template>
  <svg class="arrow-icon" :class="{ filled: shape === 'triangle' }" viewBox="0 0 16 16" aria-hidden="true" :width="size" :height="size" :style="{ rotate: `${turn}deg` }">
    <path :d="PATHS[shape]"/>
  </svg>
</template>

<style scoped>
svg.arrow-icon {
  display: block;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

svg.arrow-icon.filled {
  fill: currentColor;
}
</style>
