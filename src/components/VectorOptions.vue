<script setup>
// VECTOR's options row. With shapes selected: Width, Forward and Back (the stacking order), Edit points and
// Delete, each one undo step; with nothing selected, or with the Pen or the Shape tool, the Width the next shape
// gets. Fill and Stroke are the color pair's chips (useVectorStyle). While a shape's points are edited, the Point
// row: the selected point Smooth or Corner, and Delete (the point); Esc or empty canvas ends it. A phone's row keeps Width and Points, and puts
// the rest under ⋯; its Point row has no label or hint.
import { computed } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useVectorStyle } from '@/composables/useVectorStyle.js';
import { setSmooth } from '@/document/shapes.js';
import { deleteSelectedPoint } from '@/tools/vselect.js';
import DropdownMenu from '@/components/DropdownMenu.vue';
import RangeField from '@/components/RangeField.vue';

const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();
const phone = useMediaQuery('(max-width: 768px)');
const style = useVectorStyle(), { selected } = style;

const editing = computed(() => workspace.activeTool === 'vselect' && selected.value.length > 0);
const styling = computed(() => ['vselect', 'pen', 'vshape'].includes(workspace.activeTool));

const WIDTH = computed(() => ({ key: 'vectorWidth', label: t('vector.width'), title: t('vector.widthTitle'), min: 0.5, max: 64, step: 0.5, decimals: 1 }));
const width = computed({
  get: () => style.value('width'),
  set: (v) => style.set('width', v, { remember: false }),
});

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
    <button class="text" :disabled="!point" :title="t('vector.deletePointTitle')" @click="removePoint">{{ t('common.delete') }}</button>
    <span v-if="!phone" class="hint">{{ t('vector.pointsHint') }}</span>
  </div>
  <div v-else-if="editing || styling" class="tool-setting-group vector-options">
    <RangeField compact :setting="WIDTH" v-model="width" @commit="style.finish"/>
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
  </div>
</template>
