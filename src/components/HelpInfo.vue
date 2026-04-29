<template>
  <div class="help-info" @mouseenter="show" @mouseleave="hide" @click.stop="toggle">
    <span class="help-icon" ref="icon">i</span>

    <Teleport to="body">
      <div
          v-if="isVisible"
          class="help-tooltip"
          :style="tooltipStyle"
          :class="{ 'is-bottom': isBottom }"
          ref="tooltip"
      >
        {{ text }}
      </div>
    </Teleport>
  </div>
</template>

<script>
export default {
  name: 'HelpInfo',
  props: {
    text: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      isVisible: false,
      tooltipStyle: {},
      isBottom: false,
    };
  },
  methods: {
    show() {
      this.isVisible = true;
      this.$nextTick(() => {
        this.updatePosition();
      });
      window.addEventListener('resize', this.updatePosition);
      window.addEventListener('scroll', this.updatePosition, true);
    },
    hide() {
      this.isVisible = false;
      window.removeEventListener('resize', this.updatePosition);
      window.removeEventListener('scroll', this.updatePosition, true);
    },
    toggle() {
      if (this.isVisible) this.hide();
      else this.show();
    },
    updatePosition() {
      const icon = this.$refs.icon;
      const tooltip = this.$refs.tooltip;
      if (!icon || !tooltip) return;

      const iconRect = icon.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const padding = 10;

      let left = iconRect.left + (iconRect.width / 2) - (tooltipRect.width / 2);
      let top = iconRect.top - tooltipRect.height - 10;

      // Constraint to viewport
      if (left < padding) left = padding;
      if (left + tooltipRect.width > window.innerWidth - padding) {
        left = window.innerWidth - tooltipRect.width - padding;
      }

      // Flip to bottom if no space at top
      if (top < padding) {
        top = iconRect.bottom + 10;
        this.isBottom = true;
      } else {
        this.isBottom = false;
      }

      // Calculate arrow position relative to tooltip
      const iconCenter = iconRect.left + (iconRect.width / 2);
      const arrowLeft = iconCenter - left;

      this.tooltipStyle = {
        top: `${top}px`,
        left: `${left}px`,
        opacity: 1,
        visibility: 'visible',
        transform: 'translateY(0)',
        '--arrow-left': `${arrowLeft}px`,
      };
    },
  },
  beforeUnmount() {
    this.hide();
  },
};
</script>

<style scoped>
div.help-info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

span.help-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  font-size: 10px;
  font-family: serif;
  font-weight: bold;
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
  flex-shrink: 0;
  text-transform: lowercase;
  user-select: none;
  color: var(--text-faint);
  border: 1px solid var(--border-subtle);
}

span.help-icon:hover {
  background: var(--accent);
  color: var(--white);
  border-color: var(--accent);
}

div.help-tooltip {
  position: fixed;
  width: 180px;
  padding: 8px 12px;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: normal;
  font-style: normal;
  line-height: 1.4;
  text-transform: none;
  letter-spacing: normal;
  border-radius: 6px;
  opacity: 1;
  visibility: hidden;
  z-index: 10000;
  pointer-events: none;
  text-align: center;
  transition: opacity 0.2s ease, transform 0.2s ease;
  transform: translateY(5px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  background: var(--black);
  color: var(--white);
}

div.help-tooltip::after {
  content: "";
  position: absolute;
  top: 100%;
  left: var(--arrow-left, 50%);
  transform: translateX(-50%);
  border-width: 5px;
  border-style: solid;
  border-color: var(--black) transparent transparent transparent;
}

div.help-tooltip.is-bottom {
  transform: translateY(-5px);
}

div.help-tooltip.is-bottom::after {
  top: auto;
  bottom: 100%;
  border-color: transparent transparent var(--black) transparent;
}
</style>
