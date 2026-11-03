<script setup>
import { computed, defineAsyncComponent, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ReadingDialog from '@/components/ReadingDialog.vue';
import EnLegal from '@/i18n/legal/en.vue';

// The Terms, the Privacy Policy and the Community Guidelines, read over the app like About. `page` is 'terms',
// 'privacy' or 'guidelines'; a link to another of them asks for it with open.
const props = defineProps({ page: { type: String, required: true } });
const emit = defineEmits(['close', 'open']);
const { t, locale } = useI18n();

const legalLoaders = import.meta.glob(['@/i18n/legal/*.vue', '!@/i18n/legal/en.vue']);
const legalComponent = shallowRef(EnLegal);

watch(locale, (code) => {
  const loader = legalLoaders[`/src/i18n/legal/${code}.vue`];
  if (loader) {
    legalComponent.value = defineAsyncComponent(loader);
  } else {
    legalComponent.value = EnLegal;
  }
}, { immediate: true });

const dialogTitle = computed(() => t(`legal.titles.${props.page}`));
</script>

<template>
  <ReadingDialog :key="props.page" :label="dialogTitle" @close="emit('close')">
    <div class="legal-body">
      <component :is="legalComponent" :page="props.page" @open="emit('open', $event)"/>
    </div>
  </ReadingDialog>
</template>

<style scoped>
/* About's reading text. */
.legal-body :deep(h1),
.legal-body :deep(h2),
.legal-body :deep(p),
.legal-body :deep(li) {
  font-family: 'IBM VGA 8x16', 'JetBrains Mono', monospace;
}

.legal-body :deep(h1),
.legal-body :deep(h2) {
  color: var(--text);
  line-height: 1.25;
}

.legal-body :deep(h1) {
  margin: 0 0 8px;
  font-size: 32px;
}

.legal-body :deep(h2) {
  margin: 36px 0 12px;
  font-size: 22px;
}

.legal-body :deep(p),
.legal-body :deep(li) {
  font-size: 18px;
  color: var(--text-dim);
}

.legal-body :deep(p) {
  margin-bottom: 16px;
}

.legal-body :deep(li) {
  margin: 6px 0;
}

.legal-body :deep(p.updated) {
  color: var(--text-muted);
}

.legal-body :deep(a),
.legal-body :deep(button.link.inline) {
  color: var(--accent);
  text-decoration: underline;
}

.legal-body :deep(button.link.inline) {
  padding: 0;
  font: inherit;
  letter-spacing: normal;
}
</style>
