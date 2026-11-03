<script setup>
import { ref, computed, watch, watchEffect, nextTick, onMounted, onBeforeUnmount, useTemplateRef } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useMediaQuery } from '@vueuse/core';
import { desktopQuery } from '@/social/config';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useRoomStore } from '@/store/RoomStore';
import { usePlayback } from '@/composables/usePlayback';
import { MAX_ANIMATION_CELLS, charRowsOf } from '@/lib/Cells';
import { toast } from '@/composables/useToast';
import { formatNumber } from '@/i18n/format';

const props = defineProps({
  modelValue: { type: String, required: true },
});
const emit = defineEmits(['update:modelValue']);

const { t } = useI18n();
const { image, renderStyle } = storeToRefs(useProjectStore());
const workspace = useWorkspaceStore();
const room = useRoomStore();
const { settingsOpen, theme } = storeToRefs(workspace);

const THEME_ICONS = {
  dark: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-64 -64 640 640"><path d="M256 0C114.6 0 0 114.6 0 256S114.6 512 256 512c68.8 0 131.3-27.2 177.3-71.4 7.3-7 9.4-17.9 5.3-27.1s-13.7-14.9-23.8-14.1c-4.9 .4-9.8 .6-14.8 .6-101.6 0-184-82.4-184-184 0-72.1 41.5-134.6 102.1-164.8 9.1-4.5 14.3-14.3 13.1-24.4S322.6 8.5 312.7 6.3C294.4 2.2 275.4 0 256 0z"/></svg>',
  light: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-32 -64 640 640"><path d="M288-32c8.4 0 16.3 4.4 20.6 11.7L364.1 72.3 468.9 46c8.2-2 16.9 .4 22.8 6.3S500 67 498 75.1l-26.3 104.7 92.7 55.5c7.2 4.3 11.7 12.2 11.7 20.6s-4.4 16.3-11.7 20.6L471.7 332.1 498 436.8c2 8.2-.4 16.9-6.3 22.8S477 468 468.9 466l-104.7-26.3-55.5 92.7c-4.3 7.2-12.2 11.7-20.6 11.7s-16.3-4.4-20.6-11.7L211.9 439.7 107.2 466c-8.2 2-16.8-.4-22.8-6.3S76 445 78 436.8l26.2-104.7-92.6-55.5C4.4 272.2 0 264.4 0 256s4.4-16.3 11.7-20.6L104.3 179.9 78 75.1c-2-8.2 .3-16.8 6.3-22.8S99 44 107.2 46l104.7 26.2 55.5-92.6 1.8-2.6c4.5-5.7 11.4-9.1 18.8-9.1zm0 144a144 144 0 1 0 0 288 144 144 0 1 0 0-288zm0 240a96 96 0 1 1 0-192 96 96 0 1 1 0 192z"/></svg>',
  system: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-64 -64 640 640"><path d="M64 32C28.7 32 0 60.7 0 96L0 352c0 35.3 28.7 64 64 64l144 0-16 48-72 0c-13.3 0-24 10.7-24 24s10.7 24 24 24l272 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-72 0-16-48 144 0c35.3 0 64-28.7 64-64l0-256c0-35.3-28.7-64-64-64L64 32zM96 96l320 0c17.7 0 32 14.3 32 32l0 160c0 17.7-14.3 32-32 32L96 320c-17.7 0-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32z"/></svg>',
};

const themes = computed(() => [
  ['dark', t('tabs.themes.dark'), THEME_ICONS.dark],
  ['light', t('tabs.themes.light'), THEME_ICONS.light],
  ['system', t('tabs.themes.system'), THEME_ICONS.system],
]);

const toggleSettings = () => workspace.toggleSettings();

// Turning it off keeps the frames; the canvas stays on the frame showing.
const project = useProjectStore();
const playback = usePlayback();
const canSwitch = computed(() => !!image.value && project.canAnimate);
const switchTitle = computed(() => {
  if (project._sharing) return t('tabs.animateInRoom');
  if (!project.canAnimate) return t('tabs.animateTooLargeTitle', { max: formatNumber(MAX_ANIMATION_CELLS) });
  return image.value ? t('tabs.animateHint') : t('tabs.animateNeedArt');
});
// Why it can't be turned on, said when it's tried: a phone has no hover to show the title.
const blocked = computed(() => !canSwitch.value && !project.animate);
function whyNot() {
  if (project._sharing || !image.value) return switchTitle.value;
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
const indicatorStyle = ref({ transform: 'translateX(0px)', width: '0px', opacity: 0 });

const isDesktop = useMediaQuery(desktopQuery);

// The art tabs wait for something to show. From SOCIAL they're the way back to the start screen.
const noArt = computed(() => !image.value && props.modelValue !== 'social');
const tabs = computed(() => [
  { id: 'input', label: t('tabs.pixel'), disabled: noArt.value },
  { id: 'output', label: renderStyle.value === 'ansi' ? t('tabs.ansi') : t('tabs.ascii'), disabled: noArt.value },
  { id: 'sauce', label: t('tabs.sauce'), disabled: noArt.value },
  ...(isDesktop.value ? [{ id: 'social', label: t('tabs.social'), disabled: false }] : []),
]);
// With nothing open no tab is selected: the start screen isn't a view of the art. The tab stays chosen
// underneath, for when something opens.
const selected = computed(() => tabs.value.find((tab) => tab.id === props.modelValue && !tab.disabled)?.id);
const focusable = computed(() => selected.value ?? tabs.value.find((tab) => !tab.disabled)?.id); // the tab list's one Tab stop

// SOCIAL is desktop only: a window narrowed while on it goes to PIXEL.
watchEffect(() => {
  if (!isDesktop.value && props.modelValue === 'social') emit('update:modelValue', 'input');
});

// The tabs pattern: Left/Right (wrapping), Home and End move to a tab and select it, skipping
// disabled ones. The keys stop here, so they don't also nudge a selection or move the text cursor.
function onKeyDown(event) {
  const enabled = [...event.currentTarget.querySelectorAll('[role="tab"]:not(:disabled)')];
  const at = enabled.indexOf(document.activeElement);
  const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: enabled.length - 1 }[event.key];
  if (next === undefined || at < 0) return;
  event.preventDefault();
  event.stopPropagation();
  const tab = enabled[(next + enabled.length) % enabled.length];
  tab.focus();
  emit('update:modelValue', tab.dataset.id);
}

// The underline slides to the selected tab. With none before (nothing was open), it grows out of the
// middle of the one it lands on instead of sliding in from wherever it last was.
const APPEAR = 'width 0.3s cubic-bezier(0.23, 1, 0.32, 1), transform 0.3s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.15s ease';
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
function updateIndicator() {
  requestAnimationFrame(() => {
    const activeEl = tabList.value?.querySelector('[role="tab"].active');
    if (!activeEl) {
      indicatorStyle.value = { ...indicatorStyle.value, opacity: 0 };
      return;
    }
    const listRect = tabList.value.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();
    const left = Math.round(activeRect.left - listRect.left), width = Math.round(activeRect.width);
    const placed = { transform: `translateX(${left}px)`, width: `${width}px`, opacity: 1 };
    if (indicatorStyle.value.opacity || reducedMotion.value) {
      indicatorStyle.value = placed;
      return;
    }
    indicatorStyle.value = { transform: `translateX(${left + width / 2}px)`, width: '0px', opacity: 0, transition: 'none' };
    requestAnimationFrame(() => { indicatorStyle.value = { ...placed, transition: APPEAR }; });
  });
}

watch(() => props.modelValue, () => nextTick(updateIndicator), { immediate: true });
watch(image, () => nextTick(updateIndicator));
watch(tabs, () => nextTick(updateIndicator), { deep: true });
onMounted(() => {
  window.addEventListener('resize', updateIndicator);
  setTimeout(updateIndicator, 100);
});
onBeforeUnmount(() => window.removeEventListener('resize', updateIndicator));
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
          :aria-description="tab.id === 'social' ? t('tabs.beta') : null"
          @click="$emit('update:modelValue', tab.id)"
      >
        {{ tab.label }}
        <span v-if="tab.id === 'social'" class="beta" aria-hidden="true">{{ t('tabs.beta') }}</span>
        <span v-if="tab.id === 'social' && room.inRoom" class="dot" aria-hidden="true"></span>
      </button>
      <div class="indicator" :style="indicatorStyle" aria-hidden="true"></div>
    </div>
    <label class="animate" :class="{ on: project.animate, off: !canSwitch }" :title="switchTitle">
      <input type="checkbox" role="switch" :aria-label="t('tabs.animate')" :checked="project.animate" :aria-disabled="blocked || null" @change="switchAnimate">
      <span class="track" aria-hidden="true"></span>
      <span class="word">{{ t('tabs.animate') }}</span>
    </label>
    <!-- Radios: one Tab stop, and the arrow keys move the choice. -->
    <div class="themes" role="radiogroup" :aria-label="t('tabs.themeAria')">
      <label v-for="[id, label, icon] in themes" :key="id" :class="{ on: theme === id }" :title="label">
        <input v-model="theme" type="radio" name="theme" :value="id" :aria-label="label">
        <span v-html="icon"></span>
      </label>
    </div>
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

span.dot {
  position: absolute;
  top: 5px;
  left: 8px; /* the beta tag has the right corner */
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

span.beta {
  position: absolute;
  top: 3px;
  right: 4px;
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.05em;
  line-height: 1;
  text-transform: uppercase;
  color: var(--accent);
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

label.animate {
  position: relative;
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

div.themes {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 6px;
}
div.themes label {
  position: relative;
  display: flex;
  padding: 3px 7px;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
div.themes :deep(svg) { /* v-html: not scoped */
  display: block;
  width: 15px;
  height: 15px;
  fill: currentColor;
}
div.themes label:hover {
  color: var(--text);
}
div.themes label.on {
  background: var(--surface-2);
  color: var(--text);
}
div.themes label:has(:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
div.themes input { /* unseen, over its label: the label's look, the radio's behavior */
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
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

  div.themes { /* no room beside the tabs: the last choice stands */
    display: none;
  }
}

@media (max-width: 480px) { /* a phone upright: the tabs give way, so the switch stays on screen */
  button.tab {
    padding: 5px 12px;
  }
}

@media (max-width: 340px) {
  span.word {
    display: none;
  }
}
</style>
