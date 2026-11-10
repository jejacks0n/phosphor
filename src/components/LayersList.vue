<script setup>
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { useLayerName } from '@/composables/useLayerName';
import { useMergeDown } from '@/composables/useMergeDown';
import { MOST_LAYERS } from '@/document/layerInfo.js';
import DropdownMenu from '@/components/DropdownMenu.vue';

// The drawing's layers, top of the stack first (project.layers, reversed), the base at the bottom. Picking a row
// decides the tabs and what the tools act on; its eye hides or shows the layer; a click on the picked row's name, a
// double-click on any name, or F2 renames it, Enter or leaving the box keeps the name and Escape doesn't. Each row but
// the bottom has a ⋯ menu (Rename, Duplicate, Delete, Merge down, Move up, Move down) and drags to another place in the stack, never
// below the bottom.
// + Layer and + Vector layer, under the list, add a layer directly above the picked one and pick it. The side panel's
// LAYERS and the phone's Layers dialog both show it.

const project = useProjectStore(), workspace = useWorkspaceStore(), drawing = useDrawingStore();
const { t } = useI18n();
const layerName = useLayerName();
const list = useTemplateRef('list');
const uid = useId();   // for the off rows' reasons: the side panel and the phone dialog may both hold a list

const ICONS = {   // a 16-unit box: cells, a path with its points, pixels
  cells: 'M2 3h5v4H2zM9 3h5v4H9zM2 9h5v4H2zM9 9h5v4H9z',
  vector: 'M2 13C4 4 12 12 14 3l1 .3C13 13 5 5 3 13.3z M1 12h3v3H1zM12 1h3v3h-3z',
  base: 'M2 2h4v4H2zM10 2h4v4h-4zM6 6h4v4H6zM2 10h4v4H2zM10 10h4v4h-4z',
};

const showing = computed(() => !!project.image && workspace.editMode);
const inRoom = computed(() => !!project._sharing);   // a room holds the layers it always did (layers.notInRoom)
const layers = computed(() => [...project.layers].reverse().map(({ id, kind, hidden }, i, all) => ({
  id,
  at: all.length - 1 - i,   // its place in the stack, bottom first
  icon: ICONS[id === 'base' ? 'base' : kind],
  name: layerName(id),
  hidden,
  off: id === 'base' ? drawing.hostOnly ?? (project.artInside ? t('art.baseOff') : null) : null,
})));

// A click picks the row; a click on the picked row's name renames it (a phone has no double-click). Enter and Space
// press the row, not its name, so they only pick. The click a drag ends with picks nothing.
function pick(layer, e) {
  if (layer.off || dragged) return;
  if (workspace.shownPick === layer.id && e.target.closest('span.name')) rename(layer);
  else workspace.pickLayer(layer.id);
}

// + Layer and + Vector layer: directly above the pick, and picked. Off at the most layers, and in a room, except the
// vector layer a room is missing, which goes directly on the bottom, where a room's one is.
const full = computed(() => project.layers.length >= MOST_LAYERS);
const addOff = (kind) => (full.value ? t('layers.full', { n: MOST_LAYERS }) : inRoom.value && (kind !== 'vector' || project.hasVectorLayer) ? t('layers.notInRoom') : null);
function add(kind) {
  const id = project.addLayer(kind, inRoom.value ? 'base' : workspace.shownPick);
  if (id) workspace.pickLayer(id);
}

// The ⋯ menu's Duplicate (the copy goes directly above and is picked, project.duplicateLayer) and Delete, each an undo
// step: off in a room, and Duplicate at the most layers.
const duplicateOff = computed(() => (full.value ? t('layers.full', { n: MOST_LAYERS }) : inRoom.value ? t('layers.notInRoom') : null));
const duplicate = (layer) => project.duplicateLayer(layer.id);
// Its row (and ⋯) gone, focus goes to the row picked now (the one under it) rather than the page.
const remove = (layer) => project.deleteLayer(layer.id) && backToRow(workspace.pickedLayer);

// The ⋯ menu's Merge down: the layer into the one under it, as the toolbar's (off with its reason, asking how into the base).
const { offFor: mergeOff, mergeDown } = useMergeDown();

// The ⋯ menu's moves: a step up or down the stack, as an undo step (project.moveLayer).
const moveOff = (layer, by) => (inRoom.value ? t('layers.notInRoom') : (by > 0 ? layer.at === project.layers.length - 1 : layer.at === 1) ? '' : null);
const move = (layer, by) => project.moveLayer(layer.id, layer.at + by);

// Dragging a row (pointer events on it, with the mouse; a touch scrolls) moves its layer to where it's dropped: between
// two rows, or directly above the bottom, never below it. A press that doesn't move is the click it always was: the
// pointer is captured only once it has moved (captured at the press, the click would go to the row, not its button).
const drag = ref(null);   // { id, y0, moved, slot }: slot, the row (top first) the layer would go before, or the rows' count for directly above the bottom
let dragged = false;
function dragStart(layer, e) {
  if (layer.id === 'base' || e.button !== 0 || renaming.value || e.target.closest('button.eye, .dropdown')) return;
  drag.value = { id: layer.id, y0: e.clientY, moved: false, slot: null };
}
function dragLeave() {
  if (drag.value && !drag.value.moved) drag.value = null;   // left the row before it was a drag
}
function dragMove(e) {
  const d = drag.value;
  if (!d || (!d.moved && Math.abs(e.clientY - d.y0) < 4)) return;
  if (!d.moved) e.currentTarget.setPointerCapture(e.pointerId);
  d.moved = true;
  const rows = [...list.value.querySelectorAll('li')].slice(0, -1);   // the bottom's no slot
  let slot = rows.length;
  for (let i = 0; i < rows.length; i++) {
    const { top, height } = rows[i].getBoundingClientRect();
    if (e.clientY < top + height / 2) { slot = i; break; }
  }
  d.slot = slot;
}
function dragEnd() {
  const d = drag.value;
  drag.value = null;
  if (!d?.moved) return;
  dragged = true;
  setTimeout(() => { dragged = false; }, 0);   // past the click this press ends with
  const ids = layers.value.map((layer) => layer.id), from = ids.indexOf(d.id);
  const at = d.slot > from ? d.slot - 1 : d.slot;   // its place among the other rows, top first
  project.moveLayer(d.id, ids.length - 1 - at);
}
const dropClass = (layer, i) => drag.value?.moved && ({ 'drop-before': drag.value.slot === i, 'drop-after': drag.value.slot === layers.value.length - 1 && i === layers.value.length - 2, dragging: drag.value.id === layer.id });

// Renaming: the row's name turns into a box holding it.
const renaming = ref(null), draft = ref('');
async function rename(layer) {
  renaming.value = layer.id;
  draft.value = layer.name;
  await nextTick();
  list.value.querySelector('input')?.select();
}
// Enter and Escape put focus back on the row; leaving the box (the blur Enter's own unmounting brings, too) doesn't.
function keep() {
  if (!renaming.value) return;
  project.renameLayer(renaming.value, draft.value);
  renaming.value = null;
}
async function backToRow(id) {
  await nextTick();
  list.value?.querySelector(`li[data-id="${id}"] button.pick`)?.focus();
}
function enter(e) {
  if (e.isComposing) return;   // confirming an IME's word, not the name
  e.preventDefault();
  const id = renaming.value;
  keep();
  backToRow(id);
}
function cancel() {
  const id = renaming.value;
  renaming.value = null;
  backToRow(id);
}
</script>

<template>
  <div class="layers-list">
    <p v-if="!showing" class="none">{{ t('layers.none') }}</p>
    <template v-else>
      <ul ref="list">
        <li
            v-for="(layer, i) in layers" :key="layer.id" :data-id="layer.id" :class="[{ picked: workspace.shownPick === layer.id, hidden: layer.hidden }, dropClass(layer, i)]"
            @pointerdown="dragStart(layer, $event)" @pointermove="dragMove" @pointerup="dragEnd" @pointercancel="drag = null" @pointerleave="dragLeave"
        >
          <input
              v-if="renaming === layer.id" v-model="draft" maxlength="40" :aria-label="t('layers.renameAria', { name: layer.name })"
              @keydown.enter="enter" @keydown.esc.prevent.stop="cancel" @blur="keep"
          >
          <button
              v-else class="pick" :aria-pressed="workspace.shownPick === layer.id" :title="layer.off ?? layer.name"
              :aria-disabled="layer.off ? 'true' : null" :aria-describedby="layer.off ? `${uid}-${layer.id}-off` : null"
              @click="pick(layer, $event)" @keydown.f2.prevent="rename(layer)"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path :d="layer.icon"/></svg>
            <span class="name" @dblclick="rename(layer)">{{ layer.name }}</span>
          </button>
          <span v-if="layer.off" :id="`${uid}-${layer.id}-off`" class="unseen">{{ layer.off }}</span>
          <button
              class="eye link" :aria-label="t(layer.hidden ? 'layers.showAria' : 'layers.hideAria', { name: layer.name })"
              :title="t(layer.hidden ? 'layers.showAria' : 'layers.hideAria', { name: layer.name })" @click="project.setLayerHidden(layer.id, !layer.hidden)"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 3C4 3 1.5 6 .5 8c1 2 3.5 5 7.5 5s6.5-3 7.5-5c-1-2-3.5-5-7.5-5zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/>
              <path v-if="layer.hidden" d="M2 1l13 13-1 1L1 2z"/>
            </svg>
          </button>
          <DropdownMenu v-if="layer.id !== 'base'" class="menu" :label="t('layers.menuAria', { name: layer.name })" :trigger-label="t('layers.menuAria', { name: layer.name })">
            <template #trigger>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6.5h3v3H2zM6.5 6.5h3v3h-3zM11 6.5h3v3h-3z"/></svg>
            </template>
            <button @click="rename(layer)">{{ t('layers.rename') }}</button>
            <button :disabled="duplicateOff !== null" :title="duplicateOff" @click="duplicate(layer)">{{ t('layers.duplicate') }}</button>
            <button :disabled="inRoom" :title="inRoom ? t('layers.notInRoom') : null" @click="remove(layer)">{{ t('layers.delete') }}</button>
            <button :disabled="mergeOff(layer.id) !== null" :title="mergeOff(layer.id)" @click="mergeDown(layer.id)">{{ t('toolbar.mergeDown') }}</button>
            <button :disabled="moveOff(layer, 1) !== null" :title="moveOff(layer, 1) || null" @click="move(layer, 1)">{{ t('layers.moveUp') }}</button>
            <button :disabled="moveOff(layer, -1) !== null" :title="moveOff(layer, -1) || null" @click="move(layer, -1)">{{ t('layers.moveDown') }}</button>
          </DropdownMenu>
        </li>
      </ul>
      <div class="adds">
        <button class="add link" :disabled="addOff('cells') !== null" :title="addOff('cells')" @click="add('cells')">{{ t('layers.addCells') }}</button>
        <button class="add link" :disabled="addOff('vector') !== null" :title="addOff('vector')" @click="add('vector')">{{ t('layers.addVector') }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
div.layers-list {
  font-size: 12px;
}
p.none {
  margin: 0;
  padding: 16px 12px;
  color: var(--text-muted);
}
ul {
  margin: 0;
  padding: 6px 0;
  list-style: none;
}
li {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 6px 0 4px;
  border-left: 2px solid transparent;
  touch-action: pan-y;   /* a finger scrolls the list; the mouse drags a row */
}
li:hover {
  background: var(--surface-2);
}
li.picked {
  border-left-color: var(--accent);
  background: var(--surface-3);
}
li.dragging {
  opacity: 0.5;
}
li.drop-before {
  box-shadow: inset 0 2px 0 var(--accent);
}
li.drop-after {
  box-shadow: inset 0 -2px 0 var(--accent);
}
button.pick {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 100%;
  padding: 0 6px;
  border: 0;
  background: none;
  font-size: 12px;
  text-align: left;
  color: var(--text-dim);
}
/* The row has the hover look; its name button takes none of the buttons' own (lift, shadow, border, press). */
button.pick:hover,
button.pick:active:not(:disabled) {
  transform: none;
  filter: none;
  background: none;
  border-color: transparent;
  box-shadow: none;
}
li.picked button.pick {
  color: var(--text);
}
li.hidden button.pick {
  color: var(--text-muted);
}
button.pick[aria-disabled='true'] {
  color: var(--text-faint);
  cursor: not-allowed;
}
span.unseen {   /* for screen readers only: why the row is off (the title says it on hover) */
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
span.name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
svg {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  fill: currentColor;
}
input {
  flex: 1;
  min-width: 0;
  height: 22px;
  margin: 0 6px;
  padding: 0 6px;
  box-sizing: border-box;
  border: 1px solid var(--accent);
  border-radius: 3px;
  background: var(--surface-0);
  font: inherit;
  color: var(--text);
}
button.eye {
  padding: 4px;
  color: var(--text-muted);
}
li:not(.hidden) button.eye {
  color: var(--text-dim);
}
.menu :deep(button.dropdown-trigger) {   /* a plain ⋯, like the eye */
  height: 22px;
  padding: 4px;
  border: 0;
  background: none;
  color: var(--text-muted);
}
.menu :deep(button.dropdown-trigger:hover:not(:disabled)) {
  background: none;
  color: var(--text);
}
.menu :deep(button.dropdown-trigger svg) {
  width: 14px;
  height: 14px;
}
div.adds {
  display: flex;
  gap: 12px;
  margin: 0 12px 8px;
}
button.add {
  padding: 4px 0;
  font-size: 12px;
}
</style>
