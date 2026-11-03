<script setup>
import { useI18n } from 'vue-i18n';
import { useDrawingStore } from '@/store/DrawingStore';

// Over the drawing area while there's no host to number anything. Tools stay as they are and the keys are
// refused at the store; a press here goes to the viewport, which starts nothing but scrolling and zooming.
const drawing = useDrawingStore();
const { t } = useI18n();
</script>

<template>
  <div class="pause-layer" role="status">
    <p v-if="drawing.hostChanging">{{ t('social.pause.hostChanging') }}</p>
    <p v-else-if="drawing.gettingArt">{{ t('social.pause.gettingArt') }}</p>
    <p v-else>{{ t('social.pause.hostReconnecting') }}</p>
  </div>
</template>

<style scoped>
div.pause-layer {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  pointer-events: auto;
  cursor: default;
}
p {
  margin: 0;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-1);
  font-size: 12px;
  color: var(--text);
}
</style>
