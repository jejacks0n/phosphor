// The plugins installed in this browser (docs/plugins.md): read from a manifest file, switched on and off, removed,
// and the themes the ones that are on offer. A theme in use whose plugin stops offering it gives way to its base.
import { toRaw } from 'vue';
import { defineStore } from 'pinia';
import { t } from '@/i18n';
import { readManifest, ManifestError, MOST_MANIFEST_BYTES } from '@/plugins/manifest';
import { themeRef, pluginOfTheme, pluginsOff } from '@/plugins/themes';
import { loadPlugins, putPlugin, deletePlugin } from '@/plugins/storage';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

const refused = (error) => {
  if (!(error instanceof ManifestError)) return error;
  return Object.assign(new Error(error.message), { userMessage: t(`plugins.errors.${error.code}`, error.detail) });
};

const byName = (a, b) => a.manifest.name.localeCompare(b.manifest.name) || a.id.localeCompare(b.id);

export const usePluginStore = defineStore('plugins', {
  state: () => ({
    plugins: [],                             // records, by name
    off: pluginsOff(globalThis.location?.search ?? ''), // ?plugins=off: read once, for this visit
    unavailable: false,                      // the browser won't keep anything (some private windows)
  }),

  getters: {
    themes: (state) => (state.off ? [] : state.plugins.filter(({ enabled }) => enabled).flatMap(({ id, manifest }) =>
      manifest.themes.map(({ id: theme, name, base, colors }) => ({ ref: themeRef(id, theme), name, base, colors })))),
  },

  actions: {
    async load() {
      let records;
      try {
        records = await loadPlugins();
      } catch {
        this.plugins = [];
        this.unavailable = true;
        return;
      }
      const usable = [];
      for (const record of records) {
        try {
          usable.push({ ...record, manifest: readManifest(JSON.stringify(record.manifest)) });
        } catch { /* written by a later Phosphor, or by hand: left out */ }
      }
      this.plugins = usable.sort(byName);
      this.unavailable = false;
    },

    // { manifest, replaces: the record it would replace, or null }, or an Error with its userMessage.
    async read(file) {
      try {
        if (file.size > MOST_MANIFEST_BYTES) throw new ManifestError('tooBig');
        const manifest = readManifest(await file.text());
        return { manifest, replaces: this.plugins.find(({ id }) => id === manifest.id) ?? null };
      } catch (error) {
        throw refused(error);
      }
    },

    async install(manifest) {
      const old = this.plugins.find(({ id }) => id === manifest.id);
      await this.changing(manifest.id, {
        id: manifest.id, manifest, enabled: old ? old.enabled : true, source: 'file', installedAt: Date.now(),
      });
    },

    async setEnabled(id, on) {
      const record = this.plugins.find((plugin) => plugin.id === id);
      if (record) await this.changing(id, { ...toRaw(record), enabled: on });
    },

    async uninstall(id) {
      await this.changing(id, null);
    },

    // A plugin's record put (or deleted, for null), with the theme in use moved to its base when it's no longer on
    // offer. The base is the plugin's own, whether or not this visit has plugins off.
    async changing(id, record) {
      const workspace = useWorkspaceStore();
      const inUse = (plugins) => {
        const plugin = pluginOfTheme(workspace.theme) === id && plugins.find((p) => p.id === id && p.enabled);
        return plugin && plugin.manifest.themes.find((theme) => themeRef(id, theme.id) === workspace.theme);
      };
      const before = inUse(this.plugins);
      if (record) await putPlugin(record);
      else await deletePlugin(id);
      this.plugins = [...this.plugins.filter((plugin) => plugin.id !== id), ...(record ? [record] : [])].sort(byName);
      if (before && !inUse(this.plugins)) workspace.theme = before.base;
    },
  },
});
