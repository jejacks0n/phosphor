<script>
export default {
  name: 'CharPicker',
  props: {
    chars: {
      type: Array,
      required: true,
    },
    targetRect: {
      type: Object,
      required: true, // Should have left, top, width, height
    },
  },
  emits: ['select', 'close'],
  data() {
    return {
      pickerStyle: {},
    };
  },
  mounted() {
    this.updatePosition();
    window.addEventListener('resize', this.updatePosition);
    window.addEventListener('scroll', this.updatePosition, true);
    window.addEventListener('keydown', this.handleKeydown);
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.updatePosition);
    window.removeEventListener('scroll', this.updatePosition, true);
    window.removeEventListener('keydown', this.handleKeydown);
  },
  methods: {
    handleKeydown(e) {
      if (e.key === 'Escape') {
        this.$emit('close');
      }
    },
    updatePosition() {
      const picker = this.$refs.picker;
      if (!picker || !this.targetRect) return;

      const pickerRect = picker.getBoundingClientRect();
      const padding = 10;
      const target = this.targetRect;

      // Try to center horizontally on target
      let left = target.left + (target.width / 2) - (pickerRect.width / 2);
      // Position below target by default
      let top = target.top + target.height + 8;

      // Constraint to viewport horizontally
      if (left < padding) left = padding;
      if (left + pickerRect.width > window.innerWidth - padding) {
        left = window.innerWidth - pickerRect.width - padding;
      }

      // If it goes off the bottom, move it above the target
      if (top + pickerRect.height > window.innerHeight - padding) {
        top = target.top - pickerRect.height - 8;
      }

      // If it still goes off the top (extremely small screen), just clamp it
      if (top < padding) top = padding;

      this.pickerStyle = {
        top: `${top}px`,
        left: `${left}px`,
        visibility: 'visible',
      };
    },
    select(char) {
      this.$emit('select', char);
    },
  },
};
</script>

<template>
  <Teleport to="body">
    <article class="char-picker" ref="picker" :style="pickerStyle" @pointerdown.stop>
      <span class="erase" title="Reset to original" @pointerdown.stop="select('ERASE')">⌫</span>
      <span class="space" title="Space" @pointerdown.stop="select(' ')">␣</span>
      <span v-for="ch in chars" :key="ch" @pointerdown.stop="select(ch)">{{ ch }}</span>
    </article>
    <div class="picker-backdrop" @pointerdown.stop="$emit('close')"></div>
  </Teleport>
</template>

<style scoped>
article.char-picker {
  position: fixed;
  z-index: 10001;
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 8px;
  background: var(--surface-1);
  border: 1px solid var(--accent);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  max-width: 200px;
  visibility: hidden; /* Hidden until positioned */
}

div.picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: transparent;
}

span {
  width: 8px;
  height: 16px;
  font-family: 'Simple Console', monospace;
  font-size: 16px;
  line-height: 1;
  padding: 4px 6px;
  cursor: pointer;
  border-radius: 3px;
  color: var(--text);
  transition: background 0.1s;
  user-select: none;
}

span:hover {
  background: var(--accent);
  color: var(--white);
}

span.erase,
span.space {
  color: var(--accent-hot);
  font-weight: bold;
  padding: 5px 7px 3px 5px;
}

span.erase:hover,
span.space:hover {
  background: var(--accent-hot);
  color: var(--white);
}

.char-option.space:hover {
  background: var(--accent-glow);
  color: var(--white);
}
</style>
