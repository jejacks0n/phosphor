<script setup>
import { ref, computed, watch, useTemplateRef, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { usePaletteStore } from '@/store/PaletteStore';
import { useFontActions, FONT_FILES } from '@/composables/useFontActions';
import { storedBitmapFont, registerBitmapFont, familyOf } from '@/lib/userFonts';
import { fontId, SLOT_CHARS } from '@/lib/BitmapFont';
import { writePaletteFile, paletteFileName } from '@/lib/PaletteFile';
import { downloadBlob } from '@/document/projectIO';

// The palette layer's Fonts page: the drawing's bitmap font and yours on the left, each sampled in its own glyphs;
// on the right the chosen one with its actions and its 256 slots (a TrueType font has a sample instead). Choosing a
// font here only shows it: Use in this drawing and View in it apply it, as the Font field's dropdown does.
const emit = defineEmits(['acted']);
const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();
const palettes = usePaletteStore();
const { loadFile, choose, saveRaw, savePng, remove, hostsFont } = useFontActions();
const fileInput = useTemplateRef('file');
const page = useTemplateRef('page');

const SAMPLE = 'Aa░▒▓█▄▀╔═╗☺';
const lines = computed(() => [
  t('palette.fonts.pangram'),
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789',
  '!@#$%^&*()[]{}<>/\\|~ ░▒▓█▄▀▌▐',
  '╔═╦═╗ ┌─┬─┐ ☺☻♥♦♣♠ ←↑→↓',
  'αßΓπΣσµτΦΘΩδ∞φε≡±≥≤',
]);

const filter = ref('');
const chosenId = ref(null);
const hovered = ref(null); // the slot under the pointer
const problem = ref('');

const drawn = computed(() => project.drawingFont);
const drawnId = computed(() => drawn.value && fontId(drawn.value));
const stored = computed(() => workspace.userFonts ?? []);
// The drawing's font (listed once, though it may be kept in this browser too), then yours.
const all = computed(() => [
  ...(drawn.value ? [{ id: drawnId.value, name: drawn.value.name, kind: 'bitmap', height: drawn.value.height }] : []),
  ...stored.value.filter((f) => f.id !== drawnId.value),
]);
const groups = computed(() => {
  const query = filter.value.trim().toLowerCase(), shown = all.value.filter((f) => f.name.toLowerCase().includes(query));
  return [
    { key: 'drawing', label: project.image ? t('palette.fonts.thisDrawing') : t('palette.fonts.nextDrawing'), rows: shown.filter((f) => f.id === drawnId.value) },
    { key: 'yours', label: t('common.yours'), rows: shown.filter((f) => f.id !== drawnId.value) },
  ].filter((g) => g.rows.length);
});
// The chosen font; once it's gone (removed), the drawing's, else the first.
const chosen = computed(() => all.value.find((f) => f.id === chosenId.value) ?? all.value[0] ?? null);
const bitmap = computed(() => chosen.value?.kind === 'bitmap');
const isDrawn = computed(() => chosen.value?.id === drawnId.value);
const isStored = computed(() => stored.value.some((f) => f.id === chosen.value?.id));
const count = computed(() => (bitmap.value ? palettes.countFor(chosen.value.id) : 0));

const size = (f) => (f.kind === 'bitmap' ? `8×${f.height}` : t('palette.fonts.trueType'));
// Drawn at its own height, or twice that when it's too small to read.
const styleOf = (f) => ({ fontFamily: familyOf(f.id), fontSize: `${f.kind === 'bitmap' && f.height < 12 ? 2 * f.height : f.height ?? 16}px` });
const meta = computed(() => [
  size(chosen.value),
  isDrawn.value ? t(project.image ? 'palette.fonts.drawingsFont' : 'palette.fonts.nextDrawingsFont') : t('palette.fonts.inBrowser'),
  bitmap.value && t('palette.fonts.palettes', { n: count.value }, count.value),
].filter(Boolean).join(' · '));

// A listed bitmap font as a drawing holds one: { name, height, bytes }.
const bitmapOf = (f) => (f.id === drawnId.value ? drawn.value : storedBitmapFont(f.id));

// Every listed bitmap font registered with the page, so its sample and sheet draw in its own glyphs. (TrueType fonts
// are registered as they're loaded.)
watch(() => all.value.filter((f) => f.kind === 'bitmap').map((f) => f.id).join(' '), async () => {
  for (const f of all.value.filter((font) => font.kind === 'bitmap')) {
    try {
      await registerBitmapFont(await bitmapOf(f));
    } catch {
      // it draws in the fallback font
    }
  }
}, { immediate: true });

// An action, with what went wrong said under the list. acted: done (its button may be gone).
const run = async (action) => {
  problem.value = '';
  try {
    await action();
  } catch (error) {
    problem.value = error.message;
  }
  emit('acted');
};

const onFile = (event) => {
  const [file] = event.target.files;
  event.target.value = ''; // so the same file can be picked again
  if (file) run(async () => { chosenId.value = (await loadFile(file)).id; });
};
const apply = () => run(() => choose(chosen.value.id));
// The drawing's font saves at once; one only in this browser is read from it first.
const save = (as) => run(async () => as(isDrawn.value ? drawn.value : await storedBitmapFont(chosen.value.id)));
const forget = () => run(() => remove(chosen.value.id));
// The next or previous font on screen, in the list's order (the layer passes its arrow keys here).
const step = (delta) => {
  const rows = groups.value.flatMap((g) => g.rows), i = rows.findIndex((f) => f.id === chosen.value?.id);
  const next = rows[Math.max(0, Math.min(rows.length - 1, i + delta))];
  if (!next) return;
  chosenId.value = next.id;
  nextTick(() => page.value?.querySelector('.row.current')?.scrollIntoView({ block: 'nearest' }));
};
defineExpose({ step });

const exportPalettes = () => {
  const list = palettes.all.filter((p) => p.font?.id === chosen.value.id);
  downloadBlob(new Blob([writePaletteFile(list)], { type: 'application/json' }), paletteFileName(chosen.value.name));
};
</script>

<template>
  <div ref="page" class="page">
    <!-- the list: choose a font to see it (or with the arrow keys) -->
    <div class="list-side">
      <div class="top">
        <input v-model="filter" :placeholder="t('palette.fonts.filterPlaceholder')" :aria-label="t('palette.fonts.filterAria')">
        <button :title="t('palette.fonts.loadTitle')" @click="fileInput.click()">{{ t('palette.fonts.load') }}</button>
        <input ref="file" type="file" :accept="FONT_FILES" hidden @change="onFile">
      </div>
      <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
      <div class="list">
        <template v-for="g in groups" :key="g.key">
          <div class="group"><span class="label">{{ g.label }}</span></div>
          <div
              v-for="f in g.rows"
              :key="f.id"
              class="row"
              :class="{ current: f.id === chosen?.id, active: f.id === workspace.displayFontSpec.id }"
              @click="chosenId = f.id"
          >
            <div class="name"><span>{{ f.name }}</span><em>{{ size(f) }}</em></div>
            <div class="sample" :style="styleOf(f)">{{ SAMPLE }}</div>
          </div>
        </template>
      </div>
    </div>

    <!-- the chosen font -->
    <div v-if="chosen" class="edit-side">
      <div class="head">
        <span class="title">{{ chosen.name }}</span>
        <span class="meta">{{ meta }}</span>
      </div>
      <div class="actions">
        <button v-if="bitmap && !isDrawn" class="ghost" :disabled="hostsFont" @click="apply">{{ t(project.image ? 'palette.fonts.use' : 'palette.fonts.useNext') }}</button>
        <button v-if="!bitmap" class="ghost" :disabled="hostsFont" @click="apply">{{ t('palette.fonts.view') }}</button>
        <template v-if="bitmap">
          <button class="ghost" @click="save(saveRaw)">{{ t('palette.fonts.saveRaw', { height: String(chosen.height).padStart(2, '0') }) }}</button>
          <button class="ghost" @click="save(savePng)">{{ t('palette.fonts.savePng') }}</button>
          <button class="ghost" :disabled="!count" @click="exportPalettes">{{ t('palette.fonts.exportPalettes') }}</button>
          <button v-if="isDrawn" class="ghost" @click="workspace.paletteLayerPage = 'palettes'">{{ t('palette.fonts.toPalettes') }}</button>
        </template>
        <button v-if="isStored" class="ghost" :title="t('palette.fonts.removeTitle')" @click="forget">{{ t('palette.fonts.remove') }}</button>
      </div>
      <template v-if="bitmap">
        <div class="note">{{ t('palette.fonts.sheetNote') }}</div>
        <div class="grid sheet" :style="styleOf(chosen)" @mouseleave="hovered = null">
          <span v-for="(c, i) in SLOT_CHARS" :key="i" class="cell" @mouseenter="hovered = i">{{ i === 0 ? ' ' : c }}</span>
        </div>
        <div class="info">{{ hovered === null ? t('palette.fonts.slotHint') : t('palette.fonts.slot', { n: hovered, char: SLOT_CHARS[hovered] }) }}</div>
      </template>
      <template v-else>
        <div class="note">{{ t('palette.fonts.trueTypeNote') }}</div>
        <div class="sample-text" :style="{ fontFamily: familyOf(chosen.id) }">
          <div v-for="(line, i) in lines" :key="i">{{ line }}</div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* The layer's list, row, head and grid styles are CharPaletteLayer's; these are the page's own. */
div.sample {
  overflow: hidden;
  white-space: nowrap;
  line-height: 1;
  color: var(--text);
}

span.meta {
  font-size: 12px;
  color: var(--text-muted);
}

div.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-left: -8px; /* the first button's text lines up with the title */
}

button.ghost:disabled {
  opacity: 0.4;
  cursor: default;
  pointer-events: none;
}

p.problem {
  margin: 0;
  padding: 6px 12px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--danger);
}

/* The 256 slots, 16 to a row as the font's sheet lays them out, framed as the Palettes page's glyph pane. */
div.grid.sheet {
  grid-template-columns: repeat(16, minmax(0, 1fr));
  overflow-y: auto;
  min-height: 0;
  padding: 6px;
  border: 1px solid var(--surface-3);
  border-radius: 4px;
  background: var(--surface-0);
  line-height: 1;
  align-content: start;
}

span.cell {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  border: 1px solid transparent;
  border-radius: 3px;
  background: var(--surface-1);
  color: var(--text);
}

span.cell:hover {
  border-color: var(--accent);
  background: var(--surface-2);
}

div.sample-text {
  padding: 10px 12px;
  border: 1px solid var(--surface-3);
  border-radius: 4px;
  background: var(--surface-0);
  font-size: 18px;
  line-height: 1.5;
  white-space: pre;
  overflow-x: auto;
  color: var(--text);
}
</style>
