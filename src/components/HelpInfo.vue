<script setup>
import { ref, nextTick, onBeforeUnmount, useTemplateRef } from 'vue';

defineProps({
  text: { type: String, required: true },
});

const icon = useTemplateRef('icon');
const tooltip = useTemplateRef('tooltip');
const isVisible = ref(false);
const tooltipStyle = ref({});
const isBottom = ref(false);

function show() {
  isVisible.value = true;
  nextTick(updatePosition);
  window.addEventListener('resize', updatePosition);
  window.addEventListener('scroll', updatePosition, true);
}

function hide() {
  isVisible.value = false;
  window.removeEventListener('resize', updatePosition);
  window.removeEventListener('scroll', updatePosition, true);
}

function toggle() {
  if (isVisible.value) hide();
  else show();
}

// Above the icon, kept inside the viewport (below it when there's no room above), with the arrow
// pointing back at the icon.
function updatePosition() {
  if (!icon.value || !tooltip.value) return;
  const iconRect = icon.value.getBoundingClientRect();
  const tooltipRect = tooltip.value.getBoundingClientRect();
  const padding = 10;

  let left = iconRect.left + (iconRect.width / 2) - (tooltipRect.width / 2);
  let top = iconRect.top - tooltipRect.height - 10;
  if (left < padding) left = padding;
  if (left + tooltipRect.width > window.innerWidth - padding) left = window.innerWidth - tooltipRect.width - padding;

  isBottom.value = top < padding;
  if (isBottom.value) top = iconRect.bottom + 10;

  const arrowLeft = iconRect.left + (iconRect.width / 2) - left;
  tooltipStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    opacity: 1,
    visibility: 'visible',
    transform: 'translateY(0)',
    '--arrow-left': `${arrowLeft}px`,
  };
}

onBeforeUnmount(hide);
</script>

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
