<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import ModalDialog from '@/components/ModalDialog.vue';
import ChoiceDialog from '@/components/ChoiceDialog.vue';
import PluginMarket from '@/components/PluginMarket.vue';
import { usePluginStore, linksFiles, linksFolders } from '@/store/PluginStore';
import { filesOfDrop } from '@/plugins/package';
import { marketState, swatches } from '@/plugins/listing';
import { TRASH } from '@/components/icons';

// The Plugins dialog (docs/plugins.md), two tabs: Marketplace (PluginMarket) and Installed. It opens on Installed when
// anything is installed, else on Marketplace, and then on the tab last used this visit (the store's dialogTab); it loads
// the marketplace's list once a visit, on either tab, so Installed can show Update and No longer listed. At 700px wide
// and below it's the whole window. Installed: what's installed, each switched on or off or removed, and a plugin installed
// from a folder, a .zip or a lone manifest, picked or dropped: the browser's folder picker can't choose a file nor its
// file picker a folder, so there's a button for each. Installing and removing ask first, in a ChoiceDialog in this
// one's place; a plugin with a script is warned about, and nothing of it runs before Install. A manifest's words are the
// author's, shown as text. Where the browser can link a page to a file or folder (linksFiles, linksFolders), a plugin
// is picked with its picker and keeps its file or folder, for Reload and Follow file. A Reload that gives a plugin a
// script for the first time waits on its row (pendingCode) for Allow or Not now. A listed plugin (a card's button, or a
// row's Update) is read from its files, checked against the list, and asked about as any other, naming where it's from.
const DOCS = 'https://github.com/jejacks0n/phosphor/blob/main/docs/plugins.md';
// A desktop window started with plugins off has no address to load again without them: a new window starts with them.
const STARTED_OFF = import.meta.env.VITE_DESKTOP === '1' ? 'plugins.startedOffDesktop' : 'plugins.startedOff';
const emit = defineEmits(['close']);
const { t } = useI18n();
const plugins = usePluginStore();
// Another window may have changed them. The tab is chosen once they're read, then kept: an install doesn't move it.
onMounted(() => plugins.load().then(() => { plugins.dialogTab ??= tab.value; }));
onMounted(() => plugins.loadMarket());
const tab = computed(() => plugins.dialogTab ?? (plugins.plugins.length ? 'installed' : 'market'));
const TABS = ['market', 'installed'];
// The tabs pattern: Left and Right (wrapping) move to a tab and show it.
function onTabKey(event) {
  const next = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
  if (!next) return;
  event.preventDefault();
  plugins.dialogTab = TABS[(TABS.indexOf(tab.value) + next + TABS.length) % TABS.length];
  nextTick(() => document.getElementById(`plugins-tab-${plugins.dialogTab}`)?.focus());
}

// A file or folder dropped anywhere while the dialog is up is the dialog's (the page behind it is inert): a plugin is
// asked about, and nothing dropped sends the tab off to the file. A folder's entries are read before anything awaits.
const onDragOver = (event) => event.preventDefault();
function onDrop(event) {
  event.preventDefault();
  if (asking.value) return;
  filesOfDrop(event.dataTransfer).then(take, () => { problem.value = t('plugins.errors.fileGone'); });
}
onMounted(() => {
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('drop', onDrop);
});
onBeforeUnmount(() => {
  window.removeEventListener('dragover', onDragOver);
  window.removeEventListener('drop', onDrop);
});

const fileInput = ref(null), folderInput = ref(null);
const problem = ref(null);
const asking = ref(null); // { install: { manifest, script, replaces, handle, listing? } } or { remove: record }

const adds = (manifest) => t('plugins.themes', manifest.themes.length);
const address = (homepage) => homepage.replace(/^https:\/\//, '');

// A package (a file, a folder's files, or what a picker gave) read and asked about, or why it can't be.
async function take(source) {
  problem.value = null;
  if (!source || (Array.isArray(source) && !source.length) || plugins.unavailable) return;
  try {
    asking.value = { install: await plugins.read(source) };
  } catch (error) {
    if (!error.userMessage) throw error;
    problem.value = error.userMessage;
  }
}

// A listed plugin's files, read and asked about, or why they can't be. One read after another card's question is up
// (two clicked in turn) is dropped: the question showing is never swapped for another under the person's pointer.
// While its files are read, a card says so (reading, by id) and can't be pressed again.
const reading = reactive(new Set());
async function takeListed(entry) {
  problem.value = null;
  if (plugins.unavailable) return;
  const { id } = entry.manifest;
  let read;
  reading.add(id);
  try {
    read = await plugins.readListed(entry);
  } catch (error) {
    if (!error.userMessage) throw error;
    if (!asking.value) problem.value = error.userMessage;
    return;
  } finally {
    reading.delete(id);
  }
  if (!asking.value) asking.value = { install: read };
}

// The hidden inputs, for a browser that can't link a page to a file or folder: a file, or a folder's files by their
// paths in it (its own name first, as a dropped folder's are).
function onFile(event) {
  const [file] = event.target.files;
  event.target.value = ''; // the same file, picked again, is a change
  take(file);
}
function onFolder(event) {
  const files = [...event.target.files].map((file) => ({ path: file.webkitRelativePath || file.name, file }));
  event.target.value = '';
  take(files);
}

async function install(picker, input) {
  problem.value = null;
  if (!picker) return input.click();
  try {
    const picked = await picker();
    if (picked) asking.value = { install: picked };
  } catch (error) {
    if (!error.userMessage) throw error;
    problem.value = error.userMessage;
  }
}
// Allow or Not now: the question and its buttons go at once, so focus goes to the row's switch rather than the page.
const list = useTemplateRef('list');
async function answerCode(id, allow) {
  const done = allow ? plugins.allowCode(id) : plugins.declineCode(id);
  await nextTick();
  list.value?.querySelector(`li[data-id="${CSS.escape(id)}"] button.switch`)?.focus();
  await done;
}

const installFile = () => install(linksFiles() && (() => plugins.pick()), fileInput.value);
const installFolder = () => install(linksFolders() && (() => plugins.pickFolder()), folderInput.value);

// What Install adds, counted from the manifest alone: its themes and, with a script, the warning (the script's solvers
// aren't known until it runs, after Install).
function addsWords(manifest) {
  if (!manifest.script) return t('plugins.install.adds', { adds: adds(manifest) });
  return manifest.themes.length ? t('plugins.install.addsScript', { adds: adds(manifest) }) : t('plugins.install.addsOnlyScript');
}
// Who it's by, and for a listed plugin where it's from: Official, or the listing's repo and path.
function source({ manifest, listing }) {
  if (listing?.official) return t('plugins.official');
  if (!listing) return t('plugins.by', { author: manifest.author });
  return t('plugins.market.from', { author: manifest.author, source: [listing.repo, listing.path].filter(Boolean).join('/') });
}
function installQuestion(install) {
  const { manifest, replaces } = install;
  const named = { name: manifest.name, version: manifest.version };
  return {
    title: replaces ? t('plugins.install.replaceTitle', { ...named, old: replaces.manifest.version }) : t('plugins.install.title', named),
    sub: source(install),
    choices: [{
      id: 'yes', title: replaces ? t('plugins.install.replace') : t('plugins.install.go'), text: addsWords(manifest),
      note: manifest.script ? t('plugins.install.warning') : undefined,
    }],
  };
}

function removeQuestion(record) {
  return {
    title: t('plugins.removeQuestion.title', { name: record.manifest.name }),
    sub: t('plugins.removeQuestion.sub'),
    choices: [{ id: 'yes', title: t('plugins.remove') }],
  };
}

async function answer() {
  const { install, remove } = asking.value;
  try {
    if (install) await plugins.install(install.manifest, { script: install.script, handle: install.handle, listing: install.listing });
    else await plugins.uninstall(remove.id);
  } catch (error) {
    console.warn('Could not keep the change to plugins', error);
    problem.value = error.userMessage ?? t('plugins.errors.notKept'); // a script refused says why in its own words
  }
  asking.value = null;
}

// A row's Update: the loaded list's entry when it's a higher version of the same listing.
const update = (record) => {
  const entry = plugins.marketFor(record.id);
  return entry && marketState(entry, record) === 'update' ? entry : null;
};
</script>

<template>
  <ChoiceDialog
      v-if="asking"
      v-bind="asking.install ? installQuestion(asking.install) : removeQuestion(asking.remove)"
      @choose="answer"
      @cancel="asking = null"
  />
  <ModalDialog v-else :title="t('plugins.title')" wide full :focus="false" closable @cancel="emit('close')">
    <div class="plugins">
      <div class="tabs" role="tablist" :aria-label="t('plugins.title')" @keydown="onTabKey">
        <button
            v-for="id in TABS"
            :id="`plugins-tab-${id}`"
            :key="id"
            type="button"
            role="tab"
            :class="{ on: tab === id }"
            :aria-selected="tab === id ? 'true' : 'false'"
            :aria-controls="tab === id ? `plugins-panel-${id}` : undefined"
            :tabindex="tab === id ? 0 : -1"
            @click="plugins.dialogTab = id"
        >
          {{ id === 'market' ? t('plugins.market.tab') : t('plugins.installedTab') }}
          <span v-if="id === 'installed'" class="count">{{ plugins.plugins.length }}</span>
        </button>
      </div>

      <p v-if="plugins.off" class="note">{{ t(STARTED_OFF) }}</p>
      <p v-if="plugins.unavailable" class="note">{{ t('plugins.unavailable') }}</p>

      <div :id="`plugins-panel-${tab}`" role="tabpanel" :aria-labelledby="`plugins-tab-${tab}`">
        <PluginMarket v-if="tab === 'market'" :reading="reading" @take="takeListed"/>
        <template v-else>
          <p class="intro">{{ t('plugins.sub') }}</p>
          <ul v-if="plugins.plugins.length" ref="list">
            <li v-for="record in plugins.plugins" :key="record.id" :data-id="record.id">
              <div class="text">
                <div class="head">
                  <strong class="name">{{ record.manifest.name }}</strong>
                  <span class="version">{{ record.manifest.version }}</span>
                  <span v-if="record.listing?.official" class="badge">{{ t('plugins.official') }}</span>
                  <span v-if="update(record)" class="badge">{{ t('plugins.updateTo', { version: update(record).manifest.version }) }}</span>
                  <span v-if="plugins.notListed(record.id)" class="badge dim">{{ t('plugins.notListed') }}</span>
                </div>
                <p class="line">
                  <span v-if="!record.listing?.official">{{ t('plugins.by', { author: record.manifest.author }) }}</span>
                  <span v-if="record.manifest.themes.length">{{ adds(record.manifest) }}</span>
                  <span v-if="record.manifest.themes.length" class="swatches" aria-hidden="true">
                    <i v-for="(color, i) in swatches(record.manifest)" :key="i" :style="{ background: color }"/>
                  </span>
                  <span v-if="record.manifest.script">{{ t('plugins.runsCode') }}</span>
                  <span v-if="record.listing && !record.listing.official">{{ t('plugins.fromMarket') }}</span>
                  <a v-if="record.manifest.homepage" :href="record.manifest.homepage" target="_blank" rel="noopener noreferrer">{{ address(record.manifest.homepage) }}</a>
                  <span v-if="record.handle">{{ record.handle.kind === 'directory' ? t('plugins.fromFolder') : t('plugins.fromFile') }}</span>
                </p>
                <p v-if="record.manifest.description" class="description">{{ record.manifest.description }}</p>
              </div>
              <div class="act">
                <button
                    type="button"
                    role="switch"
                    class="switch"
                    :aria-checked="record.enabled ? 'true' : 'false'"
                    :aria-label="record.manifest.name"
                    @click="plugins.setEnabled(record.id, !record.enabled)"
                >{{ record.enabled ? t('plugins.on') : t('plugins.off') }}</button>
                <button
                    v-if="update(record)"
                    type="button"
                    class="update primary"
                    :aria-label="t('plugins.updateNamed', { name: record.manifest.name })"
                    @click="takeListed(update(record))"
                >{{ t('plugins.market.update') }}</button>
                <button
                    type="button"
                    class="remove"
                    :aria-label="t('plugins.removeNamed', { name: record.manifest.name })"
                    :title="t('plugins.removeNamed', { name: record.manifest.name })"
                    @click="asking = { remove: { id: record.id, manifest: record.manifest } }"
                    v-html="TRASH"
                />
              </div>
              <div v-if="record.handle" class="file">
                <button
                    type="button"
                    :aria-label="t('plugins.reloadNamed', { name: record.manifest.name })"
                    @click="plugins.reload(record.id)"
                >{{ t('plugins.reload') }}</button>
                <button
                    type="button"
                    role="switch"
                    class="switch"
                    :aria-checked="plugins.following[record.id] ? 'true' : 'false'"
                    :aria-label="t('plugins.followNamed', { name: record.manifest.name })"
                    @click="plugins.follow(record.id, !plugins.following[record.id])"
                >{{ t('plugins.follow') }}</button>
              </div>
              <div v-if="plugins.pendingCode[record.id]" class="pending">
                <p role="status">{{ t('plugins.nowRunsCode', { name: record.manifest.name }) }}</p>
                <p class="warn">{{ t('plugins.install.warning') }}</p>
                <div class="file">
                  <button type="button" :aria-label="t('plugins.allowNamed', { name: record.manifest.name })" @click="answerCode(record.id, true)">{{ t('plugins.allow') }}</button>
                  <button type="button" :aria-label="t('plugins.notNowNamed', { name: record.manifest.name })" @click="answerCode(record.id, false)">{{ t('plugins.notNow') }}</button>
                </div>
              </div>
              <p v-if="plugins.problems[record.id]" class="problem" role="alert">{{ plugins.problems[record.id] }}</p>
            </li>
          </ul>
          <p v-else-if="!plugins.unavailable" class="none">
            {{ t('plugins.empty') }}
            <a :href="DOCS" target="_blank" rel="noopener noreferrer">{{ t('plugins.docs') }}</a>
          </p>

          <input ref="fileInput" type="file" accept=".zip,.json,application/zip,application/json" hidden @change="onFile">
          <input ref="folderInput" type="file" webkitdirectory hidden @change="onFolder">
          <div class="actions">
            <button type="button" :disabled="plugins.unavailable" @click="installFile">{{ t('plugins.installFile') }}</button>
            <button type="button" :disabled="plugins.unavailable" @click="installFolder">{{ t('plugins.installFolder') }}</button>
          </div>
        </template>
      </div>

      <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
    </div>
  </ModalDialog>
</template>

<style scoped>
/* The tabs, as the side panel's: words in capitals, the one shown with the accent along its foot. */
div.tabs {
  display: flex;
  gap: 4px;
  margin: 2px 0 14px;
  border-bottom: 1px solid var(--border);
}
div.tabs button[role='tab'] {
  display: flex;
  align-items: center;
  gap: 6px;
  height: auto;
  margin-bottom: -1px;
  padding: 6px 12px 8px;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  box-shadow: none;
  background: none;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  transition: color 0.3s ease;
}
div.tabs button[role='tab']:hover { /* not the global button lift */
  transform: none;
  box-shadow: none;
  background: none;
}
div.tabs button[role='tab']:not(.on):hover {
  color: var(--accent);
}
div.tabs button[role='tab']:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
div.tabs button[role='tab'].on {
  border-bottom-color: var(--accent);
  color: var(--text);
}
span.count {
  padding: 0 5px;
  border-radius: 8px;
  background: var(--surface-2);
  font-size: 10px;
  letter-spacing: 0;
  color: var(--text-muted);
}

p.intro {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-muted);
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-1);
}

li {   /* its text, with its buttons beside it; under it on a narrow window */
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0 12px;
  padding: 10px 12px;
  font-size: 13px;
}
li > :not(div.text, div.act) {
  grid-column: 1 / -1;
}
div.act {
  display: flex;
  align-self: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
}
@media (max-width: 700px) {
  li {
    grid-template-columns: minmax(0, 1fr);
  }
  div.act {
    margin-top: 8px;
  }
}
li + li {
  border-top: 1px solid var(--border-subtle);
}

div.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
}
strong.name {
  min-width: 0;
  overflow-wrap: anywhere;
}
span.version {
  color: var(--text-muted);
}
span.badge {   /* as a marketplace card's */
  align-self: center;
  padding: 1px 5px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}
span.badge.dim {
  border-color: var(--border-light);
  color: var(--text-muted);
}
div.act button, div.file button {
  padding: 4px 10px;
}
span.swatches {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
span.swatches i {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
}
div.file {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
button.remove {
  display: inline-flex;
  align-items: center;
}
button.remove :deep(svg) {
  width: 14px;
  height: 14px;
  fill: currentColor;
}
button.switch[aria-checked='true'] {
  border-color: var(--accent);
  color: var(--text);
}

p.line {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 4px 0 0;
  color: var(--text-muted);
}
p.line a {
  color: var(--accent);
  overflow-wrap: anywhere;
}
p.description {
  margin: 4px 0 0;
  color: var(--text-dim);
  overflow-wrap: anywhere;
}

p.note, p.none {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--text-muted);
}
p.note {
  color: var(--warning);
}
p.none a {
  color: var(--accent);
}

div.pending p {
  margin: 8px 0 0;
}
div.pending p.warn {
  color: var(--warning);
}

p.problem {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--danger);
}

div.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
