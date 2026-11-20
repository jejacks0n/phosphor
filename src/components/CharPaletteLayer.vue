<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, useTemplateRef, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMediaQuery } from '@vueuse/core';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { usePaletteStore } from '@/store/PaletteStore';
import { UNICODE_BLOCKS, fitsGrid, parseFind } from '@/lib/charPalettes';
import { CP437, cp437Byte, isCp437 } from '@/lib/Cp437';
import { cellWidth } from '@/lib/CharWidth';
import { SLOT_CHARS, slotOf } from '@/lib/BitmapFont';
import { ownsKey } from '@/lib/fields';
import { toast } from '@/composables/useToast';
import { writePaletteFile, readPaletteFile, paletteFileName } from '@/lib/PaletteFile';
import { downloadBlob } from '@/document/projectIO';
import FontsPage from '@/components/FontsPage.vue';

// The character palette layer: one element in two sizes. Compact, it's the list of palettes (each
// shown as its 12 glyphs) for choosing one; Edit grows the same element into the editor, with the
// selected palette's slots and glyph sources. Built-ins are locked: the first edit makes your copy.
// The list puts the drawing's bitmap font's palettes first, then the built-ins, yours, and (folded)
// yours for fonts not loaded. Beside the Palettes page is the Fonts page (FontsPage), always the wide size.
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
const tieOpen = ref(false);         // the editor head's tie menu
const moreOpen = ref(false);        // the editor head's … menu: Duplicate and Export
const unloadedOpen = ref(false);    // the For fonts not loaded group, unfolded
const importer = useTemplateRef('importer');
const onFonts = computed(() => workspace.paletteLayerPage === 'fonts');
const fontsPage = useTemplateRef('fontsPage');

const current = computed(() => palettes.all.find(p => p.id === currentId.value) ?? palettes.active);
const matches = (p) => {
  const f = filter.value.trim().toLowerCase();
  return !f || p.name.toLowerCase().includes(f) || p.glyphs.join('').includes(f);
};
const font = computed(() => palettes.currentFont); // the drawing's bitmap font: its glyphs are the only ones a cell takes
const inUse = computed(() => palettes.fontInUse); // the font a palette can be tied to: that one, or the TrueType font in use
const isUnloaded = (p) => palettes.unloaded.some(u => u.id === p.id);
const groups = computed(() => [
  // a bitmap font's group always shows, to offer + New; another font's once a palette is tied to it
  (font.value || palettes.tied.length) && { key: 'tied', label: t('palette.layer.forFont', { name: inUse.value.name }), rows: palettes.tied.filter(matches) },
  { key: 'builtin', label: t('common.builtIn'), rows: palettes.builtinsHidden ? [] : palettes.builtins.filter(matches) },
  { key: 'yours', label: t('common.yours'), rows: palettes.general.filter(matches) },
  palettes.unloaded.length && { key: 'unloaded', label: t('palette.layer.unloaded', { n: palettes.unloaded.length }), rows: palettes.unloaded.filter(matches) },
].filter(Boolean));
// The rows on screen, in order (the folded group's only while it's open).
const visible = computed(() => groups.value.flatMap(g => (g.key === 'unloaded' && !unloadedOpen.value ? [] : g.rows)));

// Whether a glyph can go in a cell: one or two columns wide, as a terminal lays it out; with a drawing font, one it holds.
const fits = (char) => fitsGrid(char) && (!project.drawingFont || slotOf(char) !== null);
const code = (char) => `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

// The glyphs the source pane shows, plus a note above them.
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i));
const findResult = computed(() => parseFind(find.value));
const visibleBlocks = computed(() => {
  const query = findResult.value?.kind === 'block' ? findResult.value.query.toLowerCase() : '';
  return UNICODE_BLOCKS.map((b, i) => ({ name: b[0], index: i })).filter(b => !query || b.name.toLowerCase().includes(query));
});
// With a drawing font, only its glyphs: CP437 is its 256 slots (slot 0 too), the other panes what it holds of theirs.
const pane = computed(() => {
  const shown = allPane.value;
  if (!project.drawingFont) return shown;
  return { ...shown, chars: tab.value === 'cp437' && !findResult.value ? SLOT_CHARS : shown.chars.filter((c) => slotOf(c) !== null) };
});
// A font drawing has no Unicode tab: its font tab stands in for it (a block find still shows under it, filtered).
const tab = computed(() => (font.value && source.value === 'unicode' ? 'cp437' : source.value));
const allPane = computed(() => {
  const found = findResult.value;
  if (found?.kind === 'code') return { note: t('palette.layer.notes.codePoint'), chars: found.chars };
  if (found?.kind === 'paste') return { note: t('palette.layer.notes.pasted'), chars: found.chars };
  if (found?.kind === 'block' || tab.value === 'unicode') {
    const shown = visibleBlocks.value;
    const index = shown.some(b => b.index === block.value) ? block.value : shown[0]?.index ?? 0;
    return { blocks: shown, block: index, chars: range(UNICODE_BLOCKS[index][1], UNICODE_BLOCKS[index][2]) };
  }
  if (tab.value === 'drawing') return { note: t('palette.layer.notes.inDrawing'), chars: [...new Set(project.cells.map(c => c.char))] };
  if (tab.value === 'recent') return { note: t('palette.layer.notes.recent'), chars: palettes.recentChars };
  return { chars: [...CP437].map((c, i) => (i === 0 ? '' : c)) };
});
const sourceTab = computed(() => (findResult.value?.kind === 'block' && !font.value ? 'unicode' : tab.value));

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
  if (char && !isCp437(char) && !project.drawingFont) setHint(t('palette.layer.notCp437Warning', { char }), true);
  else aimHint();
};
const pickGlyph = (char) => {
  if (!char) return;
  if (!editing.value) startEditing();
  assign(target.value, char);
};

// Only a palette that shows can be the one in use; one for a font not loaded opens in the editor instead.
const use = (id) => {
  if (palettes.shown.some(p => p.id === id)) palettes.activeId = id;
};
const onRowClick = (p) => {
  currentId.value = p.id;
  if (!editing.value && isUnloaded(p)) {
    startEditing();
  } else if (editing.value) {
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

// + New under For <font> makes one tied to it; under Yours, one for any font.
const createPalette = (tied) => {
  const id = palettes.create();
  palettes.tie(id, tied ? inUse.value : null);
  currentId.value = id;
  startEditing();
};
const tie = (to) => {
  palettes.tie(current.value.id, to);
  tieOpen.value = false;
  keepKeys();
};

const exportPalettes = (list, name) => downloadBlob(new Blob([writePaletteFile(list)], { type: 'application/json' }), paletteFileName(name));
const exportYours = () => exportPalettes(palettes.all.filter(p => !p.builtin), t('common.yours'));
const onImport = async (event) => {
  const [file] = event.target.files;
  event.target.value = ''; // so the same file can be picked again
  if (!file) return;
  try {
    const list = readPaletteFile(await file.text(), file.name);
    const { added, waiting, unused } = palettes.importPalettes(list);
    // Palettes for a font not in use are said apart, each sentence counting those for its fonts.
    const says = (key, fonts) => {
      const n = list.filter(p => fonts.includes(p.font?.name)).length;
      return fonts.length ? [t(key, { n, fonts: fonts.join(', ') }, n)] : [];
    };
    const notes = [...says('palette.file.addedWaiting', waiting), ...says('palette.file.addedUnused', unused)];
    toast(notes.length ? notes.join(' ') : t('palette.file.added', { n: added }, added));
  } catch (error) {
    toast(error.message);
  }
};
const duplicate = () => {
  const id = palettes.duplicate(current.value.id);
  if (id) currentId.value = id;
};
// Hiding the built-ins moves the highlight off one of them, to the palette the strip now uses.
const hideBuiltins = (hidden) => {
  palettes.hideBuiltins(hidden);
  if (hidden && current.value.builtin) currentId.value = palettes.active.id;
  keepKeys();
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
  if (ownsKey(event.target, event)) {
    if (event.key === 'Escape') event.target.blur();
    return;
  }
  if (onFonts.value) { // the Fonts page: the arrow keys choose a font, Escape closes
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') fontsPage.value?.step(event.key === 'ArrowDown' ? 1 : -1);
    else if (event.key === 'Escape') emit('close');
    else return;
    event.preventDefault();
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
    if (tieOpen.value || moreOpen.value) tieOpen.value = moreOpen.value = false;
    else if (editing.value && !fromFonts.value) editing.value = false;
    else emit('close');
  } else {
    return;
  }
  event.preventDefault();
};

const onPointerDown = (event) => {
  if (tieOpen.value && !event.target.closest?.('.tie')) tieOpen.value = false;
  if (moreOpen.value && !event.target.closest?.('.more')) moreOpen.value = false;
  // a press outside closes it, but not its own toggle's, nor a resize edge's (the side panel's: the layer follows it)
  if (root.value && !root.value.contains(event.target) && !event.target.closest('[data-palette-toggle], [role="separator"]')) emit('close');
};

// Leaving the editor unmounts whatever had focus in it: keep the keyboard on the layer.
watch(editing, (on) => {
  if (!on) nextTick(() => root.value?.focus());
});
// The same for any button that goes away once pressed (a page's, the tie menu's, the Fonts page's actions).
const keepKeys = () => nextTick(() => {
  if (root.value && !root.value.contains(document.activeElement)) root.value.focus();
});
// From the wide Fonts page, the Palettes page opens in the editor, so the layer keeps its width; Escape there closes
// the layer, as it does on Fonts, rather than shrinking it to the list.
const fromFonts = ref(false);
watch(() => workspace.paletteLayerPage, (page, was) => {
  if (page === 'palettes' && was === 'fonts') {
    startEditing();
    fromFonts.value = true;
  }
  keepKeys();
});
watch(editing, (on) => { if (!on) fromFonts.value = false; });

// Going full window (on a small one, the media query below) grows out of where the layer floated, the page revealed by
// a clip from that box; coming back, the floating layer fades in. (A wide window only widens it, by its transition.)
const wide = computed(() => editing.value || onFonts.value);
// Wide on a small window, the layer is the whole window (the media query below), with nothing outside to press: it
// has a close button then.
const smallWindow = useMediaQuery('(max-width: 1000px), (max-height: 520px)');
const fullWindow = computed(() => wide.value && smallWindow.value);
watch(wide, () => {
  const el = root.value;
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const from = el.getBoundingClientRect(), wasFull = getComputedStyle(el).position === 'fixed';
  nextTick(() => {
    const full = getComputedStyle(el).position === 'fixed', options = { duration: 250, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' };
    if (full && !wasFull) {
      const to = el.getBoundingClientRect(), px = (n) => `${Math.max(0, n)}px`;
      const box = `${px(from.top - to.top)} ${px(to.right - from.right)} ${px(to.bottom - from.bottom)} ${px(from.left - to.left)}`;
      el.animate([{ clipPath: `inset(${box} round 10px)` }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }], options);
    } else if (wasFull && !full) {
      el.animate([{ opacity: 0, transform: 'scale(0.98)' }, { opacity: 1, transform: 'none' }], { ...options, duration: 150 });
    }
  });
});
watch([currentId, editing], () => { tieOpen.value = moreOpen.value = false; });

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
  <div ref="root" class="palette-layer" :class="{ editing: editing || onFonts }" tabindex="0" role="dialog" :aria-label="t('palette.layer.dialogAria')" @keydown="onKeyDown">
    <div class="pages">
      <div class="tablist" role="tablist" :aria-label="t('palette.pages.aria')">
        <button role="tab" :class="{ on: !onFonts }" :aria-selected="!onFonts" @click="workspace.paletteLayerPage = 'palettes'">{{ t('palette.pages.palettes') }}</button>
        <button role="tab" :class="{ on: onFonts }" :aria-selected="onFonts" @click="workspace.paletteLayerPage = 'fonts'">{{ t('palette.pages.fonts') }}</button>
      </div>
      <button v-if="fullWindow" class="dismiss" :title="t('common.close')" :aria-label="t('common.close')" @click="emit('close')">×</button>
    </div>
    <FontsPage v-if="onFonts" ref="fontsPage" @acted="keepKeys"/>
    <!-- the Palettes page -->
    <div v-else class="page">
      <!-- the list: choose a palette -->
      <div class="list-side">
        <div class="top">
          <input v-model="filter" :placeholder="t('palette.layer.filterPlaceholder')" :aria-label="t('palette.layer.filterAria')">
          <button @click="toggleEditing">{{ editing ? t('palette.layer.doneBtn') : t('palette.layer.editBtn') }}</button>
        </div>
        <div class="list">
          <template v-for="g in groups" :key="g.key">
            <div class="group">
              <button v-if="g.key === 'unloaded'" class="label fold" :aria-expanded="unloadedOpen" @click="unloadedOpen = !unloadedOpen">{{ g.label }}</button>
              <span v-else class="label">{{ g.label }}</span>
              <span v-if="g.key === 'builtin' && font" class="actions">
                <button class="new" :title="t(palettes.builtinsHidden ? 'palette.layer.showBuiltinsTitle' : 'palette.layer.hideBuiltinsTitle', { name: font.name })" @click="hideBuiltins(!palettes.builtinsHidden)">{{ palettes.builtinsHidden ? t('palette.layer.showBuiltins') : t('palette.layer.hideBuiltins') }}</button>
              </span>
              <span v-if="g.key === 'tied' || g.key === 'yours'" class="actions">
                <template v-if="g.key === 'yours'">
                  <button class="new" @click="importer.click()">{{ t('palette.layer.import') }}</button>
                  <button class="new" :disabled="!palettes.all.some(p => !p.builtin)" @click="exportYours">{{ t('palette.layer.export') }}</button>
                </template>
                <button class="new" @click="createPalette(g.key === 'tied')">{{ t('palette.layer.newBtn') }}</button>
              </span>
            </div>
            <template v-if="g.key !== 'unloaded' || unloadedOpen">
              <div
                  v-for="p in g.rows"
                  :key="p.id"
                  class="row"
                  :class="{ current: p.id === currentId, active: p.id === palettes.active.id }"
                  @click="onRowClick(p)"
                  @dblclick="use(p.id); startEditing()"
              >
                <div class="name"><span>{{ g.key === 'unloaded' ? `${p.name} · ${p.font.name}` : p.name }}</span><em v-if="p.builtin">{{ p.glyphs.every(c => !c || isCp437(c)) ? '' : t('palette.layer.utf8') }}</em></div>
                <div class="glyphs"><span v-for="(c, i) in p.glyphs" :key="i" class="glyph-cell" :class="{ empty: !c }">{{ c || '·' }}</span></div>
              </div>
            </template>
          </template>
        </div>
        <input ref="importer" type="file" accept=".json,application/json" hidden @change="onImport">
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
          <span v-if="!current.builtin" class="tie">
            <button class="ghost" :aria-expanded="tieOpen" @click="tieOpen = !tieOpen">{{ current.font ? t('palette.layer.forFont', { name: current.font.name }) : t('palette.layer.anyFont') }} ▾</button>
            <span v-if="tieOpen" class="menu">
              <button v-if="current.font" @click="tie(null)">{{ t('palette.layer.untie') }}</button>
              <button v-if="current.font?.id !== inUse.id" @click="tie(inUse)">{{ t('palette.layer.tieTo', { name: inUse.name }) }}</button>
            </span>
          </span>
          <span class="spacer"></span>
          <span class="more">
            <button class="ghost" :title="t('palette.layer.moreAria')" :aria-label="t('palette.layer.moreAria')" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen">…</button>
            <span v-if="moreOpen" class="menu">
              <button @click="moreOpen = false; duplicate(); keepKeys()">{{ t('palette.layer.duplicateBtn') }}</button>
              <button @click="moreOpen = false; exportPalettes([current], current.name); keepKeys()">{{ t('palette.layer.export') }}</button>
              <button v-if="!current.builtin" @click="moreOpen = false; remove(); keepKeys()">{{ t('palette.layer.deletePalette') }}</button>
            </span>
          </span>
        </div>

        <div class="slots">
          <div
              v-for="(g, i) in current.glyphs"
              :key="i"
              class="slot"
              :class="{ target: i === target, over: i === dragOver, bad: g && !fits(g) }"
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
            <button :class="{ on: sourceTab === 'cp437' }" @click="source = 'cp437'; find = ''">{{ font ? t('palette.layer.fontTab', { name: font.name }) : t('palette.layer.tabs.cp437') }}</button>
            <button v-if="!font" :class="{ on: sourceTab === 'unicode' }" @click="source = 'unicode'; find = ''">{{ t('palette.layer.tabs.unicode') }}</button>
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
                  :class="{ inset: char && current.glyphs.includes(char), utf: char && !isCp437(char) && !project.drawingFont, bad: char && !fits(char) }"
                  :disabled="!char || !fits(char)"
                  :draggable="!!char && fits(char)"
                  @mouseenter="onGlyphHover(char)"
                  @dragstart="onDragStart($event, `glyph:${char}`)"
                  @click="pickGlyph(char)"
              ><span class="glyph-cell">{{ char || ' ' }}</span></button>
            </div>
          </div>
          <div class="legend"><span class="l1">{{ t('palette.layer.legendInPalette') }}</span><span v-if="!font" class="l2">{{ t('palette.layer.legendNotCp437') }}</span><span class="l3">{{ t('palette.layer.legendDoesntFit') }}</span></div>
          <div class="info">{{ info }}</div>
        </div>
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
  flex-direction: column;
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

/* The Palettes | Fonts tabs over the page, as the side panel's, and, taking the whole window, a plain × at the row's
   right end. */
div.pages {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  height: 38px;
  padding: 0 6px;
  border-bottom: 1px solid var(--border);
}

div.tablist {
  position: relative;
  display: flex;
  flex: 1;
}

div.pages button[role='tab'] {
  padding: 4px 12px 0; /* as the side panel's: the label a little low in the row */
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 0.3s ease;
}

div.pages button[role='tab']:not(.on):hover {
  color: var(--accent);
}

div.pages button[role='tab']:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

div.pages button[role='tab'].on {
  font-weight: 600;
  color: var(--text);
  box-shadow: inset 0 -2px var(--accent);
}

div.pages button.dismiss {
  align-self: center;
  flex: none;
  padding: 4px 8px;
  border: none;
  box-shadow: none;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 20px;
  line-height: 1;
}

div.pages button.dismiss:hover {
  color: var(--text);
}

/* The rules below that the Fonts page shares reach into it (:deep). */
div.page {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

/* While editing (and on the Fonts page), the list is a narrow column, a little wider than a palette's row of glyphs
   (they never wrap; long names do), so the editor gets the rest. */
div.palette-layer.editing :deep(div.list-side) {
  flex: 0 0 220px;
  min-width: 0;
}

div.palette-layer.editing div.row div.glyphs {
  overflow: visible;
}

/* Editing wants 940px and up to 560px tall; a shorter window shrinks it (the glyph pane gives way first) until it
   can't fit, and a small window it takes whole instead (between, it fits the toolbar and the slots narrow). On phone
   widths the list sits above the editor. (smallWindow, for the close button, asks the same.) */
@media (max-width: 1000px), (max-height: 520px) {
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
  div.palette-layer.editing div.page {
    flex-direction: column;
  }

  div.palette-layer.editing :deep(div.list-side) {
    flex: 1 1 300px;
    width: auto;
    max-height: 35vh;
    border-right: none;
    border-bottom: 1px solid var(--surface-3);
  }

  div.palette-layer.editing :deep(div.edit-side) {
    max-height: 65vh;
  }
}

:deep(div.list-side) {
  display: flex;
  flex-direction: column;
  flex: 1 1 300px;
  min-width: 260px;
  border-right: 1px solid var(--surface-3);
}

:deep(div.top) {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--surface-3);
}

:deep(div.top input) {
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

:deep(div.top button) {
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

:deep(div.top button:hover) {
  background: var(--accent);
  color: var(--white);
}

:deep(div.list) {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

:deep(div.group) {
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

button.new:hover:not(:disabled) {
  background: var(--surface-3);
}

button.new:disabled {
  opacity: 0.4;
  cursor: default;
}

button.fold {
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
}

button.fold::before {
  content: '▸ ';
}

button.fold[aria-expanded="true"]::before {
  content: '▾ ';
}

/* The editor head's tie and … menu: each button opens a small menu under it. */
span.tie,
span.more {
  position: relative;
}

span.tie span.menu,
span.more span.menu {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  padding: 4px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
}

/* The … menu sits at the head's right end, so it opens leftward. */
span.more span.menu {
  left: auto;
  right: 0;
}

span.tie span.menu button,
span.more span.menu button {
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

span.tie span.menu button:hover,
span.more span.menu button:hover {
  background: var(--accent);
  color: var(--white);
}

:deep(div.row) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 12px;
  cursor: pointer;
  border-left: 2px solid transparent;
}

:deep(div.row:hover) {
  background: var(--surface-2);
}

:deep(div.row.current) {
  background: var(--surface-2);
}

:deep(div.row.active) {
  border-left-color: var(--accent);
}

:deep(div.name) {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text);
}

:deep(div.name em) {
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

:deep(div.edit-side) {
  display: flex;
  flex-direction: column;
  flex: 2 1 600px;
  min-width: 0;
  padding: 12px 16px;
  gap: 10px;
}

:deep(div.head) {
  display: flex;
  align-items: center;
  gap: 10px;
}

:deep(span.title) {
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

:deep(button.ghost) {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

:deep(button.ghost:hover) {
  background: var(--surface-3);
  color: var(--text);
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

/* A slot holding what the drawing's font lacks (kept, marked as the sources mark it). */
div.slot.bad span.glyph-cell {
  opacity: 0.4;
  text-decoration: line-through;
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
  min-height: 96px;
  max-height: 280px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--surface-3);
  border-radius: 4px;
  background: var(--surface-0);
  gap: 6px;
}

:deep(div.note) {
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

:deep(div.grid) {
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

:deep(div.info) {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-dim);
  min-height: 16px;
}

:deep(.spacer) {
  flex: 1;
}
</style>
