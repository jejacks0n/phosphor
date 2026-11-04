<script setup>
// VECTOR's options row. With shapes selected: Width, Stroke (a panel of caps, joins and the miter limit), Forward and Back (the stacking order), Edit points and
// Delete, each one undo step; with nothing selected, or with the Pen or the Shape tool, the Width the next shape
// gets. Fill and Stroke are the color pair's chips (useVectorStyle). While a shape's points are edited, the Point
// row: the selected point Smooth or Corner, and Delete (the point); Esc or empty canvas ends it. With the Node tool's
// Place gradient, the Gradient row instead: Delete stop, and on a shape with two gradients Fill or Stroke. A phone's row keeps Width and Points, and puts
// the rest under ⋯; its Point and Gradient rows have no label or hint.
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
import RangeField from '@/components/RangeField.vue';

const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();
const phone = useMediaQuery('(max-width: 768px)');
const style = useVectorStyle(), { selected } = style;

const editing = computed(() => workspace.activeTool === 'vselect' && selected.value.length > 0);
const styling = computed(() => ['vselect', 'vnode', 'pen', 'vshape'].includes(workspace.activeTool));

const WIDTH = computed(() => ({ key: 'vectorWidth', label: t('vector.width'), title: t('vector.widthTitle'), min: 0.5, max: 64, step: 0.5, decimals: 1 }));
const width = computed({
  get: () => style.value('width'),
  set: (v) => style.set('width', v, { remember: false }),
});

// The Stroke panel: each press one undo step, as Width's are.
const ic = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">${inner}</svg>`;
const guide = '<line x1="15" y1="3" x2="15" y2="21" stroke-width="1" stroke-dasharray="2 2" opacity=".6"/>';
const CAPS = ['butt', 'round', 'square'].map((v) => ({ v, title: `vector.cap${v[0].toUpperCase()}${v.slice(1)}`, icon: ic(`<line x1="3" y1="12" x2="15" y2="12" stroke-width="8" stroke-linecap="${v}"/>${guide}`) }));
const JOINS = ['miter', 'round', 'bevel'].map((v) => ({ v, title: `vector.join${v[0].toUpperCase()}${v.slice(1)}`, icon: ic(`<polyline points="4,20 12,7 20,20" stroke-width="5" stroke-linejoin="${v}"/>`) }));
const setMiter = (e) => {
  const v = Number(e.target.value);
  if (Number.isFinite(v) && e.target.value !== '') style.set('miter', Math.min(100, Math.max(1, v)));
  e.target.value = style.value('miter');
};

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
    <RangeField compact :setting="WIDTH" v-model="width" @commit="style.finish"/>
    <DropdownMenu :label="t('vector.strokeTitle')" :close-on-select="false" align="left">
      <template #trigger>
        <span>{{ t('vector.stroke') }}</span>
        <svg class="chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M201.4 342.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 274.7 86.6 137.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>
      </template>
      <div class="stroke-panel">
        <span class="option-label">{{ t('vector.cap') }}</span>
        <div class="icons">
          <button v-for="c in CAPS" :key="c.v" class="icon" :title="t(c.title)" :aria-pressed="style.value('cap') === c.v" @click="style.set('cap', c.v)" v-html="c.icon"/>
        </div>
        <span class="option-label">{{ t('vector.joinLabel') }}</span>
        <div class="icons">
          <button v-for="j in JOINS" :key="j.v" class="icon" :title="t(j.title)" :aria-pressed="style.value('join') === j.v" @click="style.set('join', j.v)" v-html="j.icon"/>
        </div>
        <label class="option-label" for="vector-miter">{{ t('vector.miter') }}</label>
        <input id="vector-miter" type="number" min="1" max="100" step="0.5" :title="t('vector.miterTitle')" :value="style.value('miter')" :disabled="style.value('join') !== 'miter'" @change="setMiter"/>
      </div>
    </DropdownMenu>
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
svg.chevron {
  width: 10px;
  height: 10px;
  fill: currentColor;
}

div.stroke-panel .option-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  user-select: none;
}

div.stroke-panel {
  display: grid;
  grid-template-columns: auto auto;
  align-items: center;
  gap: 8px 12px;
  padding: 6px 8px;
}

div.stroke-panel .icons {
  display: flex;
  gap: 4px;
}

div.stroke-panel button.icon {
  width: 36px;
  height: 30px;
  padding: 0;
  justify-content: center;
  border: 1px solid var(--border);
  background: var(--surface-2);
}

div.stroke-panel button.icon[aria-pressed='true'] {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

div.stroke-panel button.icon :deep(svg) {
  width: 20px;
  height: 20px;
}

div.stroke-panel input {
  width: 64px;
}

@media (max-width: 768px) {
  div.stroke-panel {
    box-sizing: border-box;
    width: calc(100vw - 18px);
    grid-template-columns: auto 1fr;
  }
}
</style>
