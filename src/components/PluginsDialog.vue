<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ModalDialog from '@/components/ModalDialog.vue';
import ChoiceDialog from '@/components/ChoiceDialog.vue';
import { usePluginStore, linksFiles } from '@/store/PluginStore';

// The Plugins dialog (docs/plugins.md): what's installed, each switched on or off or removed, and a plugin installed
// from its manifest file, picked or dropped. Installing and removing ask first, in a ChoiceDialog in this one's place.
// A manifest's words are the author's, shown as text. Where the browser can link a page to a file (linksFiles), a
// plugin is picked with its picker and keeps its file, for Reload and Follow file.
const DOCS = 'https://github.com/jejacks0n/phosphor/blob/main/docs/plugins.md';
const emit = defineEmits(['close']);
const { t } = useI18n();
const plugins = usePluginStore();
onMounted(() => plugins.load()); // another window may have changed them

const fileInput = ref(null);
const problem = ref(null);
const asking = ref(null); // { install: { manifest, replaces } } or { remove: record }

const adds = (manifest) => t('plugins.themes', manifest.themes.length);
const address = (homepage) => homepage.replace(/^https:\/\//, '');

async function take(file) {
  problem.value = null;
  if (!file) return;
  try {
    asking.value = { install: await plugins.read(file) };
  } catch (error) {
    if (!error.userMessage) throw error;
    problem.value = error.userMessage;
  }
}

function onFile(event) {
  const [file] = event.target.files;
  event.target.value = ''; // the same file, picked again, is a change
  take(file);
}

const onDrop = (event) => take(event.dataTransfer.files[0]);

async function installFile() {
  problem.value = null;
  if (!linksFiles()) return fileInput.value.click();
  try {
    const picked = await plugins.pick();
    if (picked) asking.value = { install: picked };
  } catch (error) {
    if (!error.userMessage) throw error;
    problem.value = error.userMessage;
  }
}

function installQuestion({ manifest, replaces }) {
  const named = { name: manifest.name, version: manifest.version };
  return {
    title: replaces ? t('plugins.install.replaceTitle', { ...named, old: replaces.manifest.version }) : t('plugins.install.title', named),
    sub: t('plugins.by', { author: manifest.author }),
    choices: [{ id: 'yes', title: replaces ? t('plugins.install.replace') : t('plugins.install.go'), text: t('plugins.install.adds', { adds: adds(manifest) }) }],
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
  if (install) await plugins.install(install.manifest, { handle: install.handle });
  else await plugins.uninstall(remove.id);
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
    <div class="plugins" @dragover.prevent @drop.prevent.stop="onDrop">
      <p v-if="plugins.off" class="note">{{ t('plugins.startedOff') }}</p>
      <p v-if="plugins.unavailable" class="note">{{ t('plugins.unavailable') }}</p>

      <ul v-if="plugins.plugins.length">
        <li v-for="{ id, manifest, enabled, handle } in plugins.plugins" :key="id">
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
            <span>{{ adds(manifest) }}</span>
            <a v-if="manifest.homepage" :href="manifest.homepage" target="_blank" rel="noopener noreferrer">{{ address(manifest.homepage) }}</a>
            <span v-if="handle">{{ t('plugins.fromFile') }}</span>
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
          <p v-if="plugins.problems[id]" class="problem" role="alert">{{ plugins.problems[id] }}</p>
        </li>
      </ul>
      <p v-else-if="!plugins.unavailable" class="none">
        {{ t('plugins.empty') }}
        <a :href="DOCS" target="_blank" rel="noopener noreferrer">{{ t('plugins.docs') }}</a>
      </p>

      <p v-if="problem" class="problem" role="alert">{{ problem }}</p>

      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onFile">
      <div class="actions">
        <button type="button" :disabled="plugins.unavailable" @click="installFile">{{ t('plugins.installFile') }}</button>
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

p.problem {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--danger);
}

div.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
