// The theme on <html>, for global.css: the one picked (with System the computer's, following a change), a plugin's as
// its base and its colors. A plugin theme shown is kept in localStorage, so index.html paints it before the app starts
// next time; a plugin this tab hasn't loaded (another tab installed it) is looked for once.
import { watch, watchEffect } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { THEME_CACHE_KEY, applyTheme, isPluginTheme, pluginOfTheme, readThemeCache, resolveTheme } from '@/plugins/themes';
import { usePluginStore } from '@/store/PluginStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

const storage = (use) => { try { return use(localStorage); } catch { return null; } }; // no storage: nothing kept

export function useTheme() {
  const workspace = useWorkspaceStore(), plugins = usePluginStore();
  const prefersLight = useMediaQuery('(prefers-color-scheme: light)');
  const loaded = plugins.load();

  watchEffect(() => {
    const value = workspace.theme;
    const cached = readThemeCache(storage((s) => s.getItem(THEME_CACHE_KEY)));
    const shown = resolveTheme(value, { themes: plugins.themes, prefersLight: prefersLight.value, cached, off: plugins.off });
    applyTheme(document.documentElement, shown);
    if (plugins.off) return;
    if (!isPluginTheme(value)) storage((s) => s.removeItem(THEME_CACHE_KEY));
    else if (shown.known) storage((s) => s.setItem(THEME_CACHE_KEY, JSON.stringify({ theme: value, base: shown.base, colors: shown.colors })));
  });

  const lookedFor = new Set();
  watch(() => workspace.theme, async (value) => {
    await loaded;
    const id = pluginOfTheme(value);
    if (!id || lookedFor.has(value) || plugins.plugins.some((plugin) => plugin.id === id)) return;
    lookedFor.add(value);
    await plugins.load();
  }, { immediate: true });
}
