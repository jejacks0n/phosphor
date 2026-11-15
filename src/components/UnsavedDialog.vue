<script setup>
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import ChoiceDialog from '@/components/ChoiceDialog.vue';

// Asked before New project or a file opens over a drawing with unsaved changes (workspace.confirmLeave): save the
// project first (the save dialog, then on), go on without saving (the drawing stays in autosave's recent list), or
// Cancel and stay. Saying Save and then canceling the save stays too.
const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();
const DESKTOP = import.meta.env.VITE_DESKTOP === '1';

const ask = computed(() => workspace.unsavedAsk);
const opening = computed(() => ask.value?.name != null);
const title = computed(() => (opening.value ? t('unsaved.openTitle', { name: ask.value.name }) : t('unsaved.newTitle')));
const choices = computed(() => [
  { id: 'save', title: t('unsaved.saveFirst'), text: opening.value ? t('unsaved.saveFirstOpen', { name: ask.value.name }) : t('unsaved.saveFirstNew') },
  { id: 'go', title: t(opening.value ? 'unsaved.openWithout' : 'unsaved.newWithout'), text: t(DESKTOP ? 'unsaved.withoutTextDesktop' : 'unsaved.withoutText') },
]);

function done(go) {
  const { go: then } = workspace.unsavedAsk;
  workspace.unsavedAsk = null;
  if (go) then();
}

async function choose(id) {
  if (id === 'go') return done(true);
  workspace.unsavedAsk = { ...workspace.unsavedAsk, saving: true };
  if (!DESKTOP) return void (workspace.saveDialog = 'phosphor'); // goes on when it closes, below
  await workspace.saveFile(); // the system's own save box
  done(!project.isDirty);
}
// The save dialog closed: saved, then on; canceled, stay.
watch(() => workspace.saveDialog, (now, was) => {
  if (was && !now && ask.value?.saving && !DESKTOP) done(!project.isDirty);
});
</script>

<template>
  <ChoiceDialog
      v-if="ask && !ask.saving"
      :title="title"
      :sub="t('unsaved.sub')"
      :choices="choices"
      @choose="choose"
      @cancel="done(false)"
  />
</template>
