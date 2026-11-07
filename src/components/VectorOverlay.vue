<script setup>
// VECTOR's overlay over the art, in CSS px: the selected shapes' outlines (and on a Blank frame, dimmed, those
// of the shapes it carries), Vector select's box with its 8 handles and rotate knob, the Node tool's points and
// handles of the shape whose points are being edited (the selected point filled) and its gradient's line, ends
// and stops (each in its color, the selected one ringed), and the Pen's points (the first filled: a click there
// closes) with its next segment, dashed, to the pointer, and a selected shape's Start and End handles on its outline
// (with the stretch not drawn dashed in its stroke color, and while one's dragged, its name and percent). In a room,
// an art layer someone else is drawing in shows its box, saying who. Every guide shows its outline, thin and dashed,
// selected or not, since it draws nothing else; a selected follower's path shows dashed in the accent, and while
// Follow a path… picks, the shape under the pointer that could be the path shows thick in it. Shapes are read where
// they show (placedShapes: a follower on its path). It takes no pointer events, and shows nothing while the
// animation plays. It's drawn twice: first dark and wider (the halo, its own group so
// nothing that looks for the overlay's handles finds it twice), then in color, so it reads over any art.
import { computed } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { t } from '@/i18n';
import { pathData, withOutlines, worldPoints } from '@/document/shapes.js';
import { measure } from '@/document/pathLength.js';
import { placedShapes } from '@/document/followers.js';
import { boxHandles, handleRadius, pathAt, selectionBox, trimHandles } from '@/tools/vselect.js';
import { gradientHandles, gradientKey, gradientSlot } from '@/tools/gradientHandles.js';
import { snappedEnd } from '@/tools/shapes.js';
import { pickedPoints } from '@/tools/vnode.js';

const props = defineProps({
  unit: { type: Object, default: null },    // CSS px per grid pixel: { x, y }
  display: { type: Object, default: null }, // the element the grid starts in
});
const project = useProjectStore();
const drawing = useDrawingStore();
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
const placed = computed(() => placedShapes(project)); // where they show: a follower on its path
const selected = computed(() => workspace.vectorSelected.filter((key) => placed.value.has(key)));
const outlines = computed(() => selected.value.map((key) => pathData(placed.value.get(key), props.unit.x, props.unit.y)));
// Every guide's outline, thin and dashed, selected or not: it draws nothing else, so this is where it's found. And the
// paths the selected followers follow, dashed in the accent.
const guides = computed(() => (!props.unit ? [] : [...placed.value.values()].filter((shape) => shape.guide).map((shape) => pathData(shape, props.unit.x, props.unit.y))));
const followed = computed(() => (!props.unit ? [] : [...new Set(selected.value.map((key) => placed.value.get(key).follow?.key))]
  .filter((key) => placed.value.has(key)).map((key) => pathData(placed.value.get(key), props.unit.x, props.unit.y))));
// Follow a path…: the shape under the pointer the picker could follow.
const pickable = computed(() => {
  const at = workspace.pickingPath && props.unit && workspace.vectorHover;
  const key = at && pathAt(placed.value, workspace.pickingPath, at, handleRadius() / props.unit.x);
  return key ? pathData(placed.value.get(key), props.unit.x, props.unit.y) : null;
});
// On a Blank frame, the shapes it carries from the frame before: their outlines, dimmed. Only with Animate on.
const carried = computed(() => {
  if (!props.unit || !project.hasFrames || !project.animate) return [];
  void project.shapes; void project.frames; // what the carried set is worked out from
  return [...project.inheritedShapes()].filter((key) => !selected.value.includes(key)).map((key) => pathData(placed.value.get(key), props.unit.x, props.unit.y));
});

const box = computed(() => {
  if (workspace.activeTool === 'vnode' || !selected.value.length) return null;
  const b = selectionBox(placed.value, selected.value);
  if (!b) return null;
  const { handles, top, knob } = boxHandles(b, props.unit);
  return { corners: b.corners.map(px).map(({ x, y }) => `${x},${y}`).join(' '), handles: handles.map(px), top: px(top), knob: knob && px(knob) };
});

// The one selected shape's Start and End handles, the outline between them left undrawn dashed, and the label of the one
// being dragged.
const trim = computed(() => {
  void project.historyVersion; void project.frames; // what its rows are worked out from
  const found = props.unit && trimHandles(project, workspace);
  if (!found) return null;
  const { shape, handles } = found, along = measure(shape), clamp = (v) => Math.min(1, Math.max(0, v));
  const start = clamp(shape.start ?? 0), end = clamp(shape.end ?? 1);
  const gone = start < end ? [along.cut(0, start), along.cut(end, 1)].flat() : along.cut(0, 1);
  const left = gone.length ? withOutlines(shape, gone) : null;
  const dragged = workspace.vectorTrim && handles.find(({ part }) => part === workspace.vectorTrim.part);
  const label = dragged && `${t(`keysPanel.parts.${dragged.part}`)} ${Math.round(workspace.vectorTrim.share * 100)}%`;
  return {
    undrawn: left && pathData(left, props.unit.x, props.unit.y),
    color: [shape.stroke, shape.fill].find((paint) => typeof paint === 'string'),
    handles: handles.map(({ part, at }) => ({ part, at: px(at) })),
    label: label && { text: label, at: px(dragged.at), width: label.length * 6.5 + 14 },
  };
});

// The art layers someone else is drawing in: each one's box, and the words over its top-left corner.
const locks = computed(() => (!props.unit ? [] : [...new Set(Object.values(project._locks).map(({ key }) => key))]).flatMap((key) => {
  const words = drawing.lockedWords(key), b = words && selectionBox(placed.value, [key]);
  if (!b) return [];
  const corners = b.corners.map(px);
  return [{ key, words, corners: corners.map(({ x, y }) => `${x},${y}`).join(' '), at: corners[0] }];
}));

const points = computed(() => {
  const shape = workspace.vectorPoints && placed.value.get(workspace.vectorPoints);
  if (!shape) return null;
  const all = worldPoints(shape).map((p, i) => ({ i, at: px(p), in: p.in && px(p.in), out: p.out && px(p.out) }));
  const arms = all.flatMap((p) => [p.in, p.out].filter(Boolean).map((h, j) => ({ key: `${p.i}.${j}`, from: p.at, to: h })));
  return { all, arms };
});

// The Pen's shape: its path so far (a line, whatever its fill and stroke: two points have nothing to fill, and a
// finger leaves no pointer to follow), its points, and a dashed segment from the last to the pointer (with Shift,
// to where a click puts the next point: across, up and down or at 45°).
const pen = computed(() => {
  const shape = workspace.vectorPen && placed.value.get(workspace.vectorPen);
  if (!shape) return null;
  const world = worldPoints(shape), hover = workspace.vectorHover;
  const to = hover && (workspace.isShiftPressed && world.length ? snappedEnd(world.at(-1), hover) : hover);
  const all = world.map((p) => px(p));
  return { d: pathData(shape, props.unit.x, props.unit.y), all, next: to && { from: all.at(-1), to: px(to) } };
});

const gradient = computed(() => {
  const key = gradientKey(project, workspace);
  if (!key) return null;
  const shape = placed.value.get(key), { p0, p1, stops } = gradientHandles(shape, gradientSlot(shape, workspace));
  return { p0: px(p0), p1: px(p1), stops: stops.map((s) => ({ ...s, at: px(s.at) })) };
});

// Vector select's box over empty canvas, or the Node tool's over points, as it's dragged.
const marquee = computed(() => {
  const m = workspace.vectorMarquee;
  if (!m) return null;
  const a = px({ x: m.x0, y: m.y0 }), b = px({ x: m.x1, y: m.y1 });
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
});

const picked = computed(() => pickedPoints(workspace));
const r = computed(() => handleRadius() / 2 + 1);
</script>

<template>
  <svg class="vector-overlays" :style="style">
    <g v-for="layer in ['vector-halo', 'vector-overlay']" :key="layer" :class="layer" :data-vector-overlay="layer === 'vector-overlay' || null">
      <template v-if="shown">
      <path v-for="(d, i) in guides" :key="`g${i}`" :d="d" class="outline guide"/>
      <path v-for="(d, i) in carried" :key="`c${i}`" :d="d" class="outline carried"/>
      <path v-for="(d, i) in outlines" :key="i" :d="d" class="outline"/>
      <path v-for="(d, i) in followed" :key="`f${i}`" :d="d" class="outline followed"/>
      <path v-if="pickable" :d="pickable" class="outline pickable"/>
      <g v-for="lock in locks" :key="lock.key" :data-locked="lock.key">
        <polygon :points="lock.corners" class="box"/>
        <text :x="lock.at.x" :y="lock.at.y - 4" class="locked">{{ lock.words }}</text>
      </g>
      <template v-if="box">
        <polygon :points="box.corners" class="box"/>
        <template v-if="box.knob">
          <line :x1="box.top.x" :y1="box.top.y" :x2="box.knob.x" :y2="box.knob.y" class="box"/>
          <circle :cx="box.knob.x" :cy="box.knob.y" :r="r" class="handle"/>
        </template>
        <rect v-for="(h, i) in box.handles" :key="i" :x="h.x - r" :y="h.y - r" :width="2 * r" :height="2 * r" class="handle"/>
      </template>
      <template v-if="trim">
        <path v-if="trim.undrawn" :d="trim.undrawn" class="undrawn" :style="trim.color && { stroke: trim.color }"/>
        <circle v-for="h in trim.handles" :key="h.part" :cx="h.at.x" :cy="h.at.y" :r="r + 1" class="handle trim" :data-trim="h.part"/>
        <g v-if="trim.label" class="trim-label">
          <rect :x="trim.label.at.x - trim.label.width / 2" :y="trim.label.at.y - 34" :width="trim.label.width" height="18" rx="9"/>
          <text :x="trim.label.at.x" :y="trim.label.at.y - 21">{{ trim.label.text }}</text>
        </g>
      </template>
      <template v-if="points">
        <g v-for="a in points.arms" :key="a.key">
          <line :x1="a.from.x" :y1="a.from.y" :x2="a.to.x" :y2="a.to.y" class="arm"/>
          <circle :cx="a.to.x" :cy="a.to.y" :r="r * 0.8" class="handle"/>
        </g>
        <rect v-for="p in points.all" :key="p.i" :x="p.at.x - r" :y="p.at.y - r" :width="2 * r" :height="2 * r" class="handle" :class="{ on: picked.includes(p.i) }"/>
      </template>
      <template v-if="gradient">
        <line :x1="gradient.p0.x" :y1="gradient.p0.y" :x2="gradient.p1.x" :y2="gradient.p1.y" class="arm"/>
        <rect v-for="(p, i) in [gradient.p0, gradient.p1]" :key="`e${i}`" :x="p.x - r" :y="p.y - r" :width="2 * r" :height="2 * r" class="handle"/>
        <circle v-for="s in gradient.stops" :key="`s${s.i}`" :cx="s.at.x" :cy="s.at.y" :r="r * 0.9" class="stop" :class="{ on: workspace.vectorStop === s.i }" :style="{ fill: s.color }" :data-stop="s.i"/>
      </template>
      <rect v-if="marquee" :x="marquee.x" :y="marquee.y" :width="marquee.w" :height="marquee.h" class="box marquee"/>
      <template v-if="pen">
        <path :d="pen.d" class="outline pen"/>
        <line v-if="pen.next" :x1="pen.next.from.x" :y1="pen.next.from.y" :x2="pen.next.to.x" :y2="pen.next.to.y" class="box"/>
        <rect v-for="(p, i) in pen.all" :key="i" :x="p.x - r" :y="p.y - r" :width="2 * r" :height="2 * r" class="handle" :class="{ on: i === 0 }"/>
      </template>
      </template>
    </g>
  </svg>
</template>

<style scoped>
svg.vector-overlays {
  position: absolute;
  overflow: visible;
  pointer-events: none;
  z-index: 1001;
}

/* Under each line and handle, a dark one 2px wider: a 1px rim on light art and dark alike. */
.vector-halo {
  --halo: rgb(0 0 0 / 0.7);
}
.vector-halo .undrawn, .vector-halo .trim-label {
  display: none;
}
.vector-halo .outline, .vector-halo .box, .vector-halo .arm {
  stroke: var(--halo);
  stroke-width: 3px;
  stroke-dasharray: none;
}
.vector-halo .handle {
  fill: none;
  stroke: var(--halo);
  stroke-width: 3px;
}
.vector-halo .stop {
  fill: none !important; /* over its own color, inline */
  stroke: var(--halo);
  stroke-width: 3.5px;
}
.vector-halo .locked {
  fill: none;
  stroke: var(--halo);
  stroke-width: 3px;
}
.vector-halo .stop.on {
  stroke-width: 5px;
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

.guide, .vector-halo .guide {
  stroke-dasharray: 2 3;
}
.followed, .vector-halo .followed {
  stroke-dasharray: 4 3;
}
.pickable {
  stroke-width: 3px;
}
.vector-halo .pickable {
  stroke-width: 5px;
}
.vector-halo .guide {
  stroke-width: 2px;
}

.undrawn {
  fill: none;
  stroke: var(--accent, #4aa3ff);
  stroke-width: 1px;
  stroke-dasharray: 4 3;
  vector-effect: non-scaling-stroke;
}

.trim-label rect {
  fill: var(--accent, #4aa3ff);
}
.trim-label text {
  fill: white;
  font-size: 11px;
  text-anchor: middle;
}

.locked {
  fill: var(--accent, #4aa3ff);
  font-size: 12px;
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
.stop {
  stroke: white;
  stroke-width: 1.5px;
}

.stop.on {
  stroke: var(--accent, #4aa3ff);
  stroke-width: 3px;
}
</style>
