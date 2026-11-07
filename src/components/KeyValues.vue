<script setup>
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { usePlayback } from '@/composables/usePlayback';
import { allPoints, isGradient, stacked, strokeOf, withShape } from '@/document/shapes.js';
import { isArt } from '@/document/artLayers.js';
import { transformValues, withTransformValue } from '@/lib/shapeValues.js';
import { placedShapes } from '@/document/followers.js';

// One Keys panel row's values on the frame showing: typing one changes the shape there, which keys that part there
// (the store notes what an edit changed).
const props = defineProps({ part: { type: String, required: true }, shapeKey: { type: String, required: true } });
const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();
const playback = usePlayback();

const shape = computed(() => project.shapes.get(props.shapeKey) ?? null); // the record, which typing changes
// X and Y where it shows: a follower's on its path (placedShapes).
const values = computed(() => (shape.value ? transformValues(placedShapes(project).get(props.shapeKey)) : null));
const look = computed(() => (shape.value ? strokeOf(shape.value) : null));
const pointCount = computed(() => allPoints(shape.value).length);
const place = computed(() => stacked(project.shapes).findIndex(([key]) => key === props.shapeKey) + 1);
const FIELDS = [['x', 0.5], ['y', 0.5], ['turn', 1], ['scaleX', 1], ['scaleY', 1]];
// An art layer's: its corner, on whole cells (a column across, two grid pixels down).
const ART_FIELDS = [['x', 1, 'artX'], ['y', 2, 'artY']];
const fields = computed(() => (isArt(shape.value) ? ART_FIELDS : FIELDS));

// What's being typed, until it's set or left: playing redraws the values with every frame, and a field bound to the
// value alone would be written back over the typing.
const typing = reactive({});
// Start and End are shown as percents of the outline, and stored as shares held to 0 through 1.
const percent = (name) => Math.round((shape.value[name] ?? (name === 'end' ? 1 : 0)) * 100);
const set = (name, event) => {
  typing[name] = null;
  playback.pause();
  const value = parseFloat(event.target.value);
  if (Number.isFinite(value)) {
    const next = name === 'width' ? withShape(shape.value, { width: Math.min(64, Math.max(0.5, value)) })
      : name === 'start' || name === 'end' ? withShape(shape.value, { [name]: Math.min(100, Math.max(0, value)) / 100 })
        : withTransformValue(shape.value, name, value);
    project.updateShapes([[props.shapeKey, next]]);
  }
  event.target.value = name === 'width' ? shape.value.width : name === 'start' || name === 'end' ? percent(name) : values.value[name];
};
const shown = (name, now) => typing[name] ?? now;

const chipStyle = (color) => {
  if (!color) return null;
  return { background: isGradient(color) ? `linear-gradient(90deg, ${color.stops.map(([, c]) => c).join(', ')})` : color };
};
const openColor = (slot) => {
  playback.pause();
  workspace.vectorSelected = [props.shapeKey];
  workspace.colorBox = slot;
};
const cased = (word) => word[0].toUpperCase() + word.slice(1);
</script>

<template>
  <div v-if="shape" class="values">
    <template v-if="part === 'transform'">
      <label v-for="[name, step, title = name] in fields" :key="name" :title="t(`keysPanel.values.${title}Title`)">
        {{ t(`keysPanel.values.${name}`) }}
        <input type="number" :aria-label="t(`keysPanel.values.${title}Title`)" :step="step" :min="name === 'scaleX' ? 1 : undefined" :value="shown(name, values[name])" @input="typing[name] = $event.target.value" @change="set(name, $event)" @blur="typing[name] = null">
      </label>
    </template>
    <label v-else-if="part === 'width'" :title="t('keysPanel.values.widthTitle')">
      <input type="number" :aria-label="t('keysPanel.values.widthTitle')" min="0.5" max="64" step="0.5" :value="shown('width', shape.width)" @input="typing.width = $event.target.value" @change="set('width', $event)" @blur="typing.width = null">
    </label>
    <label v-else-if="part === 'start' || part === 'end'" :title="t(`keysPanel.values.${part}Title`)">
      <input type="number" :aria-label="t(`keysPanel.values.${part}Title`)" min="0" max="100" step="1" :value="shown(part, percent(part))" @input="typing[part] = $event.target.value" @change="set(part, $event)" @blur="typing[part] = null">
      %
    </label>
    <button v-else-if="part === 'fill'" class="chip" :class="{ none: !shape.fill }" :style="chipStyle(shape.fill)" :aria-label="t('keysPanel.values.fill')" :title="t('keysPanel.values.fill')" @click="openColor('fg')"></button>
    <button v-else-if="part === 'stroke'" class="chip" :class="{ none: !shape.stroke }" :style="chipStyle(shape.stroke)" :aria-label="t('keysPanel.values.stroke')" :title="t('keysPanel.values.stroke')" @click="openColor('bg')"></button>
    <span v-else-if="part === 'outline'" class="dim">{{ t('keysPanel.values.outline', { n: pointCount }, pointCount) }}</span>
    <span v-else-if="part === 'style'" class="dim">{{ t(`vector.cap${cased(look.cap)}`) }} · {{ t(`vector.join${cased(look.join)}`) }}</span>
    <span v-else-if="part === 'z'" class="dim">{{ t('keysPanel.values.stack', { n: place, m: project.shapes.size }) }}</span>
  </div>
</template>

<style scoped>
div.values {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  margin-left: 18px;
  white-space: nowrap;
}
label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-dim);
}
input {
  width: 42px;
  height: 16px;
  min-height: 0;
  padding: 0 4px;
  box-sizing: border-box;
  font: 11px 'JetBrains Mono', monospace;
  border-radius: 3px;
}
span.dim {
  color: var(--text-muted);
}
button.chip {
  width: 14px;
  height: 14px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 3px;
  box-shadow: none;
  transform: none;
  filter: none;
}
button.chip.none {
  background: repeating-linear-gradient(45deg, transparent 0 3px, var(--text-faint) 3px 4px);
}
</style>
