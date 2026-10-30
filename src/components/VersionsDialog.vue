<script setup>
import { ref, onMounted, useTemplateRef } from 'vue';
import ModalDialog from '@/components/ModalDialog.vue';
import { useProjectStore } from '@/store/ProjectStore';
import { listVersions } from '@/document/autosaveStore';

// The versions autosave has kept of this document, newest first, to go back to. useAutosave is called
// once, in App, so it hands over what this needs.
const props = defineProps({
  flush: { type: Function, required: true }, // writes what's waiting, so the list is up to date
  restoreVersion: { type: Function, required: true },
});
const emit = defineEmits(['close']);
const project = useProjectStore();

const versions = ref(null); // null until they're read, so "No versions yet" doesn't flash
const problem = ref('');
const restoring = ref(false);
const closeButton = useTemplateRef('closeButton');

const when = (ms) => new Date(ms).toLocaleString();
const size = (bytes) => (bytes < 2 ** 20 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 2 ** 20).toFixed(1)} MB`);

onMounted(async () => {
  try {
    await props.flush();
    versions.value = await listVersions(project.documentId);
  } catch (error) {
    console.warn('Autosave could not list versions', error);
    problem.value = "Couldn't read the versions.";
  }
});

// Not while a restore is under way: anything drawn meanwhile would be lost when it lands.
function close() {
  if (!restoring.value) emit('close');
}

async function restore(id) {
  restoring.value = true;
  problem.value = '';
  try {
    await props.restoreVersion(id);
    emit('close');
  } catch (error) {
    console.warn('Autosave could not restore the version', error);
    problem.value = "Couldn't restore that version.";
    restoring.value = false;
    closeButton.value.focus(); // the Restore button had it, and lost it on being disabled
  }
}
</script>

<template>
  <ModalDialog
      title="Versions"
      sub="Kept in this browser, every 5 minutes while you work. The last 20 stay, and restoring starts a fresh undo history. Clearing this site's data deletes them, so save to a file for a real backup."
      @cancel="close"
  >
    <ul v-if="versions?.length" aria-label="Versions">
      <li v-for="version in versions" :key="version.id">
        <span class="when">{{ when(version.savedAt) }}</span>
        <span v-if="version.reason === 'before-restore'" class="reason">Before restoring</span>
        <span class="size">{{ size(version.bytes) }}</span>
        <button type="button" :disabled="restoring" @click="restore(version.id)">Restore</button>
      </li>
    </ul>
    <p v-else-if="versions" class="none">No versions yet</p>

    <p v-if="problem" class="problem" role="alert">{{ problem }}</p>

    <div class="actions">
      <button ref="closeButton" type="button" class="cancel" @click="close">Close</button>
    </div>
  </ModalDialog>
</template>

<style scoped>
/* As long as it needs to be, scrolling past a few rows. */
ul {
  max-height: 260px;
  margin: 0;
  padding: 4px 0;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-1);
}

li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 3px 12px;
  font-size: 13px;
}

span.reason {
  color: var(--accent-hot);
}

span.size {
  margin-left: auto;
  color: var(--text-muted);
}

p.none {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
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

button.cancel {
  padding: 6px 4px;
  border: 0;
  background: none;
  box-shadow: none;
  color: var(--text-muted);
  font: inherit;
}
</style>
