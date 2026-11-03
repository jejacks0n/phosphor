<script setup>
// VECTOR's overlay over the art, in CSS px: the selected shapes' outlines (and on a Blank frame, dimmed, those
// of the shapes it carries), Vector select's box with its 8
// handles and rotate knob, the points and handles of the shape whose points are being edited (the selected
// point filled), and the Pen's points (the first filled: a click there closes) with its next segment, dashed, to
// the pointer. It takes no pointer events, and shows nothing while the animation plays.
import { computed } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { pathData, worldPoints } from '@/document/shapes.js';
import { boxHandles, handleRadius, selectionBox } from '@/tools/vselect.js';

const props = defineProps({
  unit: { type: Object, default: null },    // CSS px per grid pixel: { x, y }
  display: { type: Object, default: null }, // the element the grid starts in
});
const project = useProjectStore();
const workspace = useWorkspaceStore();

const px = (p) => ({ x: p.x * props.unit.x, y: p.y * props.unit.y });
const style = computed(() => {
  const { unit, display } = props;
  if (!unit) return { display: 'none' };
  return {
    left: `${display?.clientLeft ?? 0}px`, top: `${display?.clientTop ?? 0}px`,
    width: `${project.cols * unit.x}px`, height: `${project.rows * unit.y}px`,
  };
});

const shown = computed(() => !!props.unit && !workspace.playing);
const selected = computed(() => workspace.vectorSelected.filter((key) => project.shapes.has(key)));
const outlines = computed(() => selected.value.map((key) => pathData(project.shapes.get(key), props.unit.x, props.unit.y)));
// On a Blank frame, the shapes it carries from the frame before: their outlines, dimmed.
const carried = computed(() => {
  if (!props.unit || !project.hasFrames) return [];
  void project.shapes; void project.frames; // what the carried set is worked out from
  return [...project.inheritedShapes()].filter((key) => !selected.value.includes(key)).map((key) => pathData(project.shapes.get(key), props.unit.x, props.unit.y));
});

const box = computed(() => {
  if (workspace.vectorPoints || !selected.value.length) return null;
  const b = selectionBox(project.shapes, selected.value);
  if (!b) return null;
  const { handles, top, knob } = boxHandles(b, props.unit);
  return { corners: b.corners.map(px).map(({ x, y }) => `${x},${y}`).join(' '), handles: handles.map(px), top: px(top), knob: px(knob) };
});

const points = computed(() => {
  const shape = workspace.vectorPoints && project.shapes.get(workspace.vectorPoints);
  if (!shape) return null;
  const all = worldPoints(shape).map((p, i) => ({ i, at: px(p), in: p.in && px(p.in), out: p.out && px(p.out) }));
  const arms = all.flatMap((p) => [p.in, p.out].filter(Boolean).map((h, j) => ({ key: `${p.i}.${j}`, from: p.at, to: h })));
  return { all, arms };
});

// The Pen's shape: its points, and a dashed segment from the last to the pointer.
const pen = computed(() => {
  const shape = workspace.vectorPen && project.shapes.get(workspace.vectorPen);
  if (!shape) return null;
  const all = worldPoints(shape).map((p) => px(p)), hover = workspace.vectorHover && px(workspace.vectorHover);
  return { all, next: hover && { from: all.at(-1), to: hover } };
});

const r = computed(() => handleRadius() / 2 + 1);
</script>

<template>
  <svg class="vector-overlay" :style="style" data-vector-overlay>
    <g v-if="shown">
      <path v-for="(d, i) in carried" :key="`c${i}`" :d="d" class="outline carried"/>
      <path v-for="(d, i) in outlines" :key="i" :d="d" class="outline"/>
      <template v-if="box">
        <polygon :points="box.corners" class="box"/>
        <line :x1="box.top.x" :y1="box.top.y" :x2="box.knob.x" :y2="box.knob.y" class="box"/>
        <circle :cx="box.knob.x" :cy="box.knob.y" :r="r" class="handle"/>
        <rect v-for="(h, i) in box.handles" :key="i" :x="h.x - r" :y="h.y - r" :width="2 * r" :height="2 * r" class="handle"/>
      </template>
      <template v-if="points">
        <g v-for="a in points.arms" :key="a.key">
          <line :x1="a.from.x" :y1="a.from.y" :x2="a.to.x" :y2="a.to.y" class="arm"/>
          <circle :cx="a.to.x" :cy="a.to.y" :r="r * 0.8" class="handle"/>
        </g>
        <rect v-for="p in points.all" :key="p.i" :x="p.at.x - r" :y="p.at.y - r" :width="2 * r" :height="2 * r" class="handle" :class="{ on: workspace.vectorPoint === p.i }"/>
      </template>
      <template v-if="pen">
        <line v-if="pen.next" :x1="pen.next.from.x" :y1="pen.next.from.y" :x2="pen.next.to.x" :y2="pen.next.to.y" class="box"/>
        <rect v-for="(p, i) in pen.all" :key="i" :x="p.x - r" :y="p.y - r" :width="2 * r" :height="2 * r" class="handle" :class="{ on: i === 0 }"/>
      </template>
    </g>
  </svg>
</template>

<style scoped>
svg.vector-overlay {
  position: absolute;
  overflow: visible;
  pointer-events: none;
  z-index: 1001;
}

.outline, .box, .arm {
  fill: none;
  stroke: var(--accent, #4aa3ff);
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
}

.box {
  stroke-dasharray: 4 3;
}

.carried {
  opacity: 0.4;
}

.handle {
  fill: white;
  stroke: var(--accent, #4aa3ff);
  stroke-width: 1px;
}

.handle.on {
  fill: var(--accent, #4aa3ff);
}
</style>
