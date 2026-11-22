<script setup>
import { useI18n } from 'vue-i18n';

// The app's close button: a thin ×, drawn, with no ring, as the Palettes and Fonts layer has beside its full screen
// toggle (which is drawn the same way, so the two match). A dialog's, the layer's and the Fonts filters' are this one;
// whoever shows it places it and hears its click. `label` names it when "Close" isn't enough (Close filters).
const props = defineProps({ label: { type: String, default: '' } });
const { t } = useI18n();
</script>

<template>
  <button type="button" class="close" :title="props.label || t('common.close')" :aria-label="props.label || t('common.close')">
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>
  </button>
</template>

<style scoped>
button.close {
  position: relative;
  display: flex;
  flex: none;
  padding: 6px;
  border: none;
  box-shadow: none;
  background: none;
  color: var(--text-muted);
}

@media (hover: hover) { /* a tap on a touch screen leaves no hover look behind */
  button.close:hover {
    color: var(--text);
  }
}

button.close svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Under a finger it takes a press a little past its edges: as far as the corner it sits 6px inside (no further, or
   its box would have something to scroll to) and down, not toward what's beside it. */
@media (pointer: coarse) {
  button.close::after {
    content: '';
    position: absolute;
    inset: -6px -6px -9px 0;
  }
}
</style>
