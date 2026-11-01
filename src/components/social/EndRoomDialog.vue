<script setup>
import ModalDialog from '@/components/ModalDialog.vue';

// End room asks first: one slip shouldn't end a room. The caller ends it (end) or leaves it (cancel).
defineEmits(['end', 'cancel']);
</script>

<template>
  <ModalDialog title="End the room?" sub="Everyone leaves, including anyone drawing, and the chat is gone." @cancel="$emit('cancel')">
    <div class="actions">
      <button autofocus @click="$emit('cancel')">Cancel</button>
      <button class="danger" @click="$emit('end')">End room</button>
    </div>
  </ModalDialog>
</template>

<style scoped>
div.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
