<script setup>
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { SUPPORTED_LOCALES, locale, setLocale } from '@/i18n';

const { t } = useI18n();
const { showAboutModal } = storeToRefs(useWorkspaceStore());
const year = new Date().getFullYear();
</script>

<template>
  <footer class="project-footer">
    <div class="footer-controls">
      <label class="locale-picker" :title="t('footer.language')">
        <select
            class="locale-select"
            :value="locale"
            :aria-label="t('footer.language')"
            @change="setLocale($event.target.value)"
        >
          <option v-for="item in SUPPORTED_LOCALES" :key="item.code" :value="item.code">
            {{ item.label }}
          </option>
        </select>
      </label>
      <button class="link" @click="showAboutModal = true">{{ t('footer.about') }}</button>
    </div>
    <i18n-t keypath="footer.byline" tag="div">
      <template #br><br/></template>
      <template #ishifishi>
        <a href="https://ishifishi.work" target="_blank">ishifishi.work</a>
      </template>
      <template #euphio>
        <a href="https://euphio.org" target="_blank">euphio.org</a>
      </template>
    </i18n-t>
    <div class="copyright">{{ t('footer.copyright', { year }) }}</div>
  </footer>
</template>

<style scoped>
footer.project-footer {
  margin: 12px 12px 50px;
  font-size: 10px;
  text-align: center;
  line-height: 1.6;
  color: var(--text);
}

/* The language picker sits above the About link: side by side, they don't fit the panel. */
.footer-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

a {
  text-decoration: none;
  font-weight: 600;
  color: var(--accent-hover);
}

a:hover {
  text-decoration: underline;
}

div.copyright {
  opacity: 0.5;
}

button.link {
  text-transform: uppercase;
}

.locale-picker {
  display: inline-flex;
  align-items: center;
}

.locale-select {
  font-family: inherit;
  font-size: 10px;
  padding: 1px 4px;
  background: var(--surface-1);
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 3px;
  cursor: pointer;
}

.locale-select:hover {
  color: var(--text);
  border-color: var(--border-light, var(--border));
}
</style>
