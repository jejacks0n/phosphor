<script setup>
import { useI18n } from 'vue-i18n';

// A field's `n / most` beside its label, warning once it's full, which the field names in its aria-describedby. It sits
// outside the field's <label>, so it isn't read as part of the field's name.
defineProps({ count: { type: Number, required: true }, most: { type: Number, required: true } });
const { t } = useI18n();
</script>

<template>
  <span class="count" :class="{ full: count >= most }" :aria-label="t('common.countAria', { count, most })">{{ count }} / {{ most }}</span>
</template>

<style scoped>
span.count {
  font-size: 12px;
  font-weight: normal;
  font-variant-numeric: tabular-nums;
  color: var(--text-faint);
}
span.count.full { color: var(--warning); }
</style>
