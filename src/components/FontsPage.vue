<script setup>
import { ref, computed, watch, useTemplateRef, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { usePaletteStore } from '@/store/PaletteStore';
import { useFontActions, FONT_FILES } from '@/composables/useFontActions';
import { storedBitmapFont, registerBitmapFont, familyOf, storeBlocks, loadFonts } from '@/lib/userFonts';
import { fontId, fontKey, encodeBlocks, blocksOf, findBlocks, slotChars, withBlock, BLOCKS } from '@/lib/BitmapFont';
import { writePaletteFile, paletteFileName } from '@/lib/PaletteFile';
import { downloadBlob } from '@/document/projectIO';
import { DISPLAY_FONTS } from '@/lib/displayFonts';
import FontBlocks from '@/components/FontBlocks.vue';

// The palette layer's Fonts page: the font in use, yours and the built-in ones on the left, each sampled in its own glyphs;
// on the right the chosen one with its actions and its 256 slots (a TrueType font has a sample instead). Choosing a
// font here only shows it: Use this font applies it, as the Font field's dropdown does.
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
const picked = ref(null); // the block (BLOCKS key) whose slot a click on the sheet sets

const drawn = computed(() => project.drawingFont);
const drawnId = computed(() => drawn.value && fontId(drawn.value));
const stored = computed(() => workspace.userFonts ?? []);
// The font in use: the drawing's bitmap font, else the one viewed in (a TrueType font of yours, or a built-in, not listed).
const inUseId = computed(() => drawnId.value ?? workspace.displayFontSpec.id);
const builtIn = DISPLAY_FONTS.map((f) => ({ id: f.id, name: f.name, kind: 'builtIn', family: f.family }));
// The drawing's font (listed once, though it may be kept in this browser too), then yours, then the built-in ones.
const all = computed(() => [
  ...(drawn.value ? [{ id: drawnId.value, name: drawn.value.name, kind: 'bitmap', height: drawn.value.height }] : []),
  ...stored.value.filter((f) => f.id !== drawnId.value),
  ...builtIn,
]);
const groups = computed(() => {
  const query = filter.value.trim().toLowerCase(), shown = all.value.filter((f) => f.name.toLowerCase().includes(query));
  return [
    { key: 'inUse', label: t('palette.fonts.inUse'), rows: shown.filter((f) => f.id === inUseId.value) },
    { key: 'yours', label: t('common.yours'), rows: shown.filter((f) => f.id !== inUseId.value && f.kind !== 'builtIn') },
    { key: 'builtIn', label: t('common.builtIn'), rows: shown.filter((f) => f.id !== inUseId.value && f.kind === 'builtIn') },
  ].filter((g) => g.rows.length);
});
// The chosen font; once it's gone (removed), the one in use, else the first.
const chosen = computed(() => all.value.find((f) => f.id === chosenId.value) ?? all.value.find((f) => f.id === inUseId.value) ?? all.value[0] ?? null);
const bitmap = computed(() => chosen.value?.kind === 'bitmap');
const isDrawn = computed(() => chosen.value?.id === drawnId.value);
const isInUse = computed(() => chosen.value?.id === inUseId.value);
const isStored = computed(() => stored.value.some((f) => f.id === chosen.value?.id));
const count = computed(() => (chosen.value ? palettes.countFor(chosen.value.id) : 0));

const size = (f) => (f.kind === 'bitmap' ? `8×${f.height}` : t('palette.fonts.trueType'));
// Drawn at its own height, or twice that when it's too small to read.
const keys = ref({}); // a bitmap font's id -> the key it's registered under (its blocks too: BitmapFont.fontKey)
const familyFor = (f) => f.family ?? familyOf(keys.value[f.id] ?? f.id);
const styleOf = (f) => ({ fontFamily: familyFor(f), fontSize: `${f.kind === 'bitmap' && f.height < 12 ? 2 * f.height : f.height ?? 16}px` });
const meta = computed(() => [
  size(chosen.value),
  isDrawn.value ? t(project.image ? 'palette.fonts.drawingsFont' : 'palette.fonts.nextDrawingsFont') : isInUse.value && t('palette.fonts.inUseMeta'),
  !isDrawn.value && t(chosen.value.kind === 'builtIn' ? 'palette.fonts.builtInMeta' : 'palette.fonts.inBrowser'),
  font.value?.blocks && t('palette.fonts.blocksSetMeta'),
  t('palette.fonts.palettes', { n: count.value }, count.value),
].filter(Boolean).join(' · '));

// A listed bitmap font as a drawing holds one: { name, height, bytes }.
const bitmapOf = (f) => (f.id === drawnId.value ? drawn.value : storedBitmapFont(f.id));

// The chosen bitmap font as a drawing holds one, with its blocks: the drawing's own, else the browser's copy.
const kept = ref(null);
const font = computed(() => (!bitmap.value ? null : isDrawn.value ? drawn.value : kept.value));
watch(() => [bitmap.value && !isDrawn.value && chosen.value.id, stored.value], async ([id]) => {
  kept.value = null;
  if (id) kept.value = await storedBitmapFont(id).catch(() => null);
}, { immediate: true });
watch(() => chosen.value?.id, () => { picked.value = null; });

const inRoom = computed(() => isDrawn.value && project.inRoom); // the drawing's blocks are the room's
const chars = computed(() => slotChars(font.value));
const blockAt = computed(() => new Map((font.value ? blocksOf(font.value) : []).flatMap((s, i) => (s === null ? [] : [[s, i]]))));
const readout = (n) => {
  const i = blockAt.value.get(n), char = chars.value[n];
  if (i === undefined) return t('palette.fonts.slot', { n, char });
  return t(font.value.blocks && findBlocks({ ...font.value, blocks: undefined })[i] !== n ? 'palette.fonts.slotBlockSet' : 'palette.fonts.slotBlock', { n, char, block: t(`palette.fonts.blockLong.${BLOCKS[i].key}`) });
};

// Every listed bitmap font registered with the page, so its sample and sheet draw in its own glyphs. (TrueType fonts
// are registered as they're loaded.) Again when a font's blocks change: its face is keyed by them.
const faceSignature = (f) => (f.id === drawnId.value ? fontKey(drawn.value) : f.blocks ? encodeBlocks(f.blocks) : '');
watch(() => all.value.filter((f) => f.kind === 'bitmap').map((f) => `${f.id}:${faceSignature(f)}`).join(' '), async () => {
  for (const f of all.value.filter((font) => font.kind === 'bitmap')) {
    try {
      const font = await bitmapOf(f);
      await registerBitmapFont(font);
      keys.value[f.id] = fontKey(font);
    } catch {
      // it draws in the fallback font
    }
  }
}, { immediate: true });

// Gives the chosen font these blocks (undefined: found again). The drawing's font changes as one undo step; the
// browser's copy of it, when there is one, is kept too.
const setBlocks = (blocks) => run(async () => {
  const plain = { ...font.value };
  delete plain.blocks;
  if (blocks && findBlocks(plain).every((s, i) => s === blocks[i])) blocks = undefined; // where the pixels put them: found, not set
  if (isDrawn.value) project.setDrawingFont(blocks ? { ...plain, blocks } : plain);
  if (isStored.value) {
    await storeBlocks(chosen.value.id, blocks ?? null);
    workspace.userFonts = await loadFonts();
  }
});
const setSlot = (n) => {
  if (!picked.value || inRoom.value || !font.value) return;
  const blocks = blocksOf(font.value), next = withBlock(blocks, picked.value, n);
  if (next.some((s, i) => s !== blocks[i])) setBlocks(next);
};

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
        <button v-if="!isInUse" class="ghost" :disabled="hostsFont" @click="apply">{{ t('palette.fonts.use') }}</button>
        <template v-if="bitmap">
          <button class="ghost" @click="save(saveRaw)">{{ t('palette.fonts.saveRaw', { height: String(chosen.height).padStart(2, '0') }) }}</button>
          <button class="ghost" @click="save(savePng)">{{ t('palette.fonts.savePng') }}</button>
        </template>
        <button class="ghost" :disabled="!count" @click="exportPalettes">{{ t('palette.fonts.exportPalettes') }}</button>
        <button v-if="isInUse" class="ghost" @click="workspace.paletteLayerPage = 'palettes'">{{ t('palette.fonts.toPalettes') }}</button>
        <button v-if="bitmap && font?.blocks" class="ghost" :disabled="inRoom" :data-off-reason="inRoom ? '' : undefined" :title="inRoom ? t('palette.fonts.blocksInRoom') : t('palette.fonts.findBlocksTitle')" @click="setBlocks(undefined)">{{ t('palette.fonts.findBlocks') }}</button>
        <button v-if="isStored" class="ghost" :title="t('palette.fonts.removeTitle')" @click="forget">{{ t('palette.fonts.remove') }}</button>
      </div>
      <template v-if="bitmap && font">
        <FontBlocks
            :font="font"
            :family="familyFor(chosen)"
            :picked="picked"
            :disabled="inRoom"
            :reason="t('palette.fonts.blocksInRoom')"
            @pick="picked = $event"
        />
        <div class="note">{{ t('palette.fonts.sheetNote') }}</div>
        <div class="grid sheet" :style="styleOf(chosen)" @mouseleave="hovered = null">
          <span
              v-for="(c, i) in chars"
              :key="i"
              class="cell"
              :class="{ role: blockAt.has(i), picked: blockAt.get(i) !== undefined && BLOCKS[blockAt.get(i)].key === picked }"
              @mouseenter="hovered = i"
              @click="setSlot(i)"
          >{{ c === '␀' ? ' ' : c }}</span>
        </div>
        <div class="info">{{ hovered === null ? t('palette.fonts.slotHint') : readout(hovered) }}</div>
      </template>
      <template v-else>
        <div class="note">{{ t('palette.fonts.trueTypeNote') }}</div>
        <div class="sample-text" :style="{ fontFamily: familyFor(chosen) }">
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

span.cell.role {
  border-color: var(--surface-3);
}

span.cell.picked {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
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
