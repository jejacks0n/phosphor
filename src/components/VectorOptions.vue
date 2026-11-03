<script setup>
// VECTOR's options row. With shapes selected: Fill, Stroke, Width, Forward and Back (the stacking order), Edit
// points and Delete, each one undo step; with nothing selected, or with the Pen or the Shape tool, the Fill,
// Stroke and Width the next shape gets (workspace.vectorStyle, where 'fg' is the foreground color when it's
// made). While a shape's points are edited, the Point row: the selected point Smooth or Corner, Delete point
// and Done. A phone's row keeps Fill, Stroke, Width and Points, and puts the rest under ⋯; its Point row has
// no label or hint.
import { computed, ref } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { setSmooth, withShape } from '@/document/shapes.js';
import { deleteSelectedPoint } from '@/tools/vselect.js';
import { getEffectiveColor } from '@/lib/PixelTransforms';
import ColorPopover from '@/components/ColorPopover.vue';
import DropdownMenu from '@/components/DropdownMenu.vue';
import RangeField from '@/components/RangeField.vue';

const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();
const phone = useMediaQuery('(max-width: 768px)');

const selected = computed(() => workspace.vectorSelected.filter((key) => project.shapes.has(key)));
// The shapes this row changes: the selection, with Vector select. Otherwise it's the next shape's style.
const editing = computed(() => workspace.activeTool === 'vselect' && selected.value.length > 0);
const styling = computed(() => ['vselect', 'pen', 'vshape'].includes(workspace.activeTool));
const first = computed(() => editing.value && project.shapes.get(selected.value[0]));

const value = (slot) => {
  if (first.value) return first.value[slot];
  const v = workspace.vectorStyle[slot];
  return v === 'fg' ? (workspace.editFgNone ? null : workspace.editFgColor) : v;
};
const shown = (hex) => (hex ? getEffectiveColor(hex, project, project.activePalette) : null);

// The selected shapes changed, as one step: an edit opened by a drag (a slider, the native picker) closes
// when it ends.
function change(changes, { open = false } = {}) {
  if (open) project.beginEdit();
  project.updateShapes(selected.value.map((key) => [key, withShape(project.shapes.get(key), changes)]));
}
const set = (slot, v, { remember = true } = {}) => {
  if (editing.value) {
    change({ [slot]: v }, { open: !remember });
    if (remember && project._stroke && !project._stroke.typing) project.commitEdit();
  } else workspace.vectorStyle = { ...workspace.vectorStyle, [slot]: v };
};

const WIDTH = computed(() => ({ key: 'vectorWidth', label: t('vector.width'), title: t('vector.widthTitle'), min: 0.5, max: 64, step: 0.5, decimals: 1 }));
const width = computed({
  get: () => (first.value ? first.value.width : workspace.vectorStyle.width),
  set: (v) => set('width', v, { remember: false }),
});
const endWidth = () => {
  if (editing.value && project._stroke) project.commitEdit();
};

// The color box for Fill or Stroke, under its swatch (fixed: the row scrolls and would clip it).
const box = ref(null); // { slot, style }
function openBox(slot, event) {
  if (box.value?.slot === slot) return (box.value = null);
  const r = event.currentTarget.getBoundingClientRect();
  box.value = { slot, style: { position: 'fixed', top: `${r.bottom + 6}px`, left: `${Math.max(4, Math.min(r.left, window.innerWidth - 270))}px` } };
}
const pick = (hex, opts) => set(box.value.slot, hex, opts);

const forward = () => project.restackShapes(selected.value, 'forward');
const back = () => project.restackShapes(selected.value, 'back');
const remove = () => {
  project.deleteShapes(selected.value);
  workspace.vectorSelected = [];
};
// The Point row: the shape whose points are edited, and its selected point.
const pointsOf = computed(() => workspace.activeTool === 'vselect' && workspace.vectorPoints && project.shapes.get(workspace.vectorPoints));
const point = computed(() => (pointsOf.value && workspace.vectorPoint !== null ? pointsOf.value.points[workspace.vectorPoint] : null));
const smooth = (on) => project.updateShapes([[workspace.vectorPoints, setSmooth(pointsOf.value, workspace.vectorPoint, on)]]);
const removePoint = () => deleteSelectedPoint(project, workspace);
const done = () => (workspace.vectorPoints = workspace.vectorPoint = null);

const editPoints = () => {
  workspace.vectorPoints = selected.value[0];
  workspace.vectorPoint = null;
};
</script>

<template>
  <div v-if="pointsOf" class="tool-setting-group vector-options">
    <span v-if="!phone" class="option-label">{{ t('vector.point') }}</span>
    <button class="text" :aria-pressed="!!point?.[6]" :disabled="!point" :title="t('vector.smoothTitle')" @click="smooth(true)">{{ t('vector.smooth') }}</button>
    <button class="text" :aria-pressed="!!point && !point[6]" :disabled="!point" :title="t('vector.cornerTitle')" @click="smooth(false)">{{ t('vector.corner') }}</button>
    <button class="text" :disabled="!point" :title="t('vector.deletePointTitle')" @click="removePoint">{{ t('vector.deletePoint') }}</button>
    <button class="text" :title="t('vector.doneTitle')" @click="done">{{ t('vector.done') }}</button>
    <span v-if="!phone" class="hint">{{ t('vector.pointsHint') }}</span>
  </div>
  <div v-else-if="editing || styling" class="tool-setting-group vector-options">
    <template v-for="slot in ['fill', 'stroke']" :key="slot">
      <button class="swatch-button" data-color-trigger :aria-label="t(`vector.${slot}`)" :title="t(`vector.${slot}Title`)" @click="openBox(slot, $event)">
        <span class="option-label">{{ t(`vector.${slot}`) }}</span>
        <span class="swatch" :class="{ none: !value(slot) }" :style="{ backgroundColor: shown(value(slot)) }"></span>
      </button>
    </template>
    <RangeField compact :setting="WIDTH" v-model="width" @commit="endWidth"/>
    <template v-if="editing">
      <div class="divider"/>
      <button v-if="phone" class="text" :title="t('vector.editPointsTitle')" @click="editPoints">{{ t('vector.points') }}</button>
      <template v-else>
        <button class="text" :title="t('vector.forwardTitle')" @click="forward">{{ t('vector.forward') }}</button>
        <button class="text" :title="t('vector.backTitle')" @click="back">{{ t('vector.back') }}</button>
        <button class="text" :title="t('vector.editPointsTitle')" @click="editPoints">{{ t('vector.editPoints') }}</button>
        <button class="text" :title="t('vector.deleteTitle')" aria-keyshortcuts="Delete Backspace" @click="remove">{{ t('common.delete') }}</button>
        <span class="hint">{{ t('vector.selectHint') }}</span>
      </template>
      <DropdownMenu v-if="phone" :label="t('vector.more')" align="right">
        <template #trigger><span aria-hidden="true">⋯</span></template>
        <button class="choice" @click="forward">{{ t('vector.forward') }}</button>
        <button class="choice" @click="back">{{ t('vector.back') }}</button>
        <button class="choice" @click="remove">{{ t('common.delete') }}</button>
      </DropdownMenu>
    </template>
    <Teleport to="body">
      <ColorPopover
          v-if="box"
          :style="box.style"
          :value="value(box.slot)"
          offers-none
          @pick="pick"
          @close="box = null"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.swatch-button {
  display: flex;
  align-items: center;
  gap: 6px;
}

.swatch {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 1px solid var(--border);
  border-radius: 3px;
}

.swatch.none {
  background: linear-gradient(to top right, transparent 44%, var(--danger) 44% 56%, transparent 56%);
}
</style>
