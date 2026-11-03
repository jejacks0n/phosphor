<script setup>
import { useI18n } from 'vue-i18n';
import ModalDialog from '@/components/ModalDialog.vue';

// End room asks first: one slip shouldn't end a room. The caller ends it (end) or leaves it (cancel).
defineEmits(['end', 'cancel']);
const { t } = useI18n();
</script>

<template>
  <ModalDialog :title="t('social.endDialog.title')" :sub="t('social.endDialog.sub')" @cancel="$emit('cancel')">
    <div class="actions">
      <button autofocus @click="$emit('cancel')">{{ t('common.cancel') }}</button>
      <button class="danger" @click="$emit('end')">{{ t('social.endDialog.confirm') }}</button>
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
