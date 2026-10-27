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
const { settingsOpen } = storeToRefs(workspace);
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
}
</style>
