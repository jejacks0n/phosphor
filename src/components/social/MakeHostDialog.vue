<script setup>
import ModalDialog from '@/components/ModalDialog.vue';

// Make host's question: nothing changes until it's answered yes.
defineProps({ name: { type: String, required: true } });
defineEmits(['confirm', 'cancel']);
</script>

<template>
  <ModalDialog :title="`Make ${name} the host?`" sub="You'll stay in the room as an artist." @cancel="$emit('cancel')">
    <div class="actions">
      <button class="primary" @click="$emit('confirm')">Make host</button>
      <button autofocus @click="$emit('cancel')">Cancel</button>
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
