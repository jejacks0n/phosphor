<script>
import { mapState, mapActions } from 'pinia';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

export default {
  name: 'WorkspaceTabs',
  props: {
    modelValue: {
      type: String,
      required: true,
    },
  },
  emits: ['update:modelValue'],
  data() {
    return {
      indicatorStyle: {
        transform: 'translateX(0px)',
        width: '0px',
        opacity: 0,
      },
    };
  },
  computed: {
    ...mapState(useProjectStore, ['image']),
    ...mapState(useWorkspaceStore, ['settingsOpen']),
    tabs() {
      return [
        { id: 'input', label: 'INPUT', disabled: false },
        { id: 'ansi', label: 'ANSI', disabled: !this.image },
        { id: 'sauce', label: 'SAUCE', disabled: !this.image },
      ];
    },
  },
  watch: {
    modelValue: {
      handler() {
        this.$nextTick(() => {
          this.updateIndicator();
        });
      },
      immediate: true,
    },
    image() {
      this.$nextTick(() => {
        this.updateIndicator();
      });
    },
  },
  mounted() {
    window.addEventListener('resize', this.updateIndicator);
    setTimeout(this.updateIndicator, 100);
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.updateIndicator);
  },
  methods: {
    ...mapActions(useWorkspaceStore, ['toggleSettings']),
    updateIndicator() {
      requestAnimationFrame(() => {
        const listEl = this.$refs.tabList;
        const activeEl = listEl?.querySelector('li.active');

        if (activeEl && listEl) {
          const listRect = listEl.getBoundingClientRect();
          const activeRect = activeEl.getBoundingClientRect();

          this.indicatorStyle = {
            transform: `translateX(${Math.round(activeRect.left - listRect.left)}px)`,
            width: `${Math.round(activeRect.width)}px`,
            opacity: 1,
          };
        } else {
          this.indicatorStyle.opacity = 0;
        }
      });
    },
  },
};
</script>

<template>
  <nav class="workspace-tabs">
    <button class="menu-btn" :class="{ open: settingsOpen }" title="Toggle Settings" @click.stop="toggleSettings">
      <span></span>
      <span></span>
      <span></span>
    </button>
    <ul ref="tabList">
      <li
          v-for="tab in tabs"
          :key="tab.id"
          :class="{ active: modelValue === tab.id, disabled: tab.disabled }"
          :data-text="tab.label"
          @click="!tab.disabled && $emit('update:modelValue', tab.id)"
      >
        {{ tab.label }}
      </li>
      <div class="indicator" :style="indicatorStyle"></div>
    </ul>
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

button {
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

button:hover {
  opacity: 1;
}

button span {
  width: 100%;
  height: 2px;
  border-radius: 2px;
  transition: transform 0.2s ease, opacity 0.2s ease;
  transform-origin: center;
  background-color: var(--text);
}

button.open span:nth-child(1) {
  transform: translateY(6px) rotate(45deg);
}

button.open span:nth-child(2) {
  opacity: 0;
  transform: scaleX(0);
}

button.open span:nth-child(3) {
  transform: translateY(-6px) rotate(-45deg);
}

ul {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
  margin: 0;
  padding: 5px 0 0;
  list-style: none;
  position: relative;
}

li {
  padding: 5px 24px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  user-select: none;
  transition: color 0.3s ease;
  border-radius: 5px 5px 0 0;
  border: 1px solid var(--border);
  border-bottom: 1px solid transparent;
  background: var(--surface-0);
  color: var(--text-muted);
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

li::after {
  content: attr(data-text);
  height: 0;
  visibility: hidden;
  overflow: hidden;
  user-select: none;
  pointer-events: none;
  font-weight: 500;
}

li.disabled {
  opacity: 0.4;
  cursor: default;
  pointer-events: none;
}

li.active {
  margin-bottom: -1px;
  border-bottom: 1px solid transparent;
  font-weight: 500;
  background: var(--surface-1);
  color: var(--text);
  text-shadow: 0 0 5px var(--accent-glow);
}

li:not(.disabled):not(.active):hover {
  background: var(--surface-2);
  color: var(--accent);
}

div.indicator {
  position: absolute;
  bottom: -1px;
  left: 0;
  height: 2px;
  background: var(--accent);
  transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
  box-shadow: 0 0 3px var(--accent), 0 0 20px var(--accent);
  z-index: 2;
  pointer-events: none;
}

@media (max-width: 768px) {
  nav.workspace-tabs {
    border-color: var(--accent);
  }

  li.active {
    border-color: var(--accent);
    border-bottom-color: transparent;
  }

  button {
    display: flex;
  }
}
</style>
