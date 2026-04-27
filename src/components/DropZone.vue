<script>
import { PROJECT_EXTENSION } from '@/lib/SaveFormat';

export default {
  name: 'DropZone',
  data() {
    return {
      isDragging: false,
    };
  },
  emits: ['file-dropped'],
  methods: {
    handleDrop(e) {
      this.isDragging = false;
      const file = e.dataTransfer.files[0];
      if (file && (file.type.startsWith('image/') || file.name.endsWith(PROJECT_EXTENSION))) {
        this.$emit('file-dropped', file);
      }
    },
  },
};
</script>

<template>
  <article
    :class="{ dragging: isDragging }"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    @drop.prevent="handleDrop"
  >
    <slot></slot>
  </article>
</template>

<style scoped>
article {
  flex: 1;
  overflow: auto;
  position: relative;
  background: transparent;
  display: flex;
  flex-direction: column;
  transition: background-color 0.2s ease;
}

article.dragging {
  background: rgba(157, 85, 255, 0.05);
}
</style>
