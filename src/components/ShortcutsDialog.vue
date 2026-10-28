<script setup>
import ModalDialog from '@/components/ModalDialog.vue';
import { isMac, shortcut } from '@/lib/keyLabels';

// The keyboard shortcuts, opened with ? (Alt+? while typing in Edit Mode). Keys are written the
// platform's way (⌘ and ⌥ on a Mac). Keep it in step with useKeyboardShortcuts, useTextTool and
// TextKeys when a shortcut changes.
const emit = defineEmits(['close']);
const k = shortcut;

const GROUPS = [
  {
    title: 'General',
    rows: [
      [['?'], `This list (${k('alt', '?')} in Edit Mode)`],
      [[k('mod', 'Z')], 'Undo'],
      [[k('shift', 'mod', 'Z')], 'Redo'],
      [[k('mod', 'S')], 'Save the project'],
    ],
  },
  {
    title: 'Tools',
    rows: [
      [['P'], 'Pencil'],
      [['B'], 'Brush'],
      [['E'], 'Eraser (with Select and a selection: erase it)'],
      [['G'], 'Paint Bucket'],
      [['U'], 'Shapes'],
      [['I'], 'Color Picker'],
      [['W'], 'Magic Wand: select by color or character'],
      [['H'], 'Hand'],
      [['Z'], 'Zoom'],
      [['T', 'K'], 'Edit Mode (Esc puts the cursor away, so letters choose tools again)'],
      [['F'], 'Flip (ANSI view)'],
      [['M'], 'Select (ANSI view)'],
    ],
  },
  {
    title: 'Drawing',
    rows: [
      [[`hold ${k('alt')}`], 'Pick a color (Pencil, Brush, Paint Bucket, Shapes)'],
      [[`hold ${k('alt', 'shift')}`], 'Pick the background color'],
      [['hold Space'], 'Pan, with any tool (or drag with the middle button)'],
    ],
  },
  {
    title: 'Colors',
    rows: [
      [[k('alt', 'F'), k('alt', 'A')], 'Open the color box on the foreground'],
      [[k('alt', 'B')], 'Open it on the background'],
      [['X', k('shift', 'mod', 'X')], 'Swap foreground and background (X types in Edit Mode)'],
      [['← ↑ → ↓'], 'In the color box: move between swatches'],
      [['Enter', 'Space'], 'In the color box: pick and close, or pick and stay'],
    ],
  },
  {
    title: 'Edit Mode',
    rows: [
      [['← ↑ → ↓'], 'Move the cursor'],
      [['Home', 'End'], 'Start or end of the row'],
      [['Enter'], 'Start of the next line'],
      [['Backspace', 'Delete'], 'Erase before or at the cursor'],
      [['Insert'], 'Insert or overwrite'],
      [['F1–F12'], 'Type the character palette\'s slot'],
      [[k('ctrl', 'F1–F12')], 'Put the character under the cursor on that slot'],
      [[k('alt', '←'), k('alt', '→')], 'Previous or next character palette'],
      [[k('alt', '↑'), k('alt', '↓')], 'Step the foreground through the palette (add Shift for the background)'],
    ],
  },
  {
    title: 'Select',
    rows: [
      [[k('mod', 'A')], 'Select all'],
      [[k('mod', 'C'), k('mod', 'X'), k('mod', 'V')], 'Copy, cut, paste'],
      [['← ↑ → ↓'], 'Nudge the selection'],
      [['Delete', 'Backspace', 'E'], 'Delete what\'s selected'],
      [['S', 'C'], 'Stamp: leave a copy here and move the block on'],
      [['Esc', 'Enter'], 'Deselect, setting the block down'],
    ],
  },
  {
    title: 'Editor tabs',
    rows: [
      [['← →', 'Home', 'End'], 'With a tab focused: switch tabs'],
    ],
  },
];
</script>

<template>
  <ModalDialog title="Keyboard shortcuts" @cancel="emit('close')">
    <div class="groups">
      <section v-for="group in GROUPS" :key="group.title">
        <h4>{{ group.title }}</h4>
        <dl>
          <template v-for="([keys, does]) in group.rows" :key="does">
            <dt><kbd v-for="key in keys" :key="key">{{ key }}</kbd></dt>
            <dd>{{ does }}</dd>
          </template>
        </dl>
      </section>
      <p v-if="isMac" class="note">On a Mac keyboard, the F-keys may need Fn.</p>
    </div>
    <div class="actions">
      <button class="primary" @click="emit('close')">Done</button>
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
