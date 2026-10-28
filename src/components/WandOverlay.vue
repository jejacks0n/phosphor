<script setup>
// The Magic Wand's selection over a view: a dashed line where a selected unit meets one that isn't,
// and while the wand is the tool, a tint on every selected unit. Drawn only for the units in view (viewWindow), on a canvas over
// them, again when the view scrolls or resizes. It's there only while there's a selection.
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import { viewWindow, viewIn } from '@/lib/viewWindow';
import { ctx2d } from '@/lib/Canvas';

const props = defineProps({
  wand: { type: Object, default: null },    // workspace.wand, in this view
  unit: { type: Object, default: null },    // CSS px per unit: { x, y }
  display: { type: Object, default: null }, // the element the units start in
  tint: { type: Boolean, default: false },   // tint the selected units (the wand is the tool)
});
const canvasRef = useTemplateRef('canvas');
let frame = 0, viewport = null;

function draw() {
  frame = 0;
  const canvas = canvasRef.value, { wand, unit, display } = props;
  if (!canvas) return;
  if (!wand || !unit || !display) {
    canvas.style.display = 'none';
    return;
  }
  viewport = display.closest('article');
  const win = viewWindow(viewIn(display, viewport), unit, wand.width, wand.height);
  const dpr = window.devicePixelRatio, w = win.cols * unit.x, h = win.rows * unit.y;
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  Object.assign(canvas.style, {
    display: 'block', width: `${w}px`, height: `${h}px`,
    left: `${win.col * unit.x + display.clientLeft}px`, top: `${win.row * unit.y + display.clientTop}px`,
  });
  const ctx = ctx2d(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { mask, width, height } = wand;
  const on = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  const edges = new Path2D();
  ctx.fillStyle = 'rgba(90, 160, 255, 0.3)';
  for (let y = win.row; y < win.row + win.rows; y++) {
    for (let x = win.col; x < win.col + win.cols; x++) {
      if (!on(x, y)) continue;
      const left = (x - win.col) * unit.x, top = (y - win.row) * unit.y, right = left + unit.x, bottom = top + unit.y;
      if (props.tint) ctx.fillRect(left, top, unit.x, unit.y);
      if (!on(x, y - 1)) { edges.moveTo(left, top + 0.5); edges.lineTo(right, top + 0.5); }
      if (!on(x, y + 1)) { edges.moveTo(left, bottom - 0.5); edges.lineTo(right, bottom - 0.5); }
      if (!on(x - 1, y)) { edges.moveTo(left + 0.5, top); edges.lineTo(left + 0.5, bottom); }
      if (!on(x + 1, y)) { edges.moveTo(right - 0.5, top); edges.lineTo(right - 0.5, bottom); }
    }
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'black';
  ctx.stroke(edges);
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'white';
  ctx.stroke(edges);
}
const queue = () => { frame ||= requestAnimationFrame(draw); };

watch(() => [props.wand, props.unit, props.display, props.tint], queue);
let observer = null;
onMounted(() => {
  viewport = props.display?.closest('article') ?? null;
  viewport?.addEventListener('scroll', queue, { passive: true });
  observer = new ResizeObserver(queue);
  if (viewport) observer.observe(viewport);
  queue();
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  viewport?.removeEventListener('scroll', queue);
  observer?.disconnect();
});
</script>

<template>
  <canvas ref="canvas" class="wand-overlay" data-wand-overlay></canvas>
</template>

<style scoped>
canvas.wand-overlay {
  position: absolute;
  pointer-events: none;
  z-index: 1001;
}
</style>
