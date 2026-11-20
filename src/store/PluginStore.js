// The plugins installed in this browser (docs/plugins.md): read from a manifest file, switched on and off, removed,
// and the themes the ones that are on offer. A theme in use whose plugin stops offering it gives way to its base.
// Picked with the browser's picker (Chrome, Edge), a plugin keeps its file's handle, for an author: Reload reads the
// file again, and Follow file looks at it every FOLLOW_MS and takes each save, keeping the last good version when a
// save isn't a good manifest.
import { toRaw } from 'vue';
import { defineStore } from 'pinia';
import { t } from '@/i18n';
import { readManifest, ManifestError, MOST_MANIFEST_BYTES } from '@/plugins/manifest';
import { themeRef, pluginOfTheme, pluginsOff } from '@/plugins/themes';
import { solverFor, pluginOfSolver, allSolvers, registerSolvers, unregisterSolvers, onSolverFailure } from '@/plugins/solvers';
import { loadPlugins, putPlugin, deletePlugin } from '@/plugins/storage';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

const refused = (error) => {
  if (!(error instanceof ManifestError)) return error;
  return Object.assign(new Error(error.message), { userMessage: t(`plugins.errors.${error.code}`, error.detail) });
};

// Plugins linked to their files: a browser with File System Access, not the desktop app (its files are its own).
export const linksFiles = () => import.meta.env.VITE_DESKTOP !== '1' && typeof globalThis.showOpenFilePicker === 'function';
export const FOLLOW_MS = 1000;

const problem = (code, detail) => Object.assign(new Error(code), { userMessage: t(`plugins.errors.${code}`, detail) });
// The browser lets a page read a kept file once asked; asking needs a click, so a timer only looks.
const readable = async (handle, ask) => (await handle.queryPermission({ mode: 'read' })) === 'granted'
  || (ask && (await handle.requestPermission({ mode: 'read' })) === 'granted');
const stamp = (file) => `${file.lastModified}/${file.size}`;

// Followed files' stamps as last seen, by plugin id, and the one timer that looks at them.
const seen = new Map();
let timer = null, checking = false;
function keepTimer(store) {
  const any = Object.keys(store.following).length > 0;
  if (any && !timer) timer = setInterval(() => store.checkFollowed(), FOLLOW_MS);
  if (!any && timer) {
    clearInterval(timer);
    timer = null;
  }
}

// One listener for the active store: a new Pinia (a test, mostly) takes over rather than adding another.
let stopListening = null;
function listen(store) {
  stopListening?.();
  stopListening = onSolverFailure((ref, message) => {
    const found = solverFor(ref);
    const pluginId = pluginOfSolver(ref);
    store.problems[pluginId] = t('plugins.errors.solverFailed', { name: found?.def.name ?? ref, message });
    store.solverStamp++;
  });
}

const byName = (a, b) => a.manifest.name.localeCompare(b.manifest.name) || a.id.localeCompare(b.id);

export const usePluginStore = defineStore('plugins', {
  state: () => ({
    plugins: [],                             // records, by name
    off: pluginsOff(globalThis.location?.search ?? ''), // ?plugins=off: read once, for this visit
    unavailable: false,                      // the browser won't keep anything (some private windows)
    following: {},                           // { [id]: true } for files followed; not kept
    problems: {},                            // { [id]: words } for a file that couldn't be taken; not kept
    solvers: {},                             // { [ref]: { pluginId, name, styles, reach, chars, options } }, data only; not kept
    solverStamp: 0,                          // bumped whenever the solvers or one's failure change
  }),

  getters: {
    pluginState: (state) => (pluginId) => {
      const record = state.plugins.find(({ id }) => id === pluginId);
      return !record ? 'absent' : record.enabled ? 'on' : 'off';
    },
    themes: (state) => (state.off ? [] : state.plugins.filter(({ enabled }) => enabled).flatMap(({ id, manifest }) =>
      manifest.themes.map(({ id: theme, name, base, colors }) => ({ ref: themeRef(id, theme), name, base, colors })))),
  },

  actions: {
    // Every register or unregister of a plugin's solvers goes through these two.
    useSolvers(pluginId, hash, defs) {
      listen(this);
      registerSolvers(pluginId, hash, defs);
      this.refreshSolvers();
    },

    dropSolvers(pluginId) {
      listen(this);
      unregisterSolvers(pluginId);
      this.refreshSolvers();
    },

    refreshSolvers() {
      this.solvers = Object.fromEntries(allSolvers().map(([ref, pluginId, { name, styles, reach, chars, options }]) =>
        [ref, { pluginId, name, styles, reach, chars, options }]));
      this.solverStamp++;
    },

    // ponytail: a change made while a load is reading is overwritten by what it read; count loads if that ever bites.
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
          usable.push({ ...record, manifest: readManifest(JSON.stringify({ ...record.manifest, script: record.manifest.script || undefined })) });
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

    // The browser's picker: { manifest, replaces, handle }, or null when it's canceled.
    async pick() {
      let handle;
      try {
        [handle] = await globalThis.showOpenFilePicker({
          types: [{ description: t('plugins.manifestFiles'), accept: { 'application/json': ['.json'] } }],
        });
      } catch (error) {
        if (error.name === 'AbortError') return null;
        throw error;
      }
      return { ...(await this.read(await handle.getFile())), handle };
    },

    // With no handle, a link to an earlier file is forgotten, and it isn't followed.
    async install(manifest, { handle = null } = {}) {
      const old = this.plugins.find(({ id }) => id === manifest.id);
      await this.changing(manifest.id, {
        id: manifest.id, manifest, enabled: old ? old.enabled : true, source: 'file', installedAt: Date.now(),
        ...(handle && { handle }),
      });
      if (!handle) this.unfollow(manifest.id);
    },

    // The linked file read again: true when it's taken, false with the reason in problems (the record as it was).
    async reload(id) {
      const handle = this.plugins.find((plugin) => plugin.id === id)?.handle;
      try {
        if (!handle || !(await readable(handle, true))) throw problem('notAllowed');
        let file;
        try { file = await handle.getFile(); } catch { throw problem('fileGone'); }
        const { manifest } = await this.read(file);
        if (manifest.id !== id) throw problem('otherPlugin', { id: manifest.id });
        await this.install(manifest, { handle });
        delete this.problems[id];
        return true;
      } catch (error) {
        this.problems[id] = error.userMessage ?? t('plugins.errors.fileGone');
        return false;
      }
    },

    async follow(id, on) {
      if (!on) return this.unfollow(id);
      const handle = this.plugins.find((plugin) => plugin.id === id)?.handle;
      try {
        if (!handle || !(await readable(handle, true))) throw problem('notAllowed');
        seen.set(id, stamp(await handle.getFile()));
        this.following[id] = true;
        keepTimer(this);
      } catch (error) {
        this.problems[id] = error.userMessage ?? t('plugins.errors.fileGone');
      }
    },

    unfollow(id) {
      delete this.following[id];
      seen.delete(id);
      keepTimer(this);
    },

    // What the timer runs: each followed file whose stamp changed is reloaded; one that can't be read is let go.
    async checkFollowed() {
      if (checking) return;
      checking = true;
      try {
        for (const id of Object.keys(this.following)) {
          const handle = this.plugins.find((plugin) => plugin.id === id)?.handle;
          let file;
          try {
            if (!handle || !(await readable(handle, false))) throw problem('notAllowed');
            try { file = await handle.getFile(); } catch { throw problem('fileGone'); }
          } catch (error) {
            this.unfollow(id);
            this.problems[id] = error.userMessage;
            continue;
          }
          if (seen.get(id) === stamp(file)) continue;
          seen.set(id, stamp(file));
          await this.reload(id);
        }
      } finally {
        checking = false;
      }
    },

    async setEnabled(id, on) {
      const record = this.plugins.find((plugin) => plugin.id === id);
      if (record) await this.changing(id, { ...toRaw(record), enabled: on });
    },

    async uninstall(id) {
      this.unfollow(id);
      delete this.problems[id];
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
