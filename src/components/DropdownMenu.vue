<script>
export default {
  name: 'DropdownMenu',
  props: {
    label: {
      type: String,
      default: 'Actions'
    },
    icon: {
      type: String,
      default: null
    },
    disabled: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      isOpen: false
    };
  },
  mounted() {
    window.addEventListener('mousedown', this.handleOutsideClick);
  },
  beforeUnmount() {
    window.removeEventListener('mousedown', this.handleOutsideClick);
  },
  methods: {
    toggle() {
      if (this.disabled) return;
      this.isOpen = !this.isOpen;
    },
    handleOutsideClick(e) {
      if (this.isOpen && !this.$el.contains(e.target)) {
        this.isOpen = false;
      }
    },
    close() {
      this.isOpen = false;
    }
  }
};
</script>

<template>
  <div class="dropdown" :class="{ open: isOpen }">
    <button class="dropdown-trigger" @click="toggle" :disabled="disabled" :title="label">
      <slot name="trigger">
        <span v-if="icon">{{ icon }}</span>
        <span v-else>{{ label }}</span>
        <svg class="chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M201.4 342.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 274.7 86.6 137.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>
      </slot>
    </button>
    <div class="dropdown-content" v-if="isOpen" @click="close">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.dropdown {
  position: relative;
  display: inline-block;
}

.dropdown-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  height: 26px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.dropdown-trigger:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text);
}

.dropdown-trigger .chevron {
  width: 10px;
  height: 10px;
  fill: currentColor;
  transition: transform 0.2s;
}

.dropdown.open .chevron {
  transform: rotate(180deg);
}

.dropdown-content {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: var(--surface-1);
  border: 1px solid var(--accent);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  z-index: 1000;
  min-width: 140px;
  display: flex;
  flex-direction: column;
  padding: 4px;
  gap: 2px;
}

/* Deep selector to style slotted buttons */
.dropdown-content :deep(button) {
  width: 100%;
  justify-content: flex-start;
  background: transparent;
  border: none;
  padding: 6px 10px;
  height: auto;
  font-size: 12px;
  color: var(--text);
  border-radius: 4px;
  text-align: left;
  gap: 8px;
}

.dropdown-content :deep(button:hover:not(:disabled)) {
  background: var(--surface-3);
}

.dropdown-content :deep(button:disabled) {
  opacity: 0.3;
}

.dropdown-content :deep(button svg) {
  width: 14px;
  height: 14px;
}
</style>
