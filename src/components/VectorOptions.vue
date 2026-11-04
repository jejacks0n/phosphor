<script setup>
// VECTOR's options row. With Vector select: Copy, Cut and Paste, and with shapes selected Forward and Back (the
// stacking order), Join, Separate and Delete, each one undo step. Fill and Stroke, and the stroke's width, caps,
// joins and miter limit, are the color pair's (ColorPopover, useVectorStyle). While a shape's points are edited,
// the Point row: the selected point Smooth or Corner, and Delete (the point); Esc or empty canvas ends it. With the
// Node tool's Place gradient, the Gradient row instead: Delete stop, and on a shape with two gradients Fill or
// Stroke. A phone's row puts Forward and the rest under ⋯; its Point and Gradient rows have no label or hint.
import { computed } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useVectorStyle } from '@/composables/useVectorStyle.js';
import { allPoints, isGradient, setSmooth } from '@/document/shapes.js';
import { gradientKey, gradientSlot, removeStop } from '@/tools/gradientHandles.js';
import { deleteSelectedPoint } from '@/tools/vnode.js';
import { copyShapes, cutShapes, pasteShapes } from '@/composables/vectorClipboard.js';
import { shortcut } from '@/lib/keyLabels';
import DropdownMenu from '@/components/DropdownMenu.vue';

const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();
const phone = useMediaQuery('(max-width: 768px)');
const style = useVectorStyle(), { selected } = style;

const editing = computed(() => workspace.activeTool === 'vselect' && selected.value.length > 0);
const styling = computed(() => ['vselect', 'vnode', 'pen', 'vshape'].includes(workspace.activeTool));

const forward = () => project.restackShapes(selected.value, 'forward');
const copy = () => copyShapes(project, workspace);
const cut = () => cutShapes(project, workspace);
const paste = () => pasteShapes(project, workspace);
// Join and Separate: the selection afterwards is what they made.
const canSeparate = computed(() => !!project.shapes.get(selected.value[0])?.more);
const join = () => {
  const key = project.joinShapes(selected.value);
  if (key) workspace.vectorSelected = [key];
};
const separate = () => {
  const keys = project.separateShape(selected.value[0]);
  if (keys) workspace.vectorSelected = keys;
};
const back = () => project.restackShapes(selected.value, 'back');
const remove = () => {
  project.deleteShapes(selected.value);
  workspace.vectorSelected = [];
};
// The Point row: the shape whose points are edited, and its selected point.
const pointsOf = computed(() => workspace.activeTool === 'vnode' && workspace.vectorPoints && project.shapes.get(workspace.vectorPoints));
const point = computed(() => (pointsOf.value && workspace.vectorPoint !== null ? allPoints(pointsOf.value)[workspace.vectorPoint] : null));
const smooth = (on) => project.updateShapes([[workspace.vectorPoints, setSmooth(pointsOf.value, workspace.vectorPoint, on)]]);
const removePoint = () => deleteSelectedPoint(project, workspace);
const deleteStop = () => removeStop(project, workspace);
// The shape whose points are edited, when it has two gradients to choose between.
const twoGradients = computed(() => {
  const key = gradientKey(project, workspace), shape = key && project.shapes.get(key);
  return shape && isGradient(shape.fill) && isGradient(shape.stroke) ? shape : null;
});
const gradientOf = (slot) => {
  workspace.vectorGradientSlot = slot;
  workspace.vectorStop = null;
};

</script>

<template>
  <div v-if="pointsOf && workspace.vectorNodeMode === 'points'" class="tool-setting-group vector-options">
    <span v-if="!phone" class="option-label">{{ t('vector.point') }}</span>
    <button class="text" :aria-pressed="!!point?.[6]" :disabled="!point" :title="t('vector.smoothTitle')" @click="smooth(true)">{{ t('vector.smooth') }}</button>
    <button class="text" :aria-pressed="!!point && !point[6]" :disabled="!point" :title="t('vector.cornerTitle')" @click="smooth(false)">{{ t('vector.corner') }}</button>
    <button class="text" :disabled="!point" :title="t('vector.deletePointTitle')" @click="removePoint">{{ t('common.delete') }}</button>
    <span v-if="!phone" class="hint">{{ t('vector.pointsHint') }}</span>
  </div>
  <div v-else-if="pointsOf" class="tool-setting-group vector-options">
    <button class="text" :disabled="workspace.vectorStop === null" :title="t('vector.deleteStopTitle')" @click="deleteStop">{{ t('vector.deleteStop') }}</button>
    <template v-if="twoGradients">
      <div class="divider"/>
      <span v-if="!phone" class="option-label">{{ t('vector.gradientLabel') }}</span>
      <button v-for="slot in ['fill', 'stroke']" :key="slot" class="text" :title="t('vector.gradientSlotTitle')" :aria-pressed="gradientSlot(twoGradients, workspace) === slot" @click="gradientOf(slot)">{{ t(`vector.${slot}`) }}</button>
    </template>
    <span v-if="!phone" class="hint">{{ t('vector.gradientHint') }}</span>
  </div>
  <div v-else-if="editing || styling" class="tool-setting-group vector-options">
    <template v-if="workspace.activeTool === 'vselect'">
      <div class="divider"/>
      <button :title="t('toolbar.selection.copyTitle', { key: shortcut('mod', 'C') })" :aria-label="t('toolbar.selection.copyTitle', { key: shortcut('mod', 'C') })" :disabled="!selected.length" @click="copy"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M240 64H528A48 48 0 0 1 576 112V400A48 48 0 0 1 528 448H448V384H512V128H256V192H192V112A48 48 0 0 1 240 64ZM112 192H400A48 48 0 0 1 448 240V528A48 48 0 0 1 400 576H112A48 48 0 0 1 64 528V240A48 48 0 0 1 112 192Z"/></svg></button>
      <button :title="t('toolbar.selection.cutTitle', { key: shortcut('mod', 'X') })" :aria-label="t('toolbar.selection.cutTitle', { key: shortcut('mod', 'X') })" :disabled="!selected.length" @click="cut"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill-rule="evenodd" d="M192 368A96 96 0 1 1 192 560A96 96 0 1 1 192 368ZM192 416A48 48 0 1 0 192 512A48 48 0 1 0 192 416ZM448 368A96 96 0 1 1 448 560A96 96 0 1 1 448 368ZM448 416A48 48 0 1 0 448 512A48 48 0 1 0 448 416Z"/><path d="M480 48L544 88L310 408L254 372ZM160 48L96 88L330 408L386 372Z"/></svg></button>
      <button :title="t('vector.pasteTitle', { key: shortcut('mod', 'V') })" :aria-label="t('vector.pasteTitle', { key: shortcut('mod', 'V') })" :disabled="!workspace.vectorClipboard" @click="paste"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill-rule="evenodd" d="M160 96H208V176H432V96H480A64 64 0 0 1 544 160V528A64 64 0 0 1 480 592H160A64 64 0 0 1 96 528V160A64 64 0 0 1 160 96ZM160 224V528H480V224Z"/><path d="M256 48H384A32 32 0 0 1 416 80V144H224V80A32 32 0 0 1 256 48Z"/></svg></button>
    </template>
    <template v-if="editing">
      <div class="divider"/>
      <template v-if="!phone">
        <button class="text" :title="t('vector.forwardTitle')" @click="forward">{{ t('vector.forward') }}</button>
        <button class="text" :title="t('vector.backTitle')" @click="back">{{ t('vector.back') }}</button>
        <button class="text" :title="t('vector.joinTitle')" :disabled="selected.length < 2" @click="join">{{ t('vector.join') }}</button>
        <button class="text" :title="t('vector.separateTitle')" :disabled="!canSeparate" @click="separate">{{ t('vector.separate') }}</button>
        <button class="text" :title="t('vector.deleteTitle')" aria-keyshortcuts="Delete Backspace" @click="remove">{{ t('common.delete') }}</button>
        <span class="hint">{{ t('vector.selectHint') }}</span>
      </template>
      <DropdownMenu v-if="phone" :label="t('vector.more')" align="right">
        <template #trigger><span aria-hidden="true">⋯</span></template>
        <button class="choice" @click="forward">{{ t('vector.forward') }}</button>
        <button class="choice" @click="back">{{ t('vector.back') }}</button>
        <button class="choice" :disabled="selected.length < 2" @click="join">{{ t('vector.join') }}</button>
        <button class="choice" :disabled="!canSeparate" @click="separate">{{ t('vector.separate') }}</button>
        <button class="choice" @click="remove">{{ t('common.delete') }}</button>
      </DropdownMenu>
    </template>
  </div>
</template>

<style scoped>
</style>
