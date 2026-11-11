<script setup>
import { ref, nextTick, onBeforeUnmount, useTemplateRef, useId } from 'vue';
import { useI18n } from 'vue-i18n';

defineProps({
  text: { type: String, required: true },
  name: { type: String, default: '' },
});

const { t } = useI18n();
const tipId = useId();

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
  document.addEventListener('pointerdown', onOutside, true);
}

function hide() {
  isVisible.value = false;
  window.removeEventListener('resize', updatePosition);
  window.removeEventListener('scroll', updatePosition, true);
  document.removeEventListener('pointerdown', onOutside, true);
}

// A mouse shows the tip by hovering, so its click must not toggle (it would hide what hover just showed). A tap
// has no hover to speak of, so its click toggles. A key press arrives as a click with no pointer before it.
let pointerType = '';
function onPointerDown(e) { pointerType = e.pointerType; }
function onClick() {
  const mouse = pointerType === 'mouse';
  pointerType = '';
  if (mouse) return;
  if (isVisible.value) hide();
  else show();
}
function onEnter(e) { if (e.pointerType === 'mouse') show(); }
function onLeave(e) { if (e.pointerType === 'mouse') hide(); }
// A tap elsewhere closes an open tip.
function onOutside(e) { if (!icon.value?.contains(e.target)) hide(); }

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
  <div class="help-info" @pointerenter="onEnter" @pointerleave="onLeave">
    <button
        type="button"
        class="help-icon"
        ref="icon"
        :aria-label="t('common.help', { name })"
        :aria-describedby="isVisible ? tipId : undefined"
        :aria-expanded="isVisible"
        @pointerdown="onPointerDown"
        @click.stop="onClick"
        @keydown.esc="hide"
        @blur="hide"
    ><span class="help-glyph">i</span></button>

    <Teleport to="body">
      <div
          v-if="isVisible"
          class="help-tooltip"
          role="tooltip"
          :id="tipId"
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

button.help-icon {
  display: inline-flex;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
  flex-shrink: 0;
}

/* A finger gets a tap target of 24 px around the small circle; a mouse keeps the layout as it was. */
@media (pointer: coarse) {
  button.help-icon { padding: 7px; }
}

span.help-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  font-size: 10px;
  font-family: serif;
  font-weight: bold;
  transition: all 0.2s ease;
  text-transform: lowercase;
  user-select: none;
  color: var(--text-faint);
  border: 1px solid var(--border-subtle);
}

button.help-icon:hover span.help-glyph,
button.help-icon:focus-visible span.help-glyph {
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
