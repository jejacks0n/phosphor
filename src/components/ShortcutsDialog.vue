<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ModalDialog from '@/components/ModalDialog.vue';
import { isMac } from '@/lib/keyLabels';
import { COMMANDS, GROUPS, toolCommands } from '@/lib/commands';
import { keyLabel, keysFor } from '@/lib/keymap';
import { useProjectStore } from '@/store/ProjectStore';
import { pluginTools } from '@/tools';

// The keyboard shortcuts, opened with ? (Alt+? while typing in Edit Mode), built from the command table
// (src/lib/commands.js): a row's own keys, written the platform's way (⌘ and ⌥ on a Mac), or its `shown` words.
// Rows of one group with the same words share a line; a hidden row (a key taken only to keep it from the browser) has none. The Animation keys show only with Animate on, as they only
// work then.
const emit = defineEmits(['close']);
const { t } = useI18n();
const project = useProjectStore();

const shown = (row) => {
  const words = typeof row.shown === 'function' ? row.shown() : row.shown;
  return words ?? keysFor(row.keys ?? []).map((key) => keyLabel(key));
};

// The tools as rows: the art views' (the Tools group, plugin brushes in a group of their own) and then those only
// VECTOR has.
const toolRows = () => {
  const plugin = new Set(pluginTools().map((tool) => tool.id));
  const art = new Map(['input', 'output'].flatMap((view) => toolCommands(view, project)).map((row) => [row.id, row]));
  const vector = toolCommands('vector', project).filter((row) => !art.has(row.id));
  return [...art.values()].map((row) => ({ ...row, group: plugin.has(row.id.slice(5)) ? 'pluginTools' : 'tools' }))
    .concat(vector.map((row) => ({ ...row, group: 'vector' })));
};

const groups = computed(() => {
  const rows = [...toolRows(), ...COMMANDS];
  return GROUPS.flatMap((group) => (group === 'vector' ? [group, 'pluginTools'] : [group])).filter((group) => group !== 'animation' || project.animate).map((group) => {
    const lines = new Map(); // by words, so rows with the same ones (the size keys, the two zooms) are a line
    for (const row of rows.filter((r) => r.group === group && !r.hidden)) {
      const does = row.label(), keys = shown(row);
      lines.set(does, [...(lines.get(does) ?? []), ...keys]);
    }
    return { title: group === 'pluginTools' ? t('shortcuts.pluginTools') : t(`shortcuts.groups.${group}`), rows: [...lines] };
  }).filter((group) => group.rows.length).map((group) => ({ ...group, rows: group.rows.map(([does, keys]) => [keys, does]) }));
});
</script>

<template>
  <ModalDialog :title="t('shortcuts.title')" closable full @cancel="emit('close')">
    <div class="groups">
      <section v-for="group in groups" :key="group.title">
        <h4>{{ group.title }}</h4>
        <dl>
          <template v-for="([keys, does]) in group.rows" :key="does">
            <dt><kbd v-for="key in keys" :key="key">{{ key }}</kbd></dt>
            <dd>{{ does }}</dd>
          </template>
        </dl>
      </section>
      <p v-if="isMac" class="note">{{ t('shortcuts.macFnNote') }}</p>
    </div>
    <div class="actions">
      <button class="primary" autofocus @click="emit('close')">{{ t('common.done') }}</button><!-- focus starts here, not on the × -->
    </div>
  </ModalDialog>
</template>

<style scoped>
div.groups {
  max-height: min(60vh, 520px);
  margin: 0 -18px;
  padding: 0 18px;
  overflow-y: auto;
}
@media (max-width: 700px) { /* the whole window: the list takes the room, Done the bottom */
  div.groups {
    flex: 1;
    min-height: 0;
    max-height: none;
  }
}

h4 {
  margin: 14px 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--accent-hot);
}

section:first-child h4 {
  margin-top: 4px;
}

/* One key column for every group, so the descriptions line up down the whole list. */
dl {
  display: grid;
  grid-template-columns: 11em 1fr;
  gap: 6px 14px;
  margin: 0;
  font-size: 13px;
}

dt {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  align-content: flex-start;
  gap: 4px;
  justify-content: flex-end;
}

dd {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.4;
}

kbd {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--surface-3);
  color: var(--text);
  font: 12px ui-monospace, Menlo, monospace;
  white-space: nowrap;
}

p.note {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

div.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

button.primary {
  min-width: 90px;
}
</style>
