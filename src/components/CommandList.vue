<script setup>
import { computed, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ModalDialog from '@/components/ModalDialog.vue';
import { GROUPS, commandById, commandContext, listedCommands } from '@/lib/commands';
import { keyLabel, keysFor, matches } from '@/lib/keymap';
import { searchCommands } from '@/lib/commandSearch';
import { recentCommands } from '@/lib/recentCommands';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

// The command list, opened with Cmd+K (Ctrl+K off a Mac) or the desktop's Help menu: one field, and under it every
// command the table can run here (src/lib/commands.js), found by its words' letters in order (commandSearch.js). Each
// row is its words and its key, when it has one; one that can't run now is grayed with why. ↑ ↓ move the row picked
// while focus stays in the field, Enter runs it, Escape closes. With nothing typed: the commands last run from it,
// then all of them by group. It closes with the id chosen (or none), and App.vue runs it once the list has gone
// (chooseCommand); focus goes back where it was as it goes.
const emit = defineEmits(['close']);
const { t } = useI18n();
const project = useProjectStore(), workspace = useWorkspaceStore();

const from = document.activeElement;
onUnmounted(() => { if (from?.isConnected) from.focus({ preventScroll: true }); });

const ctx = commandContext(project, workspace);
const shownKeys = (c) => (typeof c.shown === 'function' ? c.shown() : c.shown) ?? keysFor(c.keys ?? []).map((key) => keyLabel(key));
const rows = listedCommands(ctx).filter((c) => c.id !== 'ui.commandList').map((c) => {
  const reason = c.available?.(ctx) ?? true;
  return { id: c.id, group: c.group, words: (c.title ?? c.label)(), key: shownKeys(c)[0], reason: reason === true ? null : t(reason) };
});
const byId = new Map(rows.map((row) => [row.id, row]));

const query = ref('');
const sections = computed(() => {
  if (query.value.trim()) return [{ title: '', rows: searchCommands(query.value, rows).map(({ id }) => byId.get(id)) }];
  const recent = recentCommands.read().map((id) => byId.get(id)).filter(Boolean);
  const rest = rows.filter((row) => !recent.includes(row));
  return [{ title: t('shortcuts.list.recent'), rows: recent }, ...GROUPS.map((group) => ({ title: t(`shortcuts.groups.${group}`), rows: rest.filter((row) => row.group === group) }))]
    .filter((section) => section.rows.length);
});
const listed = computed(() => sections.value.flatMap((section) => section.rows));

const active = ref(0);
watch(query, () => { active.value = 0; });
const optionId = (row) => `command-${row.id}`;
const list = useTemplateRef('list');
watch(active, () => list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }), { flush: 'post' });

const choose = (row) => { if (row && !row.reason) emit('close', row.id); };
function onKey(event) {
  if (event.isComposing) return;
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (step) {
    event.preventDefault();
    active.value = Math.max(0, Math.min(listed.value.length - 1, active.value + step));
  } else if (event.key === 'Enter') {
    event.preventDefault();
    choose(listed.value[active.value]);
  } else if (keysFor(commandById('ui.commandList').keys).some((key) => matches(event, key))) {
    event.preventDefault(); // its own key again: not the browser's search box
  }
}
</script>

<template>
  <ModalDialog :title="t('shortcuts.list.title')" closable full @cancel="emit('close', null)">
    <input
        v-model="query"
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-autocomplete="list"
        aria-controls="command-list-rows"
        :aria-activedescendant="listed[active] ? optionId(listed[active]) : undefined"
        :aria-label="t('shortcuts.list.search')"
        :placeholder="t('shortcuts.list.search')"
        autocomplete="off"
        spellcheck="false"
        autofocus
        @keydown="onKey"
    >
    <div id="command-list-rows" ref="list" class="rows" role="listbox" :aria-label="t('shortcuts.list.title')">
      <div v-for="section in sections" :key="section.title" role="group" :aria-label="section.title || undefined">
        <h4 v-if="section.title" aria-hidden="true">{{ section.title }}</h4>
        <div
            v-for="row in section.rows"
            :id="optionId(row)"
            :key="row.id"
            role="option"
            :aria-selected="row === listed[active] ? 'true' : 'false'"
            :aria-disabled="row.reason ? 'true' : undefined"
            :class="{ active: row === listed[active], off: !!row.reason }"
            @mousedown.prevent
            @click="choose(row)"
        >
          <span class="words">{{ row.words }}</span>
          <span v-if="row.reason" class="reason">{{ row.reason }}</span>
          <kbd v-if="row.key">{{ row.key }}</kbd>
        </div>
      </div>
    </div>
    <p v-if="!listed.length" class="none" role="status">{{ t('shortcuts.list.none') }}</p>
  </ModalDialog>
</template>

<style scoped>
input {
  width: 100%;
  box-sizing: border-box;
}

/* One height whatever is found, so the box doesn't change size as you type; the whole window on a phone. */
div.rows {
  height: min(50vh, 400px);
  margin: 10px -18px 0;
  padding: 0 10px;
  overflow-y: auto;
}
@media (max-width: 700px) {
  div.rows {
    flex: 1;
    height: auto;
    min-height: 0;
  }
}

h4 {
  margin: 12px 8px 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--accent-hot);
}

[role="option"] {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 5px 8px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}
[role="option"].active {
  background: var(--surface-3);
}
[role="option"].off {
  color: var(--text-muted);
  cursor: default;
}

span.words {
  flex: 1;
  min-width: 0;
}

span.reason {
  font-size: 12px;
}

kbd {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--surface-3);
  color: var(--text);
  font: 12px ui-monospace, Menlo, monospace;
  white-space: nowrap;
}
[role="option"].active kbd {
  background: var(--surface-4);
}

p.none {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--text-muted);
}
</style>
