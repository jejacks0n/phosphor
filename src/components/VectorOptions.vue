<script setup>
// VECTOR's options row. With Vector select: Copy, Cut and Paste, and with shapes selected Forward and Back (the
// stacking order), Join, Separate, Add, Subtract and Delete (one shape's gradient's selected stop, or else the shapes), each one
// undo step, and on one shape with two gradients Fill or Stroke. Fill and Stroke, and the stroke's width, caps,
// joins and miter limit, are the color pair's (ColorPopover, useVectorStyle). While a shape's points are edited,
// the Point row: the selected point Smooth, Free or Sharp, and Delete (the selected stop of its gradient, or else the
// point); Esc or empty canvas ends it. With one art layer selected, Edit art steps into it. On a shape with two gradients, Fill or Stroke too. The buttons are icons, named in their titles; a phone's rows have no label or hint.
import { computed } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useVectorStyle } from '@/composables/useVectorStyle.js';
import { allClosed, allPoints, isGradient, setFree, setSmooth } from '@/document/shapes.js';
import { isArt } from '@/document/artLayers.js';
import { loadBooleans } from '@/lib/shapeBooleans.js';
import { gradientKey, gradientSlot, removeStop } from '@/tools/gradientHandles.js';
import { deleteSelectedPoint, pickedPoints } from '@/tools/vnode.js';
import { copyShapes, cutShapes, pasteShapes } from '@/composables/vectorClipboard.js';
import { shortcut } from '@/lib/keyLabels';
import ToggleGroup from '@/components/ToggleGroup.vue';

const { t } = useI18n();
const project = useProjectStore();
const drawing = useDrawingStore();
const workspace = useWorkspaceStore();
const phone = useMediaQuery('(max-width: 768px)');
const style = useVectorStyle(), { selected } = style;

const editing = computed(() => workspace.activeTool === 'vselect' && selected.value.length > 0);
const styling = computed(() => ['vselect', 'vnode', 'pen', 'vshape'].includes(workspace.activeTool));

const forward = () => project.restackShapes(selected.value, 'forward');
const copy = () => copyShapes(project, workspace);
const cut = () => cutShapes(project, workspace);
const paste = () => pasteShapes(project, workspace);
// The Paste button pastes only what was copied in this tab: another tab's is Cmd/Ctrl+V's.
const pasteTitle = computed(() => (workspace.vectorClipboard
  ? t('vector.pasteTitle', { key: shortcut('mod', 'V') })
  : t('toolbar.selection.pasteElsewhereTitle', { key: shortcut('mod', 'V') })));
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
// Add and Subtract: two or more closed shapes, the result selected. The math loads the first time.
const canCombine = computed(() => selected.value.length > 1 && selected.value.every((key) => allClosed(project.shapes.get(key))));
const combine = async (op) => {
  await loadBooleans();
  const key = project.combineShapes(selected.value, op);
  if (key) workspace.vectorSelected = [key];
};
const back = () => project.restackShapes(selected.value, 'back');
// Edit art: one art layer selected. Stepping in shows the ANSI tab, where the usual tools draw in it. Off while someone
// else in the room is drawing in it, and its title says who.
const artKey = computed(() => (selected.value.length === 1 && isArt(project.shapes.get(selected.value[0])) ? selected.value[0] : null));
const artLocked = computed(() => artKey.value && drawing.lockedWords(artKey.value));
const editArt = () => {
  if (project.enterArt(artKey.value)) workspace.editorTab = 'output';
};
const remove = () => {
  if (workspace.vectorStop !== null) return removeStop(project, workspace);
  const before = project.shapes;
  project.deleteShapes(selected.value);
  if (project.shapes !== before) workspace.vectorSelected = []; // or refused (a layer someone's drawing in): still selected
};
// The Point row: the shape whose points are edited, and its selected point.
const pointsOf = computed(() => workspace.activeTool === 'vnode' && workspace.vectorPoints && project.shapes.get(workspace.vectorPoints));
const point = computed(() => (pointsOf.value && workspace.vectorPoint !== null ? allPoints(pointsOf.value)[workspace.vectorPoint] : null));
// Each taken: those taken with it (Shift, a box) change with it.
const eachPicked = (change) => project.updateShapes([[workspace.vectorPoints, pickedPoints(workspace, pointsOf.value).reduce(change, pointsOf.value)]]);
const smooth = (on) => eachPicked((shape, i) => setSmooth(shape, i, on));
// Smooth, Free or Sharp, the selected point's: its handles in line, apart (each moving on its own; Alt-dragging one
// does that too), or none.
const POINT_KINDS = computed(() => ['smooth', 'free', 'sharp'].map((key) => ({ key, label: t(`vector.${key}`), title: t(`vector.${key}Title`), disabled: !point.value })));
const pointKind = computed({
  get: () => {
    const p = point.value, handles = !!p && !!(p[2] || p[3] || p[4] || p[5]);
    return { smooth: !!p?.[6], free: !!p && !p[6] && handles, sharp: !!p && !p[6] && !handles };
  },
  set: (next) => {
    if (next.free) eachPicked(setFree);
    else smooth(next.smooth);
  },
});
const removeSelected = () => (workspace.vectorStop !== null ? removeStop(project, workspace) : deleteSelectedPoint(project, workspace));
const TRASH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true"><path d="M135.2 17.7C140.6 6.8 151.7 0 163.8 0h120.4c12.1 0 23.2 6.8 28.6 17.7L320 32h96c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 96 0 81.7 0 64s14.3-32 32-32h96l7.2-14.3zM32 128h384v320c0 35.3-28.7 64-64 64H96c-35.3 0-64-28.7-64-64V128zm96 64c-8.8 0-16 7.2-16 16v224c0 8.8 7.2 16 16 16s16-7.2 16-16V208c0-8.8-7.2-16-16-16zm96 0c-8.8 0-16 7.2-16 16v224c0 8.8 7.2 16 16 16s16-7.2 16-16V208c0-8.8-7.2-16-16-16zm96 0c-8.8 0-16 7.2-16 16v224c0 8.8 7.2 16 16 16s16-7.2 16-16V208c0-8.8-7.2-16-16-16z"/></svg>';
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
  <div v-if="pointsOf" class="tool-setting-group vector-options">
    <span v-if="!phone" class="option-label">{{ t('vector.point') }}</span>
    <ToggleGroup v-model="pointKind" single :options="POINT_KINDS" :label="t('vector.point')"/>
    <button :disabled="!point && workspace.vectorStop === null" :title="t('vector.deletePointTitle')" :aria-label="t('common.delete')" aria-keyshortcuts="Delete Backspace" @click="removeSelected" v-html="TRASH"/>
    <template v-if="twoGradients">
      <div class="divider"/>
      <span v-if="!phone" class="option-label">{{ t('vector.gradientLabel') }}</span>
      <button v-for="slot in ['fill', 'stroke']" :key="slot" class="text" :title="t('vector.gradientSlotTitle')" :aria-pressed="gradientSlot(twoGradients, workspace) === slot" @click="gradientOf(slot)">{{ t(`vector.${slot}`) }}</button>
    </template>
    <span v-if="!phone" class="hint">{{ t('vector.pointsHint') }}</span>
  </div>
  <div v-else-if="editing || styling" class="tool-setting-group vector-options">
    <template v-if="workspace.activeTool === 'vselect'">
      <button :title="t('toolbar.selection.copyTitle', { key: shortcut('mod', 'C') })" :aria-label="t('toolbar.selection.copyTitle', { key: shortcut('mod', 'C') })" :disabled="!selected.length" @click="copy"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M240 64H528A48 48 0 0 1 576 112V400A48 48 0 0 1 528 448H448V384H512V128H256V192H192V112A48 48 0 0 1 240 64ZM112 192H400A48 48 0 0 1 448 240V528A48 48 0 0 1 400 576H112A48 48 0 0 1 64 528V240A48 48 0 0 1 112 192Z"/></svg></button>
      <button :title="t('toolbar.selection.cutTitle', { key: shortcut('mod', 'X') })" :aria-label="t('toolbar.selection.cutTitle', { key: shortcut('mod', 'X') })" :disabled="!selected.length" @click="cut"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill-rule="evenodd" d="M192 368A96 96 0 1 1 192 560A96 96 0 1 1 192 368ZM192 416A48 48 0 1 0 192 512A48 48 0 1 0 192 416ZM448 368A96 96 0 1 1 448 560A96 96 0 1 1 448 368ZM448 416A48 48 0 1 0 448 512A48 48 0 1 0 448 416Z"/><path d="M480 48L544 88L310 408L254 372ZM160 48L96 88L330 408L386 372Z"/></svg></button>
      <button :title="pasteTitle" :aria-label="pasteTitle" :disabled="!workspace.vectorClipboard" @click="paste"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill-rule="evenodd" d="M160 96H208V176H432V96H480A64 64 0 0 1 544 160V528A64 64 0 0 1 480 592H160A64 64 0 0 1 96 528V160A64 64 0 0 1 160 96ZM160 224V528H480V224Z"/><path d="M256 48H384A32 32 0 0 1 416 80V144H224V80A32 32 0 0 1 256 48Z"/></svg></button>
    </template>
    <template v-if="editing">
      <button v-if="artKey" class="text" :title="artLocked || t('art.editTitle')" :disabled="!!artLocked" @click="editArt">{{ t('art.edit') }}</button>
      <div class="divider"/>
      <button :title="t('vector.forwardTitle')" :aria-label="t('vector.forward')" @click="forward"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill-rule="evenodd" d="M320 32 496 208H384V352H256V208H144ZM320 384 576 480 320 576 64 480ZM320 432 192 480 320 528 448 480Z"/></svg></button>
      <button :title="t('vector.backTitle')" :aria-label="t('vector.back')" @click="back"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path fill-rule="evenodd" d="M256 32H384V176H496L320 352 144 176H256ZM320 384 576 480 320 576 64 480ZM320 432 192 480 320 528 448 480Z"/></svg></button>
      <button :title="t('vector.joinTitle')" :aria-label="t('vector.join')" :disabled="selected.length < 2" @click="join"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><circle cx="232" cy="320" r="168"/><circle cx="408" cy="320" r="168"/></svg></button>
      <button :title="t('vector.separateTitle')" :aria-label="t('vector.separate')" :disabled="!canSeparate" @click="separate"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><circle cx="168" cy="320" r="128"/><circle cx="472" cy="320" r="128"/></svg></button>
      <button :title="t('vector.addTitle')" :aria-label="t('vector.add')" :disabled="!canCombine" @click="combine('add')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M96 96H384V256H544V544H256V384H96Z"/></svg></button>
      <button :title="t('vector.subtractTitle')" :aria-label="t('vector.subtract')" :disabled="!canCombine" @click="combine('subtract')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M96 96H384V256H256V384H96Z"/><path fill-rule="evenodd" opacity=".45" d="M256 256H544V544H256ZM296 296V504H504V296Z"/></svg></button>
      <button :title="t('vector.deleteTitle')" :aria-label="t('common.delete')" aria-keyshortcuts="Delete Backspace" @click="remove" v-html="TRASH"/>
      <template v-if="twoGradients">
        <div class="divider"/>
        <span v-if="!phone" class="option-label">{{ t('vector.gradientLabel') }}</span>
        <button v-for="slot in ['fill', 'stroke']" :key="slot" class="text" :title="t('vector.gradientSlotTitle')" :aria-pressed="gradientSlot(twoGradients, workspace) === slot" @click="gradientOf(slot)">{{ t(`vector.${slot}`) }}</button>
      </template>
      <span v-if="!phone" class="hint">{{ t('vector.selectHint') }}</span>
    </template>
  </div>
</template>

<style scoped>
</style>
