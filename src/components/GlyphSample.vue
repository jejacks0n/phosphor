<script setup>
// A library row's sample: the font's 12 sample glyphs drawn from their rows (base64, 12 × height
// bytes, leftmost pixel in the high bit), so the row needs no font loaded. Under 12 px tall draws doubled.
import { ref, watchEffect } from 'vue';

const props = defineProps({ sample: { type: String, required: true }, height: { type: Number, required: true } });
const canvas = ref(null);
const scale = () => (props.height < 12 ? 2 : 1);

watchEffect(() => {
  const el = canvas.value;
  if (!el) return;
  const s = scale(), h = props.height;
  el.width = 96 * s;
  el.height = h * s;
  const ctx = el.getContext('2d');
  ctx.fillStyle = getComputedStyle(el).color;
  const bytes = Uint8Array.from(atob(props.sample), (c) => c.charCodeAt(0));
  for (let i = 0; i < 12; i++) {
    for (let y = 0; y < h; y++) {
      const row = bytes[i * h + y] ?? 0;
      for (let b = 0; b < 8; b++) if (row & (0x80 >> b)) ctx.fillRect((8 * i + b) * s, y * s, s, s);
    }
  }
});
</script>

<template>
  <canvas ref="canvas" aria-hidden="true" class="glyph-sample" />
</template>

<style scoped>
.glyph-sample { image-rendering: pixelated; display: block; }
</style>
