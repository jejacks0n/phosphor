<script setup>
import { useI18n } from 'vue-i18n';
import ModalDialog from '@/components/ModalDialog.vue';

// Make host's question: nothing changes until it's answered yes.
defineProps({ name: { type: String, required: true } });
defineEmits(['confirm', 'cancel']);
const { t } = useI18n();
</script>

<template>
  <ModalDialog :title="t('social.makeHostDialog.title', { name })" :sub="t('social.makeHostDialog.sub')" @cancel="$emit('cancel')">
    <div class="actions">
      <button autofocus @click="$emit('cancel')">{{ t('common.cancel') }}</button>
      <button class="primary" @click="$emit('confirm')">{{ t('social.makeHostDialog.confirm') }}</button>
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
