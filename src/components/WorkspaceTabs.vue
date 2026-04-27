<script>
import { mapState, mapActions } from 'pinia';
import { useCurrentFileStore } from '@/store/CurrentFile';
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
  computed: {
    ...mapState(useCurrentFileStore, ['image']),
    ...mapState(useWorkspaceStore, ['settingsOpen']),
  },
  methods: {
    ...mapActions(useWorkspaceStore, ['toggleSettings']),
  },
};
</script>

<template>
  <nav>
    <button class="menu-btn" :class="{ open: settingsOpen }" title="Toggle Settings" @click.stop="toggleSettings">
      <span></span>
      <span></span>
      <span></span>
    </button>
    <ul>
      <li :class="{ active: modelValue === 'source' }" @click="$emit('update:modelValue', 'source')">
        INPUT
      </li>
      <li
          :class="{ active: modelValue === 'ansi', disabled: !image }"
          @click="$emit('update:modelValue', 'ansi')"
      >
        ANSI
      </li>
      <li
          :class="{ active: modelValue === 'sauce', disabled: !image }"
          @click="$emit('update:modelValue', 'sauce')"
      >
        SAUCE
      </li>
    </ul>
  </nav>
</template>

<style scoped>
nav {
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
}

li {
  padding: 5px 24px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  user-select: none;
  transition: all 0.2s ease;
  border-radius: 5px 5px 0 0;
  border: 1px solid var(--border);
  border-bottom: none;
  background: var(--surface-0);
  color: var(--text-muted);
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
}

li:not(.disabled):not(.active):hover {
  background: var(--surface-2);
  color: var(--accent);
}

@media (max-width: 768px) {
  nav {
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
