<script setup>
import { computed, watch, nextTick, useTemplateRef } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useRoomStore } from '@/store/RoomStore';
import { usePlayback } from '@/composables/usePlayback';
import { MAX_ANIMATION_CELLS, charRowsOf } from '@/lib/Cells';
import { toast } from '@/composables/useToast';
import { formatNumber } from '@/i18n/format';
import { useTabIndicator } from '@/composables/useTabIndicator';
import { toggleSidePanel, useSidePanelShown } from '@/components/SidePanel.vue';
import ArrowIcon from '@/components/ArrowIcon.vue';

const props = defineProps({
  modelValue: { type: String, required: true },
});
const emit = defineEmits(['update:modelValue']);

const { t } = useI18n();
const { image, renderStyle } = storeToRefs(useProjectStore());
const workspace = useWorkspaceStore();
const room = useRoomStore();
const { settingsOpen } = storeToRefs(workspace);

const toggleSettings = () => workspace.toggleSettings();

// Turning it off keeps the frames; the canvas stays on the frame showing.
const project = useProjectStore();
const playback = usePlayback();
const canSwitch = computed(() => !!image.value && project.canAnimate);
const switchTitle = computed(() => {
  if (project.inRoom) return t('tabs.animateInRoom');
  if (!project.canAnimate) return t('tabs.animateTooLargeTitle', { max: formatNumber(MAX_ANIMATION_CELLS) });
  return image.value ? t('tabs.animateHint') : t('tabs.animateNeedArt');
});
// Why it can't be turned on, said when it's tried: a phone has no hover to show the title.
const blocked = computed(() => !canSwitch.value && !project.animate);
function whyNot() {
  if (project.inRoom || !image.value) return switchTitle.value;
  const cells = formatNumber(project.cols * charRowsOf(project.rows));
  return t('tabs.animateTooLargeToast', { cells, max: formatNumber(MAX_ANIMATION_CELLS) });
}
function switchAnimate(event) {
  if (blocked.value) {
    event.target.checked = false;
    toast(whyNot());
    return;
  }
  playback.pause();
  project.setAnimate(event.target.checked);
  event.target.checked = project.animate;
}

const tabList = useTemplateRef('tabList');
const { style: indicatorStyle, update: updateIndicator } = useTabIndicator(tabList, '[role="tab"].active'); // the underline

const { shown: sidePanelShown } = useSidePanelShown(workspace);

// The art tabs wait for something to show. From ROOM they're the way back to the start screen.
const noArt = computed(() => !image.value && props.modelValue !== 'room');
// The picked layer decides them, by its kind: a cells layer (the base among them) shows PIXEL and ANSI, a vector layer
// VECTOR, and inside an art layer VECTOR and ANSI (shownPick is its vector layer's row then). 'vector' before the first
// shape brings its layer is the vector layer it will be.
const isVector = (id) => project.layerById(id)?.kind === 'vector' || id === 'vector';
const tabs = computed(() => [
  ...(!isVector(workspace.shownPick) ? [{ id: 'input', label: t('tabs.pixel'), disabled: noArt.value }] : []),
  ...(isVector(workspace.shownPick) ? [{ id: 'vector', label: t('tabs.vector'), disabled: noArt.value }] : []),
  ...(!isVector(workspace.pickedLayer) || project.artInside ? [{ id: 'output', label: renderStyle.value === 'ansi' ? t('tabs.ansi') : t('tabs.ascii'), disabled: noArt.value }] : []),
  { id: 'sauce', label: t('tabs.sauce'), disabled: noArt.value },
  ...(room.role === 'watch' || props.modelValue === 'room' ? [{ id: 'room', label: t('tabs.room'), disabled: false }] : []),   // the room you watch
]);
// With nothing open no tab is selected: the start screen isn't a view of the art. The tab stays chosen
// underneath, for when something opens.
const selected = computed(() => tabs.value.find((tab) => tab.id === props.modelValue && !tab.disabled)?.id);
const focusable = computed(() => selected.value ?? tabs.value.find((tab) => !tab.disabled)?.id); // the tab list's one Tab stop

// The tabs pattern: Left/Right (wrapping) move to a tab and select it, skipping disabled ones. The keys stop here, so
// they don't also nudge a selection or move the text cursor. Home and End scroll the art (EditorViewport), as they do
// with the art focused.
function onKeyDown(event) {
  const enabled = [...event.currentTarget.querySelectorAll('[role="tab"]:not(:disabled)')];
  const at = enabled.indexOf(document.activeElement);
  const next = { ArrowRight: at + 1, ArrowLeft: at - 1 }[event.key];
  if (next === undefined || at < 0) return;
  event.preventDefault();
  event.stopPropagation();
  const tab = enabled[(next + enabled.length) % enabled.length];
  tab.focus();
  choose(tab.dataset.id);
}

// A tab chosen from SOCIAL with nothing open dims as it's chosen (the start screen), which takes focus from it:
// focus stays in the tab list, on its one stop.
function choose(id) {
  emit('update:modelValue', id);
  nextTick(() => {
    const lost = document.activeElement === document.body || document.activeElement?.disabled;
    if (lost) tabList.value?.querySelector('[role="tab"][tabindex="0"]')?.focus();
  });
}

watch(() => props.modelValue, () => nextTick(updateIndicator), { immediate: true });
watch(image, () => nextTick(updateIndicator));
watch(tabs, () => nextTick(updateIndicator), { deep: true });
</script>

<template>
  <nav class="workspace-tabs">
    <button class="menu-btn" :class="{ open: settingsOpen }" :title="t('tabs.toggleSettings')" @click.stop="toggleSettings">
      <span></span>
      <span></span>
      <span></span>
    </button>
    <div ref="tabList" class="tab-list" role="tablist" :aria-label="t('tabs.tablistAria')" @keydown="onKeyDown">
      <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tab"
          role="tab"
          :class="{ active: selected === tab.id }"
          :aria-selected="selected === tab.id"
          :tabindex="focusable === tab.id ? 0 : -1"
          :disabled="tab.disabled"
          :data-id="tab.id"
          :data-text="tab.label"
          @click="choose(tab.id)"
      >
        {{ tab.label }}
      </button>
      <div class="indicator" :style="indicatorStyle" aria-hidden="true"></div>
    </div>
    <label class="animate" :class="{ on: project.animate, off: !canSwitch }" :title="switchTitle">
      <input type="checkbox" role="switch" :aria-label="t('tabs.animate')" :checked="project.animate" :aria-disabled="blocked || null" @change="switchAnimate">
      <span class="track" aria-hidden="true"></span>
      <span class="word">{{ t('tabs.animate') }}</span>
    </label>
    <!-- The side panel's fold: while it's open the » is in the panel's own tabs; folded (on a narrow screen, shut), this « sits where that » was, with a count of what was said. -->
    <template v-if="!sidePanelShown">
      <span v-if="workspace.sidePanelUnread" class="unread">{{ workspace.sidePanelUnread }}</span>
      <button class="panel link" :aria-label="t('sidePanel.openAria')" aria-expanded="false" @click="toggleSidePanel(workspace)"><ArrowIcon shape="double" :turn="180"/></button>
    </template>
  </nav>
</template>

<style scoped>
nav.workspace-tabs {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 3px 10px 0;
  background: var(--surface-0);
  border-bottom: 1px solid var(--border);
}

button.menu-btn {
  display: none;
  flex-shrink: 0;
  flex-direction: column;
  justify-content: space-between;
  width: 20px;
  height: 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  margin: 0;
  opacity: 0.7;
  transition: opacity 0.2s ease;
  box-shadow: none !important;
}

button.menu-btn:hover {
  opacity: 1;
}

button.menu-btn span {
  width: 100%;
  height: 2px;
  border-radius: 2px;
  transition: transform 0.2s ease, opacity 0.2s ease;
  transform-origin: center;
  background-color: var(--text);
}

button.menu-btn.open span:nth-child(1) {
  transform: translateY(6px) rotate(45deg);
}

button.menu-btn.open span:nth-child(2) {
  opacity: 0;
  transform: scaleX(0);
}

button.menu-btn.open span:nth-child(3) {
  transform: translateY(-6px) rotate(-45deg);
}

div.tab-list {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
  margin: 0;
  padding: 6px 0 0;
  position: relative;
}

button.tab {
  padding: 5px 24px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: normal;
  line-height: normal;
  user-select: none;
  transition: color 0.3s ease;
  box-shadow: none;
  border-radius: 5px 5px 0 0;
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-bottom: 1px solid transparent;
  background: var(--surface-0);
  color: var(--text-muted);
}

button.tab::after {
  content: attr(data-text);
  height: 0;
  visibility: hidden;
  overflow: hidden;
  user-select: none;
  pointer-events: none;
  font-weight: 500;
}

button.tab:disabled {
  opacity: 0.4;
  cursor: default;
}

button.tab:hover { /* not the global button lift */
  transform: none;
  box-shadow: none;
  border-color: var(--border) var(--border) transparent;
}

button.tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

button.tab.active {
  margin-top: -3px;
  margin-bottom: -1px;
  border-bottom: 1px solid transparent;
  font-weight: 500;
  background: var(--surface-1);
  color: var(--text);
  text-shadow: 0 0 5px var(--accent-glow);
}

button.tab:not(:disabled):not(.active):hover {
  background: var(--surface-2);
  color: var(--accent);
}

div.indicator {
  position: absolute;
  top: 3px;
  left: 0;
  height: 4px;
  border-radius: 4px 4px 0 0;
  z-index: 2;
  pointer-events: none;
  transition: width 0.5s cubic-bezier(0.23, 1, 0.32, 1), transform 0.1s ease;
  background: var(--accent);
  box-shadow: 0 0 3px var(--accent), 0 0 20px var(--accent);
}

button.panel {
  display: flex;
  margin: -4px 0 0 -6px;   /* 2px above the row's middle, where the side panel's » is (measured) */
  padding: 4px;
}

label.animate {
  position: relative;
  top: -1px;   /* 1px above the row's middle, by eye */
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
label.animate:hover, label.animate.on {
  color: var(--text);
}
label.animate.off {
  opacity: 0.4;
  cursor: default;
}
label.animate input { /* unseen, over its label: the label's look, the switch's behavior */
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: inherit;
}
label.animate span.track {
  position: relative;
  pointer-events: none; /* the switch's, over it */
  width: 26px;
  height: 14px;
  border-radius: 7px;
  background: var(--surface-4);
  transition: background 0.2s ease;
}
label.animate span.track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: transform 0.2s ease;
}
label.animate.on span.track {
  background: var(--accent);
}
label.animate.on span.track::after {
  transform: translateX(12px);
}
label.animate:has(:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (max-width: 768px) {
  nav.workspace-tabs {
    border-color: var(--accent);
  }

  button.tab.active {
    border-color: var(--accent);
    border-bottom-color: transparent;
  }

  button.menu-btn {
    display: flex;
  }

  button.panel {   /* a finger's size, out to the screen's edge and clear of the switch, the row as tall as it was */
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 40px;
    height: 36px;
    margin: -4px -10px -4px 0;
  }
}

@media (max-width: 480px) { /* a phone upright: the tabs give way, so the switch stays on screen */
  button.tab {
    padding: 5px 8px;
  }
}

@media (max-width: 400px) { /* four art tabs: the switch keeps its icon */
  span.word {
    display: none;
  }
}

@media (max-width: 340px) {
  button.tab {
    padding: 5px 6px;
  }
}
</style>
