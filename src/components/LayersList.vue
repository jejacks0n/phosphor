<script setup>
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { useLayerName } from '@/composables/useLayerName';

// The drawing's layers, top of the stack first: the edit layer, the vector layer if there is one, the base. Picking a row
// decides the tabs and what the tools act on; its eye hides or shows the layer; a click on the picked row's name, a
// double-click on any name, or F2 renames it, Enter or leaving the box keeps the name and Escape doesn't. + Vector
// layer adds the vector layer while there's none. The side panel's LAYERS and the phone's Layers dialog both show it.

const project = useProjectStore(), workspace = useWorkspaceStore(), drawing = useDrawingStore();
const { t } = useI18n();
const layerName = useLayerName();
const list = useTemplateRef('list');
const uid = useId();   // for the off rows' reasons: the side panel and the phone dialog may both hold a list

const ICONS = {   // a 16-unit box: cells, a path with its points, pixels
  edit: 'M2 3h5v4H2zM9 3h5v4H9zM2 9h5v4H2zM9 9h5v4H9z',
  vector: 'M2 13C4 4 12 12 14 3l1 .3C13 13 5 5 3 13.3z M1 12h3v3H1zM12 1h3v3h-3z',
  base: 'M2 2h4v4H2zM10 2h4v4h-4zM6 6h4v4H6zM2 10h4v4H2zM10 10h4v4h-4z',
};

const showing = computed(() => !!project.image && workspace.editMode);
const layers = computed(() => ['edit', ...(project.hasVectorLayer ? ['vector'] : []), 'base'].map((id) => ({
  id,
  name: layerName(id),
  hidden: project.layerHidden(id),
  off: id === 'base' ? drawing.hostOnly ?? (project.artInside ? t('art.baseOff') : null) : null,
})));

// A click picks the row; a click on the picked row's name renames it (a phone has no double-click). Enter and Space
// press the row, not its name, so they only pick.
function pick(layer, e) {
  if (layer.off) return;
  if (workspace.shownPick === layer.id && e.target.closest('span.name')) rename(layer);
  else workspace.pickLayer(layer.id);
}

function addVector() {
  project.addVectorLayer();
  workspace.pickLayer('vector');
}

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
        <li v-for="layer in layers" :key="layer.id" :data-id="layer.id" :class="{ picked: workspace.shownPick === layer.id, hidden: layer.hidden }">
          <input
              v-if="renaming === layer.id" v-model="draft" maxlength="40" :aria-label="t('layers.renameAria', { name: layer.name })"
              @keydown.enter="enter" @keydown.esc.prevent.stop="cancel" @blur="keep"
          >
          <button
              v-else class="pick" :aria-pressed="workspace.shownPick === layer.id" :title="layer.off ?? layer.name"
              :aria-disabled="layer.off ? 'true' : null" :aria-describedby="layer.off ? `${uid}-${layer.id}-off` : null"
              @click="pick(layer, $event)" @keydown.f2.prevent="rename(layer)"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path :d="ICONS[layer.id]"/></svg>
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
        </li>
      </ul>
      <button v-if="!project.hasVectorLayer" class="add link" @click="addVector">{{ t('layers.addVector') }}</button>
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
}
li:hover {
  background: var(--surface-2);
}
li.picked {
  border-left-color: var(--accent);
  background: var(--surface-3);
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
button.add {
  margin: 0 12px 8px;
  padding: 4px 0;
  font-size: 12px;
}
</style>
