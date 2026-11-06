<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ModalDialog from '@/components/ModalDialog.vue';
import { isMac, shortcut } from '@/lib/keyLabels';

// The keyboard shortcuts, opened with ? (Alt+? while typing in Edit Mode). Keys are written the
// platform's way (⌘ and ⌥ on a Mac). Keep it in step with useKeyboardShortcuts, useTextTool and
// TextKeys when a shortcut changes.
const emit = defineEmits(['close']);
const { t } = useI18n();
const k = shortcut;

const groups = computed(() => [
  {
    title: t('shortcuts.groups.general'),
    rows: [
      [['?'], t('shortcuts.rows.thisList', { key: k('alt', '?') })],
      [[k('mod', 'Z')], t('shortcuts.rows.undo')],
      [[k('shift', 'mod', 'Z')], t('shortcuts.rows.redo')],
      [[k('mod', 'S')], t('shortcuts.rows.saveProject')],
    ],
  },
  {
    title: t('shortcuts.groups.tools'),
    rows: [
      [['P'], t('shortcuts.rows.pencil')],
      [['B'], t('shortcuts.rows.brush')],
      [['E'], t('shortcuts.rows.eraser')],
      [['G'], t('shortcuts.rows.bucket')],
      [['U'], t('shortcuts.rows.shapes')],
      [['I'], t('shortcuts.rows.picker')],
      [['W'], t('shortcuts.rows.wand')],
      [['H'], t('shortcuts.rows.hand')],
      [['Z'], t('shortcuts.rows.zoom')],
      [['T', 'K'], t('shortcuts.rows.editMode')],
      [['F'], t('shortcuts.rows.flip')],
      [['M'], t('shortcuts.rows.select')],
    ],
  },
  {
    title: t('shortcuts.groups.drawing'),
    rows: [
      [[t('shortcuts.holdKey', { key: k('alt') })], t('shortcuts.rows.holdAlt')],
      [[t('shortcuts.holdKey', { key: k('alt', 'shift') })], t('shortcuts.rows.holdAltShift')],
      [[t('shortcuts.holdSpace')], t('shortcuts.rows.holdSpace')],
    ],
  },
  {
    title: t('shortcuts.groups.colors'),
    rows: [
      [[k('alt', 'F'), k('alt', 'A')], t('shortcuts.rows.openFg')],
      [[k('alt', 'B')], t('shortcuts.rows.openBg')],
      [['X', k('shift', 'mod', 'X')], t('shortcuts.rows.swapColors')],
      [['← ↑ → ↓'], t('shortcuts.rows.moveSwatches')],
      [['Enter', 'Space'], t('shortcuts.rows.pickSwatch')],
    ],
  },
  {
    title: t('shortcuts.groups.editMode'),
    rows: [
      [['← ↑ → ↓'], t('shortcuts.rows.moveCursor')],
      [[k('shift', '← ↑ → ↓')], t('shortcuts.rows.selectFromCursor')],
      [['Home', 'End'], t('shortcuts.rows.homeEnd')],
      [['Enter'], t('shortcuts.rows.nextLine')],
      [['Backspace', 'Delete'], t('shortcuts.rows.erase')],
      [['Insert'], t('shortcuts.rows.insertOverwrite')],
      [['F1–F12'], t('shortcuts.rows.typeFKey')],
      [[k('ctrl', 'F1–F12')], t('shortcuts.rows.grabFKey')],
      [[k('alt', '←'), k('alt', '→')], t('shortcuts.rows.prevNextPalette')],
      [[k('alt', '↑'), k('alt', '↓')], t('shortcuts.rows.stepFgPalette')],
    ],
  },
  {
    title: t('shortcuts.groups.select'),
    rows: [
      [[k('mod', 'A')], t('shortcuts.rows.selectAll')],
      [[k('mod', 'C'), k('mod', 'X'), k('mod', 'V')], t('shortcuts.rows.copyCutPaste')],
      [['← ↑ → ↓'], t('shortcuts.rows.nudge')],
      [[k('shift', '← ↑ → ↓')], t('shortcuts.rows.growShrink')],
      [['Delete', 'Backspace', 'E'], t('shortcuts.rows.deleteSelection')],
      [['S', 'C'], t('shortcuts.rows.stamp')],
      [['Esc', 'Enter'], t('shortcuts.rows.deselect')],
    ],
  },
  {
    title: t('shortcuts.groups.vector'),
    rows: [
      [['V'], t('shortcuts.rows.vselect')],
      [['A'], t('shortcuts.rows.vnode')],
      [['P'], t('shortcuts.rows.pen')],
      [['Enter', 'Esc'], t('shortcuts.rows.penEnd')],
      [['Backspace'], t('shortcuts.rows.penBack')],
      [['U'], t('shortcuts.rows.vshape')],
      [['← ↑ → ↓'], t('shortcuts.rows.vectorNudge')],
      [['Delete', 'Backspace'], t('shortcuts.rows.vectorDelete')],
      [['Esc'], t('shortcuts.rows.vectorEsc')],
    ],
  },
  {
    title: t('shortcuts.groups.animation'),
    rows: [
      [['L'], t('shortcuts.rows.playPause')],
      [[',', '.'], t('shortcuts.rows.prevNextFrame', { keys: `${k('alt', ',')} ${k('alt', '.')}` })],
      [['N'], t('shortcuts.rows.newFrame')],
    ],
  },
  {
    title: t('shortcuts.groups.tabs'),
    rows: [
      [['← →', 'Home', 'End'], t('shortcuts.rows.switchTabs')],
    ],
  },
]);
</script>

<template>
  <ModalDialog :title="t('shortcuts.title')" @cancel="emit('close')">
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
      <button class="primary" @click="emit('close')">{{ t('common.done') }}</button>
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
