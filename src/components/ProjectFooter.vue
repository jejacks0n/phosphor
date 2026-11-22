<script setup>
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { usePluginStore } from '@/store/PluginStore';
import { SUPPORTED_LOCALES, locale, setLocale } from '@/i18n';

const { t } = useI18n();
const { theme, pluginsOpen } = storeToRefs(useWorkspaceStore());
const plugins = usePluginStore();
// The select shows a plugin's theme while it's the one in use, and Themes (from plugins)… otherwise.
const pluginTheme = computed(() => (plugins.themes.some(({ ref }) => ref === theme.value) ? theme.value : ''));
const year = new Date().getFullYear();

const THEME_ICONS = {
  dark: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-64 -64 640 640"><path d="M256 0C114.6 0 0 114.6 0 256S114.6 512 256 512c68.8 0 131.3-27.2 177.3-71.4 7.3-7 9.4-17.9 5.3-27.1s-13.7-14.9-23.8-14.1c-4.9 .4-9.8 .6-14.8 .6-101.6 0-184-82.4-184-184 0-72.1 41.5-134.6 102.1-164.8 9.1-4.5 14.3-14.3 13.1-24.4S322.6 8.5 312.7 6.3C294.4 2.2 275.4 0 256 0z"/></svg>',
  light: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-32 -64 640 640"><path d="M288-32c8.4 0 16.3 4.4 20.6 11.7L364.1 72.3 468.9 46c8.2-2 16.9 .4 22.8 6.3S500 67 498 75.1l-26.3 104.7 92.7 55.5c7.2 4.3 11.7 12.2 11.7 20.6s-4.4 16.3-11.7 20.6L471.7 332.1 498 436.8c2 8.2-.4 16.9-6.3 22.8S477 468 468.9 466l-104.7-26.3-55.5 92.7c-4.3 7.2-12.2 11.7-20.6 11.7s-16.3-4.4-20.6-11.7L211.9 439.7 107.2 466c-8.2 2-16.8-.4-22.8-6.3S76 445 78 436.8l26.2-104.7-92.6-55.5C4.4 272.2 0 264.4 0 256s4.4-16.3 11.7-20.6L104.3 179.9 78 75.1c-2-8.2 .3-16.8 6.3-22.8S99 44 107.2 46l104.7 26.2 55.5-92.6 1.8-2.6c4.5-5.7 11.4-9.1 18.8-9.1zm0 144a144 144 0 1 0 0 288 144 144 0 1 0 0-288zm0 240a96 96 0 1 1 0-192 96 96 0 1 1 0 192z"/></svg>',
  system: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-64 -64 640 640"><path d="M64 32C28.7 32 0 60.7 0 96L0 352c0 35.3 28.7 64 64 64l144 0-16 48-72 0c-13.3 0-24 10.7-24 24s10.7 24 24 24l272 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-72 0-16-48 144 0c35.3 0 64-28.7 64-64l0-256c0-35.3-28.7-64-64-64L64 32zM96 96l320 0c17.7 0 32 14.3 32 32l0 160c0 17.7-14.3 32-32 32L96 320c-17.7 0-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32z"/></svg>',
};

const themes = computed(() => [
  ['dark', t('tabs.themes.dark'), THEME_ICONS.dark],
  ['light', t('tabs.themes.light'), THEME_ICONS.light],
  ['system', t('tabs.themes.system'), THEME_ICONS.system],
]);
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
      <!-- Radios: one Tab stop, and the arrow keys move the choice. -->
      <div class="themes" role="radiogroup" :aria-label="t('tabs.themeAria')">
        <label v-for="[id, label, icon] in themes" :key="id" :class="{ on: theme === id }" :title="label">
          <input v-model="theme" type="radio" name="theme" :value="id" :aria-label="label">
          <span v-html="icon"></span>
        </label>
      </div>
    </div>
    <!-- With a plugin's theme on offer, a row of its own: the themes plugins add. -->
    <select
        v-if="plugins.themes.length"
        class="locale-select plugin-themes"
        :value="pluginTheme"
        :aria-label="t('tabs.pluginThemesAria')"
        :title="t('tabs.pluginThemesAria')"
        @change="theme = $event.target.value"
    >
      <option value="" disabled hidden>{{ t('tabs.themes.more') }}</option>
      <option v-for="item in plugins.themes" :key="item.ref" :value="item.ref">{{ item.name }}</option>
    </select>
    <button type="button" class="plugins-button" @click="pluginsOpen = true">{{ t('plugins.open') }}</button>
    <div class="copyright">{{ t('footer.copyright', { year }) }}</div>
  </footer>
</template>

<style scoped>
footer.project-footer {
  margin: 12px 0 50px; /* as wide as the buttons above */
  font-size: 10px;
  text-align: center;
  line-height: 1.6;
  color: var(--text);
}

/* The language and the theme side by side, each half the width, one height. */
.footer-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 10px;
}
.plugin-themes {
  margin-bottom: 10px;
}
.plugins-button {
  width: 100%;
  padding: 6px 12px;
  margin-bottom: 10px;
}
div.themes {
  display: flex;
  gap: 2px;
  height: 28px;
  box-sizing: border-box;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-1); /* the language picker's look */
}
div.themes label {
  position: relative;
  display: flex;
  flex: 1;
  justify-content: center;
  align-items: center;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
div.themes :deep(svg) { /* v-html: not scoped */
  display: block;
  width: 13px;
  height: 13px;
  fill: currentColor;
}
div.themes label:hover {
  color: var(--text);
}
div.themes label.on {
  background: var(--surface-3);
  color: var(--text);
}
div.themes label:has(:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
div.themes input { /* unseen, over its label: the label's look, the radio's behavior */
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

div.copyright {
  opacity: 0.5;
}

.locale-picker {
  display: flex;
  min-width: 0;
}

.locale-select {   /* as tall as the theme picker beside it */
  width: 100%;
  height: 28px;
  font-family: inherit;
  font-size: 12px;
  padding: 2px 8px;
  color: var(--text-dim);
  border-radius: 6px;
  cursor: pointer;
}
.locale-select:not(:focus) {   /* focused, a field's own look: its accent border and glow */
  background: var(--surface-1);
  border-color: var(--border);
}

.locale-select:hover {
  color: var(--text);
}
.locale-select:hover:not(:focus) {
  border-color: var(--border-light, var(--border));
}
</style>
