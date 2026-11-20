<script setup>
import { ref } from 'vue';
import { isProjectFile, savesInPlace } from '@/document/projectIO';

const emit = defineEmits(['file-dropped']);
const isDragging = ref(false);

// What can't be opened is refused, with a message, where files are opened. A project dropped where the browser
// savesInPlace brings its handle (fileHandle), for Save to write over; asked for during the drop, while it's there.
async function handleDrop(e) {
  isDragging.value = false;
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const handle = savesInPlace() && isProjectFile(file.name) ? e.dataTransfer.items[0]?.getAsFileSystemHandle?.() : null;
  const fileHandle = await handle?.catch(() => null);
  emit('file-dropped', fileHandle?.kind === 'file' ? Object.assign(file, { fileHandle }) : file);
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

article.dragging :deep(.zero-state div.drop-zone) { /* the start screen's dashed line (ZeroState.vue) lights with it */
  border-color: var(--accent);
}
</style>
