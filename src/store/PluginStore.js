// The plugins installed in this browser (docs/plugins.md): read from a package (a folder, a .zip or a lone manifest),
// switched on and off, removed, the themes the ones that are on offer, and the solvers their scripts add. A theme in
// use whose plugin stops offering it gives way to its base. A script is imported only once the person says Install, and
// then on each visit for a plugin that's on; it's kept in the record with its hash, and imported under the hang mark.
// Picked with the browser's picker (Chrome, Edge), a plugin keeps its file's or folder's handle, for an author: Reload
// reads it again, and Follow file looks at it every FOLLOW_MS and takes each save, keeping the last good version when a
// save isn't a good plugin. A save that gives a plugin a script for the first time waits for the person (pendingCode).
// The marketplace's list loads once a visit (market); a listed plugin is read from its files at the listed commit,
// hash-checked, and installed as from a file, keeping its listing.
import { toRaw } from 'vue';
import { defineStore } from 'pinia';
import { t } from '@/i18n';
import { readManifest, ManifestError } from '@/plugins/manifest';
import { themeRef, pluginOfTheme, pluginsOff } from '@/plugins/themes';
import { solverFor, pluginOfSolver, allSolvers, registerSolvers, unregisterSolvers, onSolverFailure, onSolverFault, onShaderOff, registeredHash } from '@/plugins/solvers';
import { readPackage, folderStamp } from '@/plugins/package';
import { sha256, importScript, readScript } from '@/plugins/script';
import { beginRun, endRun, hungLastTime } from '@/plugins/hangMark';
import { loadPlugins, putPlugin, deletePlugin } from '@/plugins/storage';
import { ListError, sameListing } from '@/plugins/listing';
import { loadList, fetchListed } from '@/plugins/market';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

const refused = (error) => {
  if (!(error instanceof ManifestError)) return error;
  return Object.assign(new Error(error.message), { userMessage: t(`plugins.errors.${error.code}`, error.detail) });
};

// Plugins linked to their files: a browser with File System Access, not the desktop app (its files are its own).
export const linksFiles = () => import.meta.env.VITE_DESKTOP !== '1' && typeof globalThis.showOpenFilePicker === 'function';
export const linksFolders = () => import.meta.env.VITE_DESKTOP !== '1' && typeof globalThis.showDirectoryPicker === 'function';
export const FOLLOW_MS = 1000;

const problem = (code, detail) => Object.assign(new Error(code), { userMessage: t(`plugins.errors.${code}`, detail) });
// The browser lets a page read a kept file once asked; asking needs a click, so a timer only looks.
const readable = async (handle, ask) => (await handle.queryPermission({ mode: 'read' })) === 'granted'
  || (ask && (await handle.requestPermission({ mode: 'read' })) === 'granted');
// A followed file's lastModified/size, or a folder's manifest's and script's (a record installed from a lone manifest
// keeps its file's handle).
async function stampOf(record) {
  try {
    if (record.handle.kind === 'file') {
      const file = await record.handle.getFile();
      return `${file.lastModified}/${file.size}`;
    }
    return await folderStamp(record.handle, record.manifest.script);
  } catch {
    throw problem('fileGone');
  }
}

// A script's solvers, checked; importing runs its top level, so it's under the hang mark like a first resolve.
async function solversOf(pluginId, script) {
  beginRun(pluginId);
  try {
    return readScript(await importScript(script)).solvers;
  } catch (error) {
    throw refused(error);
  } finally {
    endRun();
  }
}

// A record's kept script, its hash checked, into its solvers; or an Error with its userMessage.
async function keptSolvers(record) {
  if ((await sha256(record.script)) !== record.scriptHash) throw problem('hashMismatch', { name: record.manifest.name });
  return solversOf(record.id, record.script);
}

// A record read before an await is still the one kept: nothing replaced it meanwhile.
const isCurrent = (store, record) => toRaw(store.plugins.find(({ id }) => id === record.id)) === toRaw(record);

// The stores whose first load has read the hang mark: later loads this visit don't (an import of their own holds it).
const hangRead = new WeakSet();

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
  const stops = [
    onSolverFailure((ref, message) => {
      const found = solverFor(ref);
      const pluginId = pluginOfSolver(ref);
      store.problems[pluginId] = t('plugins.errors.solverFailed', { name: found?.def.name ?? ref, message });
      store.solverStamp++;
    }),
    onShaderOff((ref, { log, lost, ...differ }) => {
      const message = log ?? (lost ? t('plugins.errors.shaderLost') : t('plugins.errors.shaderDisagrees', differ));
      store.problems[pluginOfSolver(ref)] = t('plugins.errors.shaderOff', { name: solverFor(ref)?.def.name ?? ref, message });
    }),
    // Kept as a failure's are (until the plugin's solvers are registered again), and never over a failure's or a shader's words.
    onSolverFault((ref) => {
      store.problems[pluginOfSolver(ref)] ??= t('plugins.errors.solverFault', { name: solverFor(ref)?.def.name ?? ref });
    }),
  ];
  stopListening = () => stops.forEach((stop) => stop());
}

// Each loadMarket's turn: only the latest one's answer is taken.
let marketLoads = 0;

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
    pendingCode: {},                         // { [id]: { manifest, scriptText, handle, following } }: a reload that adds a script, asked about; not kept
    // the marketplace's list: idle, loading, ready or failed, and why it failed (a ListError's code, or unreachable); not kept
    market: { status: 'idle', entries: [], built: null, reason: null },
    dialogTab: null,                         // the Plugins dialog's tab, 'market' or 'installed', once it's opened this visit; not kept
    marketView: { search: '', filter: 'all', scroll: 0 }, // the Marketplace tab's search, filter and scroll, for the visit; not kept
  }),

  getters: {
    pluginState: (state) => (pluginId) => {
      const record = state.plugins.find(({ id }) => id === pluginId);
      return !record ? 'absent' : record.enabled ? 'on' : 'off';
    },
    themes: (state) => (state.off ? [] : state.plugins.filter(({ enabled }) => enabled).flatMap(({ id, manifest }) =>
      manifest.themes.map(({ id: theme, name, base, colors }) => ({ ref: themeRef(id, theme), name, base, colors })))),
    // The loaded list's entry with that id, or null.
    marketFor: (state) => (id) => state.market.entries.find(({ manifest }) => manifest.id === id) ?? null,
    // A marketplace plugin whose repo and path the loaded list no longer has; never before the list has loaded.
    notListed: (state) => (id) => {
      const listing = state.plugins.find((plugin) => plugin.id === id)?.listing;
      return !!listing && state.market.status === 'ready' && !state.market.entries.some((entry) => sameListing(entry, listing));
    },
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
    // Two loads at once may import one script twice (harmless: its solvers are registered once more).
    async load() {
      const hang = hangRead.has(this) ? null : hungLastTime(); // read alongside the records, not before them
      hangRead.add(this);
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
      const hung = await hang;
      const stuck = this.plugins.find(({ id }) => id === hung);
      if (stuck?.enabled) {
        await this.changing(stuck.id, { ...toRaw(stuck), enabled: false });
        this.problems[stuck.id] = t('plugins.errors.hung', { name: stuck.manifest.name });
      }
      if (this.off) return;
      for (const record of this.plugins) {
        // what this visit already has (the dialog loads each time it opens) isn't imported again
        if (!record.enabled || !record.script || registeredHash(record.id) === record.scriptHash) continue;
        let defs;
        try {
          defs = await keptSolvers(record);
        } catch (error) {
          if (isCurrent(this, record)) this.problems[record.id] = error.userMessage ?? t('plugins.errors.notKept');
          continue;
        }
        // a Reload, a switch or another load while it imported: what they did stands
        if (isCurrent(this, record)) this.useSolvers(record.id, record.scriptHash, defs);
      }
    },

    // A package (as readPackage takes it) read and checked, nothing of its script run: { manifest, script: its text or
    // null, replaces: the record it would replace or null, handle: a folder's, else null }, or an Error with its
    // userMessage.
    async read(source) {
      try {
        const { manifestText, scriptText, handle } = await readPackage(source);
        const manifest = readManifest(manifestText);
        return { manifest, script: scriptText, replaces: this.plugins.find(({ id }) => id === manifest.id) ?? null, handle };
      } catch (error) {
        throw refused(error);
      }
    },

    // The marketplace's list, once a visit unless again; one that can't be had (or read) leaves it failed and empty.
    async loadMarket({ again = false } = {}) {
      if (!again && this.market.status !== 'idle') return;
      const mine = ++marketLoads;
      this.market = { status: 'loading', entries: [], built: null, reason: null };
      try {
        const { built, entries } = await loadList();
        if (mine === marketLoads) this.market = { status: 'ready', entries, built, reason: null };
      } catch (error) {
        const reason = error instanceof ListError ? error.code : 'unreachable';
        if (mine === marketLoads) this.market = { status: 'failed', entries: [], built: null, reason };
      }
    },

    // A listed plugin's files fetched and checked against the list, nothing of its script run: what read gives, with its
    // listing ({ repo, path, commit, official }), or an Error with its userMessage.
    async readListed(entry) {
      try {
        const { manifestText, scriptText } = await fetchListed(entry);
        const manifest = readManifest(manifestText);
        if (manifest.id !== entry.manifest.id) throw new ManifestError('changedSinceListed');
        const { repo, path, commit, official } = entry;
        return {
          manifest, script: scriptText, replaces: this.plugins.find(({ id }) => id === manifest.id) ?? null, handle: null,
          listing: { repo, path, commit, official },
        };
      } catch (error) {
        throw refused(error);
      }
    },

    // The browser's file picker, a .zip or a lone manifest: what read gives, with a manifest's file handle kept (a
    // zip's isn't: Reload reads a lone manifest only); null when it's canceled.
    async pick() {
      let handle;
      try {
        [handle] = await globalThis.showOpenFilePicker({
          types: [{ description: t('plugins.manifestFiles'), accept: { 'application/json': ['.json'], 'application/zip': ['.zip'] } }],
        });
      } catch (error) {
        if (error.name === 'AbortError') return null;
        throw error;
      }
      const file = await handle.getFile();
      const read = await this.read(file);
      return { ...read, handle: /\.zip$/i.test(file.name) ? null : handle };
    },

    // The browser's folder picker: what read gives, the folder's handle kept; null when it's canceled.
    async pickFolder() {
      let handle;
      try {
        handle = await globalThis.showDirectoryPicker();
      } catch (error) {
        if (error.name === 'AbortError') return null;
        throw error;
      }
      return this.read(handle);
    },

    // With no handle, a link to an earlier file is forgotten, and it isn't followed. A script is imported and its
    // solvers checked before anything is kept: one that fails throws with its userMessage, and an older version stays.
    // With a listing (readListed's), it's kept as from the marketplace.
    async install(manifest, { script = null, handle = null, listing = null } = {}) {
      const id = manifest.id;
      if (manifest.script && script === null) throw problem('noScript', { path: manifest.script });
      if (script !== null && this.off) throw problem('codeWhileOff');
      const old = this.plugins.find((plugin) => plugin.id === id);
      const enabled = old ? old.enabled : true;
      const scriptHash = script === null ? null : await sha256(script);
      const defs = script === null ? null : await solversOf(id, script);
      await this.changing(id, {
        id, manifest, enabled, source: listing ? 'marketplace' : 'file', installedAt: Date.now(),
        ...(listing && { listing: { repo: listing.repo, path: listing.path, commit: listing.commit, official: listing.official } }),
        ...(handle && { handle }), ...(script !== null && { script, scriptHash }),
      });
      delete this.pendingCode[id];
      if (!handle) this.unfollow(id);
      // an older script's solvers go first, so nothing calls them again
      this.dropSolvers(id);
      if (defs && enabled) this.useSolvers(id, scriptHash, defs);
    },

    // The linked file or folder read again: true when it's taken, false with the reason in problems (the record as it
    // was). A plugin that had no script and now has one isn't taken: it waits in pendingCode for allowCode, unfollowed.
    async reload(id) {
      const record = this.plugins.find((plugin) => plugin.id === id), handle = record?.handle;
      try {
        if (!handle || !(await readable(handle, true))) throw problem('notAllowed');
        let source = handle;
        if (handle.kind === 'file') {
          try { source = await handle.getFile(); } catch { throw problem('fileGone'); }
        }
        const { manifest, script } = await this.read(source);
        if (manifest.id !== id) throw problem('otherPlugin', { id: manifest.id });
        delete this.problems[id];
        if (script !== null && !record.script) {
          this.pendingCode[id] = { manifest, scriptText: script, handle, following: !!this.following[id] };
          this.unfollow(id);
          return false;
        }
        await this.install(manifest, { script, handle });
        return true;
      } catch (error) {
        this.problems[id] = error.userMessage ?? t('plugins.errors.fileGone');
        return false;
      }
    },

    // The person allowed a reload's new script (pendingCode): installed, as Install would, and followed again if it was.
    // False with the reason in problems when it fails its checks.
    async allowCode(id) {
      const pending = toRaw(this.pendingCode[id]);
      if (!pending) return false;
      delete this.pendingCode[id];
      try {
        await this.install(pending.manifest, { script: pending.scriptText, handle: pending.handle });
        delete this.problems[id];
      } catch (error) {
        this.problems[id] = error.userMessage ?? t('plugins.errors.notKept');
        return false;
      }
      if (pending.following) await this.follow(id, true);
      return true;
    },

    // Declined, the new script isn't taken; only the code was declined, so a followed folder is followed again (its next
    // save asks again while it names a script).
    async declineCode(id) {
      const pending = this.pendingCode[id];
      delete this.pendingCode[id];
      if (pending?.following) await this.follow(id, true);
    },

    async follow(id, on) {
      if (!on) return this.unfollow(id);
      const record = this.plugins.find((plugin) => plugin.id === id);
      try {
        if (!record?.handle || !(await readable(record.handle, true))) throw problem('notAllowed');
        seen.set(id, await stampOf(record));
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

    // What the timer runs: each followed file or folder whose stamp changed is reloaded; one that can't be read is let go.
    async checkFollowed() {
      if (checking) return;
      checking = true;
      try {
        for (const id of Object.keys(this.following)) {
          const record = this.plugins.find((plugin) => plugin.id === id);
          let now;
          try {
            if (!record?.handle || !(await readable(record.handle, false))) throw problem('notAllowed');
            now = await stampOf(record);
          } catch (error) {
            this.unfollow(id);
            this.problems[id] = error.userMessage ?? t('plugins.errors.fileGone');
            continue;
          }
          if (seen.get(id) === now) continue;
          seen.set(id, now);
          await this.reload(id);
        }
      } finally {
        checking = false;
      }
    },

    // On, a plugin's kept script is imported (not under plugins=off); one that fails stays off, saying why.
    async setEnabled(id, on) {
      const record = this.plugins.find((plugin) => plugin.id === id);
      if (!record) return;
      let defs = null;
      if (on && record.script && !this.off) {
        try {
          defs = await keptSolvers(record);
        } catch (error) {
          if (isCurrent(this, record)) this.problems[id] = error.userMessage ?? t('plugins.errors.notKept');
          return;
        }
        if (!isCurrent(this, record)) return; // switched off, reloaded or removed while it imported: that stands
        delete this.problems[id];
      }
      await this.changing(id, { ...toRaw(record), enabled: on });
      if (defs) this.useSolvers(id, record.scriptHash, defs);
      else if (!on) this.dropSolvers(id);
    },

    async uninstall(id) {
      this.unfollow(id);
      delete this.problems[id];
      delete this.pendingCode[id];
      await this.changing(id, null);
      this.dropSolvers(id);
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
