<script setup>
import { ref } from 'vue';
import { PROJECT_EXTENSION } from '@/document/projectIO';

const emit = defineEmits(['file-dropped']);
const isDragging = ref(false);

function handleDrop(e) {
  isDragging.value = false;
  const file = e.dataTransfer.files[0];
  if (file && (file.type.startsWith('image/') || file.name.endsWith(PROJECT_EXTENSION))) emit('file-dropped', file);
}
</script>

<template>
  <article
      class="drop-zone"
      :class="{ dragging: isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
  >
    <slot></slot>
  </article>
</template>

<style scoped>
article.drop-zone {
  flex: 1;
  overflow: hidden;
  position: relative;
  background: transparent;
  display: flex;
  flex-direction: column;
  transition: background-color 0.2s ease;
}

article.dragging {
  background: var(--accent-faint);
}
</style>
