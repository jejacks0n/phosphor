<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, useTemplateRef, nextTick } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { usePaletteStore } from '@/store/PaletteStore';
import { UNICODE_BLOCKS, fitsOneCell, parseFind } from '@/lib/charPalettes';
import { CP437, cp437Byte, isCp437 } from '@/lib/Cp437';
import { DISPLAY_FONT_CSS } from '@/lib/GlyphCoverage';
import { toast } from '@/composables/useToast';

// The character palette layer: one element in two sizes. Compact, it's the list of palettes (each
// shown as its 12 glyphs) for choosing one; Edit grows the same element into the editor, with the
// selected palette's slots and glyph sources. Built-ins are locked: the first edit makes your copy.
const emit = defineEmits(['close']);
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
const info = ref('Hover a glyph for details.');

const current = computed(() => palettes.all.find(p => p.id === currentId.value) ?? palettes.active);
const matches = (p) => {
  const f = filter.value.trim().toLowerCase();
  return !f || p.name.toLowerCase().includes(f) || p.glyphs.join('').includes(f);
};
const builtins = computed(() => palettes.all.filter(p => p.builtin && matches(p)));
const yours = computed(() => palettes.all.filter(p => !p.builtin && matches(p)));
const visible = computed(() => [...builtins.value, ...yours.value]);

// Whether a glyph fits one grid cell, measured in the display font (cached per character).
const measureCtx = document.createElement('canvas').getContext('2d');
measureCtx.font = DISPLAY_FONT_CSS;
const cellWidth = measureCtx.measureText('M').width;
const fitCache = new Map();
const fits = (char) => {
  if (!fitCache.has(char)) fitCache.set(char, fitsOneCell(char, (c) => measureCtx.measureText(c).width, cellWidth));
  return fitCache.get(char);
};
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
  if (found?.kind === 'code') return { note: 'Code point', chars: found.chars };
  if (found?.kind === 'paste') return { note: "From what you pasted: click to add. Anything struck through can't be used.", chars: found.chars };
  if (found?.kind === 'block' || source.value === 'unicode') {
    const shown = visibleBlocks.value;
    const index = shown.some(b => b.index === block.value) ? block.value : shown[0]?.index ?? 0;
    return { blocks: shown, block: index, chars: range(UNICODE_BLOCKS[index][1], UNICODE_BLOCKS[index][2]) };
  }
  if (source.value === 'drawing') return { note: 'Every character on the canvas right now', chars: [...new Set(project.cells.map(c => c.char))] };
  if (source.value === 'recent') return { note: "Characters you've used recently, across projects", chars: palettes.recentChars };
  return { chars: [...CP437].map((c, i) => (i === 0 ? '' : c)) };
});
const sourceTab = computed(() => (findResult.value?.kind === 'block' ? 'unicode' : source.value));

const setHint = (text = '', warn = false) => { hint.value = { text, warn }; };
const aimHint = () => setHint(`Aiming at F${target.value + 1}: click a glyph below to fill it${target.value < 11 ? ` (then F${target.value + 2})` : ''}, or drag one onto any slot.`);

// Every edit goes through the store; the first edit to a built-in edits your copy instead.
const followFork = ({ id, forked }) => {
  currentId.value = id;
  if (forked) toast(`Built-ins are locked, so you're now editing your copy, "${forked}".`);
};
const assign = (index, char, advance = true) => {
  if (char && !fits(char)) {
    setHint(`${char} doesn't fit one cell (it's double-width, invisible or missing from the font), so it can't go in a palette.`, true);
    return;
  }
  followFork(palettes.setSlot(current.value.id, index, char));
  if (char && advance) target.value = Math.min(11, index + 1);
  if (char && !isCp437(char)) setHint(`${char} isn't in CP437: it saves in .utf8ans, and .ans export will warn about it.`, true);
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

const onGlyphHover = (char) => {
  if (!char) return;
  const byte = cp437Byte(char);
  const slot = current.value.glyphs.indexOf(char);
  info.value = `${char}  ${code(char)} · ${byte !== null && isCp437(char) ? `CP437 ${byte}` : 'UTF-8 only'}${fits(char) ? '' : " · doesn't fit one cell"}${slot >= 0 ? ` · already on F${slot + 1}` : ''}`;
};

const editableTarget = (el) => el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName);
const onKeyDown = (event) => {
  if (editableTarget(event.target)) {
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
  <div ref="root" class="palette-layer" :class="{ editing }" tabindex="0" role="dialog" aria-label="Character palettes" @keydown="onKeyDown">
    <!-- the list: choose a palette -->
    <div class="list-side">
      <div class="top">
        <input v-model="filter" placeholder="Filter palettes…" aria-label="Filter palettes">
        <button @click="toggleEditing">{{ editing ? '◂ Done' : 'Edit ▸' }}</button>
      </div>
      <div class="list">
        <div class="group">Built-in</div>
        <div
            v-for="p in builtins"
            :key="p.id"
            class="row"
            :class="{ current: p.id === currentId, active: p.id === palettes.active.id }"
            @click="onRowClick(p)"
            @dblclick="use(p.id); startEditing()"
        >
          <div class="name"><span>{{ p.name }}</span><em>{{ p.glyphs.every(g => !g || isCp437(g)) ? '' : 'UTF-8' }}</em></div>
          <div class="glyphs"><span v-for="(g, i) in p.glyphs" :key="i" class="glyph-cell" :class="{ empty: !g }">{{ g || '·' }}</span></div>
        </div>
        <div class="group">Yours<button class="new" @click="createPalette">＋ New</button></div>
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
      <div class="foot">
        <kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> use · <kbd>E</kbd> edit · <kbd>Esc</kbd> close<br>
        On the canvas: <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> flips palettes.
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
        <span v-if="current.builtin" class="lock">🔒 built-in: editing makes your copy</span>
        <span class="spacer"></span>
        <button class="ghost" @click="duplicate">⧉ Duplicate</button>
        <button v-if="!current.builtin" class="ghost" title="Delete palette" aria-label="Delete palette" @click="remove">🗑</button>
      </div>

      <div class="slots">
        <div
            v-for="(g, i) in current.glyphs"
            :key="i"
            class="slot"
            :class="{ target: i === target, over: i === dragOver }"
            role="button"
            tabindex="0"
            :aria-label="`Aim at F${i + 1}`"
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
          <button v-if="g" class="clear" title="Clear" aria-label="Clear slot" @click.stop="assign(i, '', false)">×</button>
          <span v-if="g && !isCp437(g)" class="badge">UTF-8</span>
        </div>
      </div>
      <div class="hint" :class="{ warn: hint.warn }">{{ hint.text }}</div>

      <div class="sources">
        <div class="tabs">
          <button :class="{ on: sourceTab === 'cp437' }" @click="source = 'cp437'; find = ''">CP437</button>
          <button :class="{ on: sourceTab === 'unicode' }" @click="source = 'unicode'; find = ''">Unicode</button>
          <button :class="{ on: sourceTab === 'drawing' }" @click="source = 'drawing'; find = ''">In this drawing</button>
          <button :class="{ on: sourceTab === 'recent' }" @click="source = 'recent'; find = ''">Recent</button>
          <input v-model="find" placeholder="Paste characters, U+2605, or a block name" aria-label="Find or paste characters">
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
        <div class="legend"><span class="l1">already in this palette</span><span class="l2">not CP437 (.ans export warns)</span><span class="l3">doesn't fit one cell</span></div>
        <div class="info">{{ info }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
div.palette-layer {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 300;
  display: flex;
  width: 300px;
  max-width: 100%; /* the toolbar's width: never wider than the space it opens in */
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

div.list-side {
  width: 300px;
  flex: none;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--surface-3);
}

div.top {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--surface-3);
}

div.top input,
div.tabs input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--border-light);
  border-radius: 5px;
  background: var(--surface-0);
  color: var(--text);
  font-size: 12px;
}

button {
  padding: 4px 9px;
  border: none;
  border-radius: 4px;
  background: var(--surface-3);
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
}

button.ghost {
  background: transparent;
  color: var(--text-muted);
}

div.list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 6px 8px;
}

div.group {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 6px 4px;
  color: var(--text-muted);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

div.group button.new {
  padding: 0;
  background: none;
  color: var(--accent);
  font-size: 11px;
  text-transform: none;
  letter-spacing: 0;
}

div.row {
  padding: 5px 6px 6px;
  border-radius: 6px;
  cursor: pointer;
}

div.row:hover {
  background: var(--surface-2);
}

div.row.current {
  background: var(--surface-3);
}

div.row div.name {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-dim);
}

div.row div.name em {
  font-style: normal;
  font-size: 10px;
  color: var(--text-muted);
}

div.row.active div.name span::before {
  content: "●";
  margin-right: 5px;
  color: var(--accent);
  font-size: 9px;
  vertical-align: 1px;
}

div.row div.glyphs {
  display: flex;
  gap: 5px;
  margin-top: 1px;
  overflow: hidden;
}

div.row div.glyphs .empty {
  color: #555;
}

div.foot {
  padding: 7px 8px;
  border-top: 1px solid var(--surface-3);
  color: var(--text-muted);
  font-size: 10.5px;
  line-height: 1.6;
}

kbd {
  padding: 0 4px;
  border: 1px solid var(--border-light);
  border-bottom-width: 2px;
  border-radius: 3px;
  background: var(--surface-3);
  color: var(--text-dim);
  font: 10px ui-monospace, Menlo, monospace;
}

div.edit-side {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

div.head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 4px;
}

span.title {
  padding: 1px 3px;
  border-radius: 3px;
  font-weight: 600;
  font-size: 14px;
  outline: none;
}

span.title[contenteditable="true"]:hover,
span.title[contenteditable="true"]:focus {
  background: var(--surface-3);
}

span.lock {
  color: #e0b050;
  font-size: 11px;
}

.spacer {
  flex: 1;
}

div.slots {
  display: flex;
  gap: 5px;
  padding: 6px 12px 4px;
}

div.slot {
  position: relative;
  width: 46px;
  height: 58px;
  border: 2px solid transparent;
  border-radius: 6px;
  background: var(--surface-3);
  text-align: center;
  cursor: pointer;
}

div.slot small {
  display: block;
  padding-top: 4px;
  font-size: 9px;
  color: var(--text-muted);
}

div.slot .glyph-cell {
  margin-top: 6px;
}

div.slot.target {
  border-color: var(--accent);
  background: #2d2440;
}

div.slot.over {
  border-color: var(--accent-hot);
  border-style: dashed;
}

div.slot button.clear {
  position: absolute;
  top: 1px;
  right: 3px;
  display: none;
  padding: 0;
  background: none;
  color: var(--text-muted);
  font-size: 10px;
}

div.slot:hover button.clear {
  display: block;
}

div.slot span.badge {
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  padding: 0 3px;
  border-radius: 3px;
  background: #b8860b;
  color: var(--black);
  font-size: 8px;
  white-space: nowrap;
}

div.hint {
  min-height: 22px;
  padding: 4px 12px 8px;
  color: var(--text-muted);
  font-size: 11px;
}

div.hint.warn {
  color: #e0b050;
}

div.sources {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--surface-3);
}

div.tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 8px 12px 0;
}

div.tabs button {
  border-radius: 5px 5px 0 0;
  background: transparent;
  color: var(--text-muted);
}

div.tabs button.on {
  background: var(--surface-0);
  color: var(--text);
}

div.tabs input {
  margin-left: auto;
  flex: 0 1 230px;
}

div.pane {
  flex: 1;
  min-height: 0;
  margin: 0 12px;
  padding: 8px;
  overflow: auto;
  border-radius: 0 6px 6px 6px;
  background: var(--surface-0);
}

div.note {
  margin-bottom: 6px;
  color: var(--text-muted);
  font-size: 11px;
}

div.blocks {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

div.blocks button {
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 11px;
}

div.blocks button.on {
  background: var(--accent);
  color: var(--white);
}

div.grid {
  display: grid;
  grid-template-columns: repeat(16, 1fr);
  gap: 1px;
  border: 1px solid var(--surface-2);
  background: var(--surface-2);
}

button.g {
  position: relative;
  height: 24px;
  padding: 0;
  border-radius: 0;
  background: var(--surface-0);
  color: var(--text-dim);
}

button.g:hover:not(:disabled) {
  background: var(--accent);
  color: var(--white);
}

button.g.inset::after {
  content: "";
  position: absolute;
  top: 2px;
  right: 2px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}

button.g.utf::before {
  content: "";
  position: absolute;
  left: 2px;
  bottom: 2px;
  width: 4px;
  height: 4px;
  background: #b8860b;
}

button.g.bad {
  color: #444;
  cursor: not-allowed;
}

button.g.bad .glyph-cell {
  text-decoration: line-through;
}

div.legend {
  display: flex;
  gap: 14px;
  padding: 6px 12px 0;
  color: var(--text-muted);
  font-size: 11px;
}

div.legend span::before {
  content: "";
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 5px;
  vertical-align: 1px;
}

div.legend .l1::before {
  border-radius: 50%;
  background: var(--accent);
}

div.legend .l2::before {
  background: #b8860b;
}

div.legend .l3::before {
  background: #444;
}

div.info {
  min-height: 30px;
  padding: 6px 12px 10px;
  color: var(--text-muted);
  font: 11px ui-monospace, Menlo, monospace;
}
</style>
