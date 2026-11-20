<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import ModalDialog from '@/components/ModalDialog.vue';
import ChoiceDialog from '@/components/ChoiceDialog.vue';
import { usePluginStore, linksFiles, linksFolders } from '@/store/PluginStore';
import { filesOfDrop } from '@/plugins/package';

// The Plugins dialog (docs/plugins.md): what's installed, each switched on or off or removed, and a plugin installed
// from a folder, a .zip or a lone manifest, picked or dropped: the browser's folder picker can't choose a file nor its
// file picker a folder, so there's a button for each. Installing and removing ask first, in a ChoiceDialog in this
// one's place; a plugin with a script is warned about, and nothing of it runs before Install. A manifest's words are the
// author's, shown as text. Where the browser can link a page to a file or folder (linksFiles, linksFolders), a plugin
// is picked with its picker and keeps its file or folder, for Reload and Follow file. A Reload that gives a plugin a
// script for the first time waits on its row (pendingCode) for Allow or Not now.
const DOCS = 'https://github.com/jejacks0n/phosphor/blob/main/docs/plugins.md';
// A desktop window started with plugins off has no address to load again without them: a new window starts with them.
const STARTED_OFF = import.meta.env.VITE_DESKTOP === '1' ? 'plugins.startedOffDesktop' : 'plugins.startedOff';
const emit = defineEmits(['close']);
const { t } = useI18n();
const plugins = usePluginStore();
onMounted(() => plugins.load()); // another window may have changed them

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
const asking = ref(null); // { install: { manifest, script, replaces, handle } } or { remove: record }

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
function installQuestion({ manifest, replaces }) {
  const named = { name: manifest.name, version: manifest.version };
  return {
    title: replaces ? t('plugins.install.replaceTitle', { ...named, old: replaces.manifest.version }) : t('plugins.install.title', named),
    sub: t('plugins.by', { author: manifest.author }),
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
    if (install) await plugins.install(install.manifest, { script: install.script, handle: install.handle });
    else await plugins.uninstall(remove.id);
  } catch (error) {
    console.warn('Could not keep the change to plugins', error);
    problem.value = error.userMessage ?? t('plugins.errors.notKept'); // a script refused says why in its own words
  }
  asking.value = null;
}
</script>

<template>
  <ChoiceDialog
      v-if="asking"
      v-bind="asking.install ? installQuestion(asking.install) : removeQuestion(asking.remove)"
      @choose="answer"
      @cancel="asking = null"
  />
  <ModalDialog v-else :title="t('plugins.title')" :sub="t('plugins.sub')" long closable @cancel="emit('close')">
    <div class="plugins">
      <p v-if="plugins.off" class="note">{{ t(STARTED_OFF) }}</p>
      <p v-if="plugins.unavailable" class="note">{{ t('plugins.unavailable') }}</p>

      <ul v-if="plugins.plugins.length" ref="list">
        <li v-for="{ id, manifest, enabled, handle } in plugins.plugins" :key="id" :data-id="id">
          <div class="head">
            <strong class="name">{{ manifest.name }}</strong>
            <span class="version">{{ manifest.version }}</span>
            <button
                type="button"
                role="switch"
                class="switch"
                :aria-checked="enabled ? 'true' : 'false'"
                :aria-label="manifest.name"
                @click="plugins.setEnabled(id, !enabled)"
            >{{ enabled ? t('plugins.on') : t('plugins.off') }}</button>
            <button
                type="button"
                class="remove"
                :aria-label="t('plugins.removeNamed', { name: manifest.name })"
                @click="asking = { remove: { id, manifest } }"
            >{{ t('plugins.remove') }}</button>
          </div>
          <p class="line">
            <span>{{ t('plugins.by', { author: manifest.author }) }}</span>
            <span v-if="manifest.themes.length">{{ adds(manifest) }}</span>
            <span v-if="manifest.script">{{ t('plugins.runsCode') }}</span>
            <a v-if="manifest.homepage" :href="manifest.homepage" target="_blank" rel="noopener noreferrer">{{ address(manifest.homepage) }}</a>
            <span v-if="handle">{{ handle.kind === 'directory' ? t('plugins.fromFolder') : t('plugins.fromFile') }}</span>
          </p>
          <p v-if="manifest.description" class="description">{{ manifest.description }}</p>
          <div v-if="handle" class="file">
            <button
                type="button"
                :aria-label="t('plugins.reloadNamed', { name: manifest.name })"
                @click="plugins.reload(id)"
            >{{ t('plugins.reload') }}</button>
            <button
                type="button"
                role="switch"
                class="switch"
                :aria-checked="plugins.following[id] ? 'true' : 'false'"
                :aria-label="t('plugins.followNamed', { name: manifest.name })"
                @click="plugins.follow(id, !plugins.following[id])"
            >{{ t('plugins.follow') }}</button>
          </div>
          <div v-if="plugins.pendingCode[id]" class="pending">
            <p role="status">{{ t('plugins.nowRunsCode', { name: manifest.name }) }}</p>
            <p class="warn">{{ t('plugins.install.warning') }}</p>
            <div class="file">
              <button type="button" :aria-label="t('plugins.allowNamed', { name: manifest.name })" @click="answerCode(id, true)">{{ t('plugins.allow') }}</button>
              <button type="button" :aria-label="t('plugins.notNowNamed', { name: manifest.name })" @click="answerCode(id, false)">{{ t('plugins.notNow') }}</button>
            </div>
          </div>
          <p v-if="plugins.problems[id]" class="problem" role="alert">{{ plugins.problems[id] }}</p>
        </li>
      </ul>
      <p v-else-if="!plugins.unavailable" class="none">
        {{ t('plugins.empty') }}
        <a :href="DOCS" target="_blank" rel="noopener noreferrer">{{ t('plugins.docs') }}</a>
      </p>

      <p v-if="problem" class="problem" role="alert">{{ problem }}</p>

      <input ref="fileInput" type="file" accept=".zip,.json,application/zip,application/json" hidden @change="onFile">
      <input ref="folderInput" type="file" webkitdirectory hidden @change="onFolder">
      <div class="actions">
        <button type="button" :disabled="plugins.unavailable" @click="installFile">{{ t('plugins.installFile') }}</button>
        <button type="button" :disabled="plugins.unavailable" @click="installFolder">{{ t('plugins.installFolder') }}</button>
      </div>
    </div>
  </ModalDialog>
</template>

<style scoped>
ul {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-1);
}

li {
  padding: 10px 12px;
  font-size: 13px;
}
li + li {
  border-top: 1px solid var(--border-subtle);
}

div.head {
  display: flex;
  align-items: center;
  gap: 8px;
}
strong.name {
  min-width: 0;
  overflow-wrap: anywhere;
}
span.version {
  margin-right: auto;
  color: var(--text-muted);
}
div.head button, div.file button {
  padding: 4px 10px;
}
div.file {
  display: flex;
  gap: 8px;
  margin-top: 8px;
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
