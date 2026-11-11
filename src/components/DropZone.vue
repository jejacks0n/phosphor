<script setup>
import { ref } from 'vue';

const emit = defineEmits(['file-dropped']);
const isDragging = ref(false);

function handleDrop(e) {
  isDragging.value = false;
  const file = e.dataTransfer.files[0];
  if (file) emit('file-dropped', file); // what can't be opened is refused, with a message, where files are opened
}
</script>

<template>
  <article
      class="drop-zone"
      :class="{ dragging: isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.capture="isDragging = false"
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
