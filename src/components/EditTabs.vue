<script setup>
import { ref, computed, watch, watchEffect, nextTick, onMounted, onBeforeUnmount, useTemplateRef } from 'vue';
import { storeToRefs } from 'pinia';
import { useMediaQuery } from '@vueuse/core';
import { desktopQuery } from '@/social/config';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useRoomStore } from '@/store/RoomStore';

const props = defineProps({
  modelValue: { type: String, required: true },
});
const emit = defineEmits(['update:modelValue']);

const { image, renderStyle } = storeToRefs(useProjectStore());
const workspace = useWorkspaceStore();
const room = useRoomStore();
const { settingsOpen, theme } = storeToRefs(workspace);
// The theme picker's choices, with Font Awesome's moon, sun and desktop, centered in the toolbar icons' 640 box.
const THEMES = [
  ['dark', 'Dark', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-64 -64 640 640"><path d="M256 0C114.6 0 0 114.6 0 256S114.6 512 256 512c68.8 0 131.3-27.2 177.3-71.4 7.3-7 9.4-17.9 5.3-27.1s-13.7-14.9-23.8-14.1c-4.9 .4-9.8 .6-14.8 .6-101.6 0-184-82.4-184-184 0-72.1 41.5-134.6 102.1-164.8 9.1-4.5 14.3-14.3 13.1-24.4S322.6 8.5 312.7 6.3C294.4 2.2 275.4 0 256 0z"/></svg>'],
  ['light', 'Light', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-32 -64 640 640"><path d="M288-32c8.4 0 16.3 4.4 20.6 11.7L364.1 72.3 468.9 46c8.2-2 16.9 .4 22.8 6.3S500 67 498 75.1l-26.3 104.7 92.7 55.5c7.2 4.3 11.7 12.2 11.7 20.6s-4.4 16.3-11.7 20.6L471.7 332.1 498 436.8c2 8.2-.4 16.9-6.3 22.8S477 468 468.9 466l-104.7-26.3-55.5 92.7c-4.3 7.2-12.2 11.7-20.6 11.7s-16.3-4.4-20.6-11.7L211.9 439.7 107.2 466c-8.2 2-16.8-.4-22.8-6.3S76 445 78 436.8l26.2-104.7-92.6-55.5C4.4 272.2 0 264.4 0 256s4.4-16.3 11.7-20.6L104.3 179.9 78 75.1c-2-8.2 .3-16.8 6.3-22.8S99 44 107.2 46l104.7 26.2 55.5-92.6 1.8-2.6c4.5-5.7 11.4-9.1 18.8-9.1zm0 144a144 144 0 1 0 0 288 144 144 0 1 0 0-288zm0 240a96 96 0 1 1 0-192 96 96 0 1 1 0 192z"/></svg>'],
  ['system', 'System', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-64 -64 640 640"><path d="M64 32C28.7 32 0 60.7 0 96L0 352c0 35.3 28.7 64 64 64l144 0-16 48-72 0c-13.3 0-24 10.7-24 24s10.7 24 24 24l272 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-72 0-16-48 144 0c35.3 0 64-28.7 64-64l0-256c0-35.3-28.7-64-64-64L64 32zM96 96l320 0c17.7 0 32 14.3 32 32l0 160c0 17.7-14.3 32-32 32L96 320c-17.7 0-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32z"/></svg>'],
];
const toggleSettings = () => workspace.toggleSettings();

const tabList = useTemplateRef('tabList');
const indicatorStyle = ref({ transform: 'translateX(0px)', width: '0px', opacity: 0 });

const isDesktop = useMediaQuery(desktopQuery);

const tabs = computed(() => [
  { id: 'input', label: 'PIXEL', disabled: false },
  { id: 'output', label: renderStyle.value === 'ansi' ? 'ANSI' : 'ASCII', disabled: !image.value },
  { id: 'sauce', label: 'SAUCE', disabled: !image.value },
  ...(isDesktop.value ? [{ id: 'social', label: 'SOCIAL', disabled: false }] : []),
]);

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

// The underline slides to the selected tab.
function updateIndicator() {
  requestAnimationFrame(() => {
    const activeEl = tabList.value?.querySelector('[role="tab"].active');
    if (!activeEl) {
      indicatorStyle.value = { ...indicatorStyle.value, opacity: 0 };
      return;
    }
    const listRect = tabList.value.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();
    indicatorStyle.value = {
      transform: `translateX(${Math.round(activeRect.left - listRect.left)}px)`,
      width: `${Math.round(activeRect.width)}px`,
      opacity: 1,
    };
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
    <button class="menu-btn" :class="{ open: settingsOpen }" title="Toggle Settings" @click.stop="toggleSettings">
      <span></span>
      <span></span>
      <span></span>
    </button>
    <div ref="tabList" class="tab-list" role="tablist" aria-label="Editor" @keydown="onKeyDown">
      <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tab"
          role="tab"
          :class="{ active: modelValue === tab.id }"
          :aria-selected="modelValue === tab.id"
          :tabindex="modelValue === tab.id ? 0 : -1"
          :disabled="tab.disabled"
          :data-id="tab.id"
          :data-text="tab.label"
          @click="$emit('update:modelValue', tab.id)"
      >
        {{ tab.label }}
        <span v-if="tab.id === 'social' && room.inRoom" class="dot" aria-hidden="true"></span>
      </button>
      <div class="indicator" :style="indicatorStyle" aria-hidden="true"></div>
    </div>
    <!-- Radios: one Tab stop, and the arrow keys move the choice. -->
    <div class="themes" role="radiogroup" aria-label="Theme">
      <label v-for="[id, label, icon] in THEMES" :key="id" :class="{ on: theme === id }" :title="label">
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
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
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

div.themes {
  display: flex;
  gap: 2px;
  margin-left: auto;
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
</style>
