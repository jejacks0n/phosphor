<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, useTemplateRef, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { usePaletteStore } from '@/store/PaletteStore';
import { UNICODE_BLOCKS, fitsGrid, parseFind } from '@/lib/charPalettes';
import { CP437, cp437Byte, isCp437 } from '@/lib/Cp437';
import { cellWidth } from '@/lib/CharWidth';
import { isField } from '@/lib/fields';
import { toast } from '@/composables/useToast';

// The character palette layer: one element in two sizes. Compact, it's the list of palettes (each
// shown as its 12 glyphs) for choosing one; Edit grows the same element into the editor, with the
// selected palette's slots and glyph sources. Built-ins are locked: the first edit makes your copy.
const emit = defineEmits(['close']);
const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();
const palettes = usePaletteStore();
const root = useTemplateRef('root');

const editing = ref(false);
const currentId = ref(palettes.active.id); // the highlighted row; the palette being edited
const target = ref(0);                     // the aimed slot
const filter = ref('');
const find = ref('');
const source = ref('cp437');
const block = ref(0);
const hint = ref({ text: '', warn: false });
const hoveredChar = ref(null);

const current = computed(() => palettes.all.find(p => p.id === currentId.value) ?? palettes.active);
const matches = (p) => {
  const f = filter.value.trim().toLowerCase();
  return !f || p.name.toLowerCase().includes(f) || p.glyphs.join('').includes(f);
};
const builtins = computed(() => palettes.all.filter(p => p.builtin && matches(p)));
const yours = computed(() => palettes.all.filter(p => !p.builtin && matches(p)));
const visible = computed(() => [...builtins.value, ...yours.value]);

// Whether a glyph can go in a cell: one or two columns wide, as a terminal lays it out.
const fits = fitsGrid;
const code = (char) => `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

// The glyphs the source pane shows, plus a note above them.
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i));
const findResult = computed(() => parseFind(find.value));
const visibleBlocks = computed(() => {
  const query = findResult.value?.kind === 'block' ? findResult.value.query.toLowerCase() : '';
  return UNICODE_BLOCKS.map((b, i) => ({ name: b[0], index: i })).filter(b => !query || b.name.toLowerCase().includes(query));
});
const pane = computed(() => {
  const found = findResult.value;
  if (found?.kind === 'code') return { note: t('palette.layer.notes.codePoint'), chars: found.chars };
  if (found?.kind === 'paste') return { note: t('palette.layer.notes.pasted'), chars: found.chars };
  if (found?.kind === 'block' || source.value === 'unicode') {
    const shown = visibleBlocks.value;
    const index = shown.some(b => b.index === block.value) ? block.value : shown[0]?.index ?? 0;
    return { blocks: shown, block: index, chars: range(UNICODE_BLOCKS[index][1], UNICODE_BLOCKS[index][2]) };
  }
  if (source.value === 'drawing') return { note: t('palette.layer.notes.inDrawing'), chars: [...new Set(project.cells.map(c => c.char))] };
  if (source.value === 'recent') return { note: t('palette.layer.notes.recent'), chars: palettes.recentChars };
  return { chars: [...CP437].map((c, i) => (i === 0 ? '' : c)) };
});
const sourceTab = computed(() => (findResult.value?.kind === 'block' ? 'unicode' : source.value));

const setHint = (text = '', warn = false) => { hint.value = { text, warn }; };
const aimHint = () => {
  const slot = target.value + 1;
  const next = target.value + 2;
  const text = target.value < 11
    ? t('palette.layer.aimingNext', { slot, next })
    : t('palette.layer.aimingLast', { slot });
  setHint(text);
};

// Every edit goes through the store; the first edit to a built-in edits your copy instead.
const followFork = ({ id, forked }) => {
  currentId.value = id;
  if (forked) toast(t('palette.forkedToast', { name: forked }));
};
const assign = (index, char, advance = true) => {
  if (char && !fits(char)) {
    setHint(t('palette.layer.unusableChar', { char }), true);
    return;
  }
  followFork(palettes.setSlot(current.value.id, index, char));
  if (char && advance) target.value = Math.min(11, index + 1);
  if (char && !isCp437(char)) setHint(t('palette.layer.notCp437Warning', { char }), true);
  else aimHint();
};
const pickGlyph = (char) => {
  if (!char) return;
  if (!editing.value) startEditing();
  assign(target.value, char);
};

const use = (id) => { palettes.activeId = id; };
const onRowClick = (p) => {
  currentId.value = p.id;
  if (editing.value) {
    target.value = 0;
    aimHint();
  } else {
    use(p.id);
  }
};
const startEditing = () => {
  editing.value = true;
  target.value = 0;
  aimHint();
};
const toggleEditing = () => (editing.value ? (editing.value = false) : startEditing());

const createPalette = () => {
  currentId.value = palettes.create();
  startEditing();
};
const duplicate = () => {
  const id = palettes.duplicate(current.value.id);
  if (id) currentId.value = id;
};
const remove = () => {
  palettes.remove(current.value.id);
  currentId.value = palettes.active.id;
};
const rename = (event) => {
  const name = event.target.textContent.trim();
  if (name) palettes.rename(current.value.id, name);
  else event.target.textContent = current.value.name;
};

// Drag a glyph onto a slot, or a slot onto another to swap them.
const dragOver = ref(-1);
const onDragStart = (event, payload) => event.dataTransfer.setData('text/plain', payload);
const onDrop = (event, index) => {
  dragOver.value = -1;
  const data = event.dataTransfer.getData('text/plain');
  // Dropping something onto where it already is changes nothing (and mustn't fork a built-in).
  if (data.startsWith('slot:')) {
    const from = Number(data.slice(5));
    if (from !== index) followFork(palettes.swapSlots(current.value.id, from, index));
  } else if (data.startsWith('glyph:') && current.value.glyphs[index] !== data.slice(6)) {
    assign(index, data.slice(6), false);
  }
};

const info = computed(() => {
  const char = hoveredChar.value;
  if (!char) return t('palette.layer.hoverDefault');
  const byte = cp437Byte(char);
  const slot = current.value.glyphs.indexOf(char);
  const parts = [
    `${char}  ${code(char)}`,
    byte !== null && isCp437(char) ? t('palette.layer.infoCp437', { byte }) : t('palette.layer.infoUtf8Only'),
  ];
  if (!fits(char)) parts.push(t('palette.layer.infoCantUse'));
  else if (cellWidth(char) === 2) parts.push(t('palette.layer.infoWide'));
  if (slot >= 0) parts.push(t('palette.layer.infoOnSlot', { slot: slot + 1 }));
  return parts.join(' · ');
});

const onGlyphHover = (char) => {
  if (char) hoveredChar.value = char;
};

const onKeyDown = (event) => {
  if (isField(event.target)) {
    if (event.key === 'Escape') event.target.blur();
    return;
  }
  const list = visible.value;
  const i = list.findIndex(p => p.id === currentId.value);
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const next = list[Math.max(0, Math.min(list.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (next) {
      currentId.value = next.id;
      if (!editing.value) use(next.id);
      nextTick(() => root.value?.querySelector('.row.current')?.scrollIntoView({ block: 'nearest' }));
    }
  } else if (event.key === 'Enter' && event.target === root.value) {
    use(currentId.value);
  } else if (event.key.toLowerCase() === 'e' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    toggleEditing();
  } else if (event.key === 'Backspace' && editing.value) {
    assign(target.value, '', false);
  } else if (event.key === 'Escape') {
    if (editing.value) editing.value = false;
    else emit('close');
  } else {
    return;
  }
  event.preventDefault();
};

const onPointerDown = (event) => {
  if (root.value && !root.value.contains(event.target) && !event.target.closest('[data-palette-toggle]')) emit('close');
};

// Leaving the editor unmounts whatever had focus in it: keep the keyboard on the layer.
watch(editing, (on) => {
  if (!on) nextTick(() => root.value?.focus());
});

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown, true);
  nextTick(() => root.value?.focus());
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown, true);
  workspace.paletteLayerOpen = false; // however it closes, the Text tool gets its keys back
});
</script>

<template>
  <div ref="root" class="palette-layer" :class="{ editing }" tabindex="0" role="dialog" :aria-label="t('palette.layer.dialogAria')" @keydown="onKeyDown">
    <!-- the list: choose a palette -->
    <div class="list-side">
      <div class="top">
        <input v-model="filter" :placeholder="t('palette.layer.filterPlaceholder')" :aria-label="t('palette.layer.filterAria')">
        <button @click="toggleEditing">{{ editing ? t('palette.layer.doneBtn') : t('palette.layer.editBtn') }}</button>
      </div>
      <div class="list">
        <div class="group">{{ t('common.builtIn') }}</div>
        <div
            v-for="p in builtins"
            :key="p.id"
            class="row"
            :class="{ current: p.id === currentId, active: p.id === palettes.active.id }"
            @click="onRowClick(p)"
            @dblclick="use(p.id); startEditing()"
        >
          <div class="name"><span>{{ p.name }}</span><em>{{ p.glyphs.every(g => !g || isCp437(g)) ? '' : t('palette.layer.utf8') }}</em></div>
          <div class="glyphs"><span v-for="(g, i) in p.glyphs" :key="i" class="glyph-cell" :class="{ empty: !g }">{{ g || '·' }}</span></div>
        </div>
        <div class="group">{{ t('common.yours') }}<button class="new" @click="createPalette">{{ t('palette.layer.newBtn') }}</button></div>
        <div
            v-for="p in yours"
            :key="p.id"
            class="row"
            :class="{ current: p.id === currentId, active: p.id === palettes.active.id }"
            @click="onRowClick(p)"
            @dblclick="use(p.id); startEditing()"
        >
          <div class="name"><span>{{ p.name }}</span></div>
          <div class="glyphs"><span v-for="(g, i) in p.glyphs" :key="i" class="glyph-cell" :class="{ empty: !g }">{{ g || '·' }}</span></div>
        </div>
      </div>
    </div>

    <!-- the editor: slots and glyph sources -->
    <div v-if="editing" class="edit-side">
      <div class="head">
        <span
            class="title"
            :contenteditable="!current.builtin"
            spellcheck="false"
            @blur="rename"
            @keydown.enter.prevent="$event.target.blur()"
        >{{ current.name }}</span>
        <span v-if="current.builtin" class="lock"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M192 288V192A128 128 0 0 1 448 192V288H384V192A64 64 0 0 0 256 192V288ZM176 288H464A48 48 0 0 1 512 336V528A48 48 0 0 1 464 576H176A48 48 0 0 1 128 528V336A48 48 0 0 1 176 288Z"/></svg>{{ t('palette.layer.lockedNote') }}</span>
        <span class="spacer"></span>
        <button class="ghost" @click="duplicate">{{ t('palette.layer.duplicateBtn') }}</button>
        <button v-if="!current.builtin" class="ghost icon" :title="t('palette.layer.deletePalette')" :aria-label="t('palette.layer.deletePalette')" @click="remove"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true"><path d="M135.2 17.7C140.6 6.8 151.7 0 163.8 0h120.4c12.1 0 23.2 6.8 28.6 17.7L320 32h96c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 96 0 81.7 0 64s14.3-32 32-32h96l7.2-14.3zM32 128h384v320c0 35.3-28.7 64-64 64H96c-35.3 0-64-28.7-64-64V128zm96 64c-8.8 0-16 7.2-16 16v224c0 8.8 7.2 16 16 16s16-7.2 16-16V208c0-8.8-7.2-16-16-16zm96 0c-8.8 0-16 7.2-16 16v224c0 8.8 7.2 16 16 16s16-7.2 16-16V208c0-8.8-7.2-16-16-16zm96 0c-8.8 0-16 7.2-16 16v224c0 8.8 7.2 16 16 16s16-7.2 16-16V208c0-8.8-7.2-16-16-16z"/></svg></button>
      </div>

      <div class="slots">
        <div
            v-for="(g, i) in current.glyphs"
            :key="i"
            class="slot"
            :class="{ target: i === target, over: i === dragOver }"
            role="button"
            tabindex="0"
            :aria-label="t('palette.layer.aimAtAria', { n: i + 1 })"
            :draggable="!!g"
            @click="target = i; aimHint()"
            @keydown.enter.space.prevent.stop="target = i; aimHint()"
            @dragstart="onDragStart($event, `slot:${i}`)"
            @dragover.prevent="dragOver = i"
            @dragleave="dragOver = -1"
            @drop.prevent="onDrop($event, i)"
        >
          <small>F{{ i + 1 }}</small>
          <span class="glyph-cell">{{ g || ' ' }}</span>
          <button v-if="g" class="clear" :title="t('common.clear')" :aria-label="t('palette.layer.clearSlotAria')" @click.stop="assign(i, '', false)">×</button>
          <span v-if="g && !isCp437(g)" class="badge">{{ t('palette.layer.utf8') }}</span>
        </div>
      </div>
      <div class="hint" :class="{ warn: hint.warn }">{{ hint.text }}</div>

      <div class="sources">
        <div class="tabs">
          <button :class="{ on: sourceTab === 'cp437' }" @click="source = 'cp437'; find = ''">{{ t('palette.layer.tabs.cp437') }}</button>
          <button :class="{ on: sourceTab === 'unicode' }" @click="source = 'unicode'; find = ''">{{ t('palette.layer.tabs.unicode') }}</button>
          <button :class="{ on: sourceTab === 'drawing' }" @click="source = 'drawing'; find = ''">{{ t('palette.layer.tabs.inDrawing') }}</button>
          <button :class="{ on: sourceTab === 'recent' }" @click="source = 'recent'; find = ''">{{ t('palette.layer.tabs.recent') }}</button>
          <input v-model="find" :placeholder="t('palette.layer.findPlaceholder')" :aria-label="t('palette.layer.findAria')">
        </div>
        <div class="pane">
          <div v-if="pane.note" class="note">{{ pane.note }}</div>
          <div v-if="pane.blocks" class="blocks">
            <button v-for="b in pane.blocks" :key="b.index" :class="{ on: b.index === pane.block }" @click="block = b.index">{{ b.name }}</button>
          </div>
          <div class="grid">
            <button
                v-for="(char, i) in pane.chars"
                :key="i + char"
                class="g"
                :class="{ inset: char && current.glyphs.includes(char), utf: char && !isCp437(char), bad: char && !fits(char) }"
                :disabled="!char || !fits(char)"
                :draggable="!!char && fits(char)"
                @mouseenter="onGlyphHover(char)"
                @dragstart="onDragStart($event, `glyph:${char}`)"
                @click="pickGlyph(char)"
            ><span class="glyph-cell">{{ char || ' ' }}</span></button>
          </div>
        </div>
        <div class="legend"><span class="l1">{{ t('palette.layer.legendInPalette') }}</span><span class="l2">{{ t('palette.layer.legendNotCp437') }}</span><span class="l3">{{ t('palette.layer.legendDoesntFit') }}</span></div>
        <div class="info">{{ info }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Opens from the toolbar's bottom right, inside its padding. */
div.palette-layer {
  position: absolute;
  top: calc(100% + 2px);
  right: 10px;
  z-index: 300;
  display: flex;
  width: 300px;
  max-width: calc(100% - 20px); /* never wider than the toolbar it opens from */
  max-height: min(560px, calc(100vh - 160px));
  background: var(--surface-1);
  border: 1px solid var(--accent);
  border-radius: 10px;
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.65);
  overflow: hidden;
  outline: none;
  transition: width 0.25s ease;
  font-size: 13px;
  color: var(--text);
}

div.palette-layer.editing {
  width: 940px;
}

/* While editing, the list is only as wide as a palette's row of glyphs (they never wrap; long
   names do), so the editor gets the rest. */
div.palette-layer.editing div.list-side {
  width: min-content;
}

div.palette-layer.editing div.row div.glyphs {
  overflow: visible;
}

/* Editing wants 940px and its full height; on small windows it takes the whole window instead
   (between, it fits the toolbar and the slots narrow). On phone widths the list sits above the editor. */
@media (max-width: 1000px), (max-height: 720px) {
  div.palette-layer.editing {
    position: fixed;
    inset: 0;
    z-index: 5000;
    width: auto;
    max-width: none;
    max-height: none;
    border: none;
    border-radius: 0;
    transition: none;
  }
}

@media (max-width: 700px) {
  div.palette-layer.editing {
    flex-direction: column;
  }

  div.palette-layer.editing div.list-side {
    width: auto;
    max-height: 35vh;
    border-right: none;
    border-bottom: 1px solid var(--surface-3);
  }

  div.palette-layer.editing div.edit-side {
    max-height: 65vh;
  }
}

div.list-side {
  display: flex;
  flex-direction: column;
  flex: 1 1 300px;
  min-width: 260px;
  border-right: 1px solid var(--surface-3);
}

div.top {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--surface-3);
}

div.top input {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 12px;
}

div.top button {
  padding: 5px 10px;
  border: none;
  border-radius: 4px;
  background: var(--surface-3);
  color: var(--text-dim);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

div.top button:hover {
  background: var(--accent);
  color: var(--white);
}

div.list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

div.group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px 2px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}

button.new {
  padding: 2px 6px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--accent);
  font: inherit;
  cursor: pointer;
}

button.new:hover {
  background: var(--surface-3);
}

div.row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 12px;
  cursor: pointer;
  border-left: 2px solid transparent;
}

div.row:hover {
  background: var(--surface-2);
}

div.row.current {
  background: var(--surface-2);
}

div.row.active {
  border-left-color: var(--accent);
}

div.name {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text);
}

div.name em {
  font-size: 9px;
  font-style: normal;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

div.glyphs {
  display: flex;
  gap: 2px;
  overflow: hidden;
}

div.edit-side {
  display: flex;
  flex-direction: column;
  flex: 2 1 600px;
  min-width: 0;
  padding: 12px 16px;
  gap: 10px;
}

div.head {
  display: flex;
  align-items: center;
  gap: 10px;
}

span.title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  padding: 2px 4px;
  border-radius: 4px;
  outline: none;
}

span.title[contenteditable="true"]:focus {
  background: var(--surface-2);
  box-shadow: 0 0 0 1px var(--accent);
}

span.lock {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-muted);
}

span.lock svg {
  width: 11px;
  height: 11px;
  fill: currentColor;
}

button.ghost {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

button.ghost:hover {
  background: var(--surface-3);
  color: var(--text);
}

button.ghost.icon svg {
  width: 13px;
  height: 13px;
  fill: currentColor;
  display: block;
}

div.slots {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 4px;
}

div.slot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 2px 2px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  cursor: pointer;
  user-select: none;
}

div.slot:hover {
  border-color: var(--text-muted);
}

div.slot.target {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

div.slot.over {
  border-color: var(--accent);
  background: var(--surface-3);
}

div.slot small {
  font-size: 8px;
  color: var(--text-muted);
  line-height: 1;
}

div.slot span.glyph-cell {
  font-size: 16px;
  line-height: 1.2;
}

button.clear {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  display: none;
}

div.slot:hover button.clear {
  display: block;
}

button.clear:hover {
  color: var(--text);
  background: var(--surface-4);
}

span.badge {
  position: absolute;
  bottom: 1px;
  right: 2px;
  font-size: 7px;
  color: var(--accent);
  line-height: 1;
}

div.hint {
  min-height: 16px;
  font-size: 11px;
  color: var(--text-muted);
}

div.hint.warn {
  color: var(--accent-hot);
}

div.sources {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 6px;
}

div.sources div.tabs {
  display: flex;
  align-items: center;
  gap: 4px;
}

div.sources div.tabs button {
  padding: 3px 8px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

div.sources div.tabs button.on {
  background: var(--surface-3);
  color: var(--text);
}

div.sources div.tabs input {
  margin-left: auto;
  width: 240px;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 11px;
}

div.pane {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 180px;
  max-height: 280px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--surface-3);
  border-radius: 4px;
  background: var(--surface-0);
  gap: 6px;
}

div.note {
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 4px;
}

div.blocks {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 2px;
}

div.blocks button {
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--surface-1);
  color: var(--text-dim);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

div.blocks button.on {
  background: var(--accent);
  color: var(--white);
  border-color: var(--accent);
}

div.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(28px, 1fr));
  gap: 2px;
}

button.g {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 3px;
  background: var(--surface-1);
  color: var(--text);
  cursor: pointer;
  position: relative;
}

button.g:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--surface-2);
}

button.g.inset {
  box-shadow: inset 0 0 0 1px var(--text-muted);
}

button.g.utf {
  border-bottom-color: var(--accent);
}

button.g.bad {
  opacity: 0.3;
  cursor: not-allowed;
  text-decoration: line-through;
}

button.g:disabled {
  opacity: 0.25;
  cursor: default;
}

div.legend {
  display: flex;
  gap: 12px;
  font-size: 10px;
  color: var(--text-muted);
}

div.legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

div.legend span.l1::before {
  content: '';
  width: 8px;
  height: 8px;
  border: 1px solid var(--text-muted);
}

div.legend span.l2::before {
  content: '';
  width: 8px;
  height: 2px;
  background: var(--accent);
}

div.legend span.l3::before {
  content: '—';
}

div.info {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-dim);
  min-height: 16px;
}

.spacer {
  flex: 1;
}
</style>
