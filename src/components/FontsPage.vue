<script setup>
import { ref, shallowRef, computed, watch, useTemplateRef, nextTick, toRaw, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { usePaletteStore } from '@/store/PaletteStore';
import { notSetUp } from '@/lib/fontSetup';
import { useFontActions, FONT_FILES } from '@/composables/useFontActions';
import { storedBitmapFont, registerBitmapFont, familyOf, storeFontPart, withPart } from '@/lib/userFonts';
import { fontId, fontKey, encodeBlocks, blocksOf, findBlocks, slotChars, withBlock, BLOCKS } from '@/lib/BitmapFont';
import { writePaletteFile, paletteFileName } from '@/lib/PaletteFile';
import { downloadBlob } from '@/document/projectIO';
import { SAMPLE_CHARS } from '@/lib/BitmapGlyphs';
import { DISPLAY_FONTS } from '@/lib/displayFonts';
import { toast } from '@/composables/useToast';
import { nextId } from '@/lib/FontLines';
import FontBlocks from '@/components/FontBlocks.vue';
import FontLines from '@/components/FontLines.vue';
import FontSets from '@/components/FontSets.vue';
import GlyphSample from '@/components/GlyphSample.vue';
import { loadLibrary, searchLibrary, tagCounts, tagsOf } from '@/lib/fontLibrary';

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
const part = useTemplateRef('part'); // the Lines or Sets section, which a click on the sheet goes to

const SAMPLE = SAMPLE_CHARS;
const lines = computed(() => [
  t('palette.fonts.pangram'),
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789',
  '!@#$%^&*()[]{}<>/\\|~ ░▒▓█▄▀▌▐',
  '╔═╦═╗ ┌─┬─┐ ☺☻♥♦♣♠ ←↑→↓',
  'αßΓπΣσµτΦΘΩδ∞φε≡±≥≤',
]);

const filter = ref('');
// The font library: its index is fetched when this page opens, the rows shown 100 at a time, narrowed by the filter and tags.
const PAGE = 100;
const TAG_GROUPS = ['machine', 'shape', 'chars', 'collection', 'other'];
const index = shallowRef(null);
const libraryState = ref('loading'); // 'loading' | 'ready' | 'failed'
const tags = ref([]); // the picked tags' keys
const shownCount = ref(PAGE);
const pickerOpen = ref(false);
const tagsWrap = useTemplateRef('tagsWrap');
const picker = useTemplateRef('picker');
const fetchLibrary = async () => {
  libraryState.value = 'loading';
  try {
    index.value = await loadLibrary();
    libraryState.value = 'ready';
  } catch {
    libraryState.value = 'failed';
  }
};
const outside = (event) => { if (!tagsWrap.value?.contains(event.target)) pickerOpen.value = false; };
onMounted(() => {
  fetchLibrary();
  document.addEventListener('pointerdown', outside);
});
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside));
const libraryFilter = computed(() => ({ query: filter.value, tags: tags.value }));
const matches = computed(() => (index.value ? searchLibrary(index.value, libraryFilter.value) : []));
const libraryRows = computed(() => matches.value.slice(0, shownCount.value));
const narrowed = computed(() => tags.value.length > 0 || !!filter.value.trim());
watch(libraryFilter, () => { shownCount.value = PAGE; });
const tagLabel = (key) => {
  const [group, value] = [key.split(':')[0], key.slice(key.indexOf(':') + 1)];
  if (group === 'shape') return `8×${value}`;
  if (group === 'chars') return t(`palette.fonts.charsets.${value}`, value);
  if (group === 'collection') return index.value.collections[value]?.name ?? value;
  if (key === 'ready') return t('palette.fonts.tagReady');
  return value;
};
// Every tag the library carries, by group: machines and character sets by name, shapes by height.
const tagList = computed(() => {
  const found = new Map();
  for (const e of [...index.value.fonts, ...index.value.linked]) for (const { key, group } of tagsOf(e)) found.set(key, group);
  return TAG_GROUPS.map((group) => ({
    group,
    tags: [...found].filter(([, g]) => g === group).map(([key]) => ({ key, label: tagLabel(key) }))
      .sort((a, b) => (group === 'shape' ? parseInt(a.label.slice(2), 10) - parseInt(b.label.slice(2), 10) : a.label.localeCompare(b.label))),
  })).filter((g) => g.tags.length);
});
const counts = computed(() => (pickerOpen.value && index.value ? tagCounts(index.value, libraryFilter.value) : new Map()));
const toggleTag = (key) => { tags.value = tags.value.includes(key) ? tags.value.filter((k) => k !== key) : [...tags.value, key]; };
const clearAll = () => { tags.value = []; filter.value = ''; };
const togglePicker = async () => {
  pickerOpen.value = !pickerOpen.value;
  if (pickerOpen.value) { await nextTick(); picker.value?.focus(); }
};
const closePicker = () => { pickerOpen.value = false; tagsWrap.value?.querySelector('button.tags')?.focus(); };
const libraryMeta = (e) => (e.linked ? t('palette.fonts.notIncluded') : `8×${e.height} · ${e.machine}`);
const chosenId = ref(null);
const hovered = ref(null); // the slot under the pointer
const problem = ref('');
const section = ref('blocks'); // 'blocks' | 'lines' | 'sets', over the one sheet
// What a click on the sheet sets: the block's key (Blocks), { style, piece } (Lines) or the set's id (Sets).
const picked = ref(null);

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
const kept = shallowRef(null); // shallow: its parts go back to the browser's store, which can't keep a proxy
const font = computed(() => (!bitmap.value ? null : isDrawn.value ? drawn.value : kept.value));
watch(() => [bitmap.value && !isDrawn.value && chosen.value.id, stored.value], async ([id], [was] = []) => {
  if (id !== was) kept.value = null; // the same font kept again stays on screen, so its fields keep their focus
  if (!id) return;
  const entry = stored.value.find((f) => f.id === id);
  if (kept.value && entry) { // the same font: its parts are the list's (set at once by setPart), its glyphs the same
    const { name, height, blocks, lines, sets } = toRaw(entry); // not the store's proxies: its parts go back to the browser's store
    kept.value = { name, height, bytes: kept.value.bytes, ...(blocks && { blocks }), ...(lines && { lines }), ...(sets && { sets }) };
    return;
  }
  const got = await storedBitmapFont(id).catch(() => null);
  if (chosen.value?.id === id) kept.value = got; // not once another font is chosen
}, { immediate: true });
watch([() => chosen.value?.id, section], () => { picked.value = null; });
// Set up its blocks (useFontSetup): that font chosen and that block picked, once the font chosen has dropped the pick.
watch(() => workspace.fontSetup, async (setup) => {
  if (!setup) return;
  workspace.fontSetup = null;
  chosenId.value = setup.id;
  section.value = 'blocks';
  await nextTick();
  if (!inRoom.value) picked.value = setup.block; // block edits are off in a room
}, { immediate: true });

// Why this font can't be used in the room you're in: its blocks aren't set up, and a room can't edit them.
const roomOff = computed(() => (project.inRoom && bitmap.value && font.value ? notSetUp(font.value) : null));
const inRoom = computed(() => isDrawn.value && project.inRoom); // the drawing's blocks are the room's
const chars = computed(() => slotChars(font.value));
// Each slot a block is drawn from, with every block drawn from it (several may share one).
const blockAt = computed(() => {
  const at = new Map();
  (font.value ? blocksOf(font.value) : []).forEach((s, i) => s !== null && at.set(s, [...(at.get(s) ?? []), i]));
  return at;
});
const readout = (n) => {
  const at = blockAt.value.get(n), char = chars.value[n];
  if (!at) return t('palette.fonts.slot', { n, char });
  const found = font.value.blocks && findBlocks({ ...font.value, blocks: undefined });
  const block = at.map((i) => t(`palette.fonts.blockLong.${BLOCKS[i].key}`)).join(', ');
  return t(found && at.some((i) => found[i] !== n) ? 'palette.fonts.slotBlockSet' : 'palette.fonts.slotBlock', { n, char, block });
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

// Gives the chosen font this part ('blocks', 'lines' or 'sets'; undefined: none). The drawing's font changes as one
// undo step; the browser's copy of it, when there is one, is kept too: the page's copy at once, so a click before the
// browser's store is written builds on it, then the store.
const setPart = (key, value) => run(async () => {
  if (isDrawn.value) await project.setDrawingFont({ ...font.value, [key]: value });
  if (isStored.value) await storePart(chosen.value.id, key, value);
});
const storePart = async (id, key, value) => {
  if (!isDrawn.value && chosen.value?.id === id) kept.value = withPart(kept.value, key, value);
  workspace.userFonts = workspace.userFonts.map((f) => (f.id === id ? withPart(toRaw(f), key, value) : f));
  await storeFontPart(id, key, value ?? null);
};
// A style or set deleted ({ entry, at }) from a font kept only in this browser, which has no undo: a toast whose Undo
// puts it back where it was. The drawing's font has its undo step.
const removed = ({ entry, at }) => {
  if (isDrawn.value || !isStored.value) return;
  const id = chosen.value.id, key = section.value, list = key === 'lines' ? 'styles' : 'sets';
  const putBack = () => run(async () => {
    const record = toRaw(workspace.userFonts?.find((f) => f.id === id));
    if (!record) return; // the font removed since
    const part = record[key] ?? (key === 'lines' ? { hide: [], styles: [] } : { hideStock: false, sets: [] });
    const taken = part[list].some((e) => e.id === entry.id); // by one made since: it comes back under a new id
    const items = [...part[list]];
    items.splice(Math.min(at, items.length), 0, taken ? { ...entry, id: nextId(part[list], key === 'lines' ? 'l' : 's') } : entry);
    await storePart(id, key, { ...part, [list]: items });
  });
  toast(t('palette.fonts.deleted', { name: entry.name }), { action: { label: t('toolbar.undo'), run: putBack } });
};
// These blocks (undefined: found again).
const setBlocks = (blocks) => {
  const found = blocks && findBlocks({ ...font.value, blocks: undefined });
  setPart('blocks', found?.every((s, i) => s === blocks[i]) ? undefined : blocks); // where the pixels put them: found, not set
};
const setSlot = (n) => {
  if (!picked.value || inRoom.value || !font.value) return;
  if (section.value !== 'blocks') return part.value?.slot(n);
  const blocks = blocksOf(font.value), next = withBlock(blocks, picked.value, n);
  if (next.some((s, i) => s !== blocks[i])) setBlocks(next);
};
const sections = computed(() => [
  { key: 'blocks', label: t('palette.fonts.blocks') },
  { key: 'lines', label: t('palette.fonts.lines'), count: font.value?.lines?.styles.length ?? 0 },
  { key: 'sets', label: t('palette.fonts.sets'), count: font.value?.sets?.sets.length ?? 0 },
]);

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
      <div v-if="libraryState === 'ready'" ref="tagsWrap" class="tag-row" @keydown.esc="pickerOpen && ($event.stopPropagation(), closePicker())">
        <button class="tags" :aria-expanded="pickerOpen" @click="togglePicker">
          {{ t('palette.fonts.tags') }}<span v-if="tags.length" class="badge">{{ tags.length }}</span> ▾
        </button>
        <button v-for="k in tags" :key="k" class="chip picked" :aria-label="t('palette.fonts.removeTag', { tag: tagLabel(k) })" @click="toggleTag(k)">{{ tagLabel(k) }} ×</button>
        <button v-if="tags.length" class="clear" @click="clearAll">{{ t('palette.fonts.clear') }}</button>
        <div v-if="pickerOpen" ref="picker" class="picker" tabindex="-1" role="group" :aria-label="t('palette.fonts.tags')">
          <div v-for="g in tagList" :key="g.group" class="tag-group">
            <span class="label">{{ t(`palette.fonts.tagGroups.${g.group}`) }}</span>
            <div class="chips">
              <button
                  v-for="x in g.tags"
                  :key="x.key"
                  class="chip"
                  :class="{ picked: tags.includes(x.key) }"
                  :aria-pressed="tags.includes(x.key)"
                  :disabled="!tags.includes(x.key) && !counts.get(x.key)"
                  @click="toggleTag(x.key)"
              >{{ x.label }} <span class="count">{{ counts.get(x.key) ?? 0 }}</span></button>
            </div>
          </div>
        </div>
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
        <div class="group library-group">
          <span class="label">{{ libraryState === 'ready' ? t(narrowed ? 'palette.fonts.libraryFound' : 'palette.fonts.libraryCount', { n: matches.length }, matches.length) : t('palette.fonts.library') }}</span>
        </div>
        <p v-if="libraryState === 'loading'" class="library-note">{{ t('palette.fonts.libraryLoading') }}</p>
        <div v-else-if="libraryState === 'failed'" class="library-note">
          <p>{{ t('palette.fonts.libraryFailed') }}</p>
          <button @click="fetchLibrary">{{ t('palette.fonts.tryAgain') }}</button>
        </div>
        <div v-else-if="!matches.length" class="library-note">
          <p>{{ t('palette.fonts.libraryNone') }}</p>
          <button @click="clearAll">{{ t('palette.fonts.clear') }}</button>
        </div>
        <template v-else>
          <div
              v-for="e in libraryRows"
              :key="e.id"
              class="row library"
              :class="{ current: e.id === chosenId }"
              @click="chosenId = e.id"
          >
            <div class="name"><span>{{ e.name }}</span><em>{{ libraryMeta(e) }}</em></div>
            <div v-if="e.linked" class="credit">{{ e.linked.credit }}</div>
            <GlyphSample v-else :sample="e.sample" :height="e.height" />
          </div>
          <button v-if="matches.length > shownCount" class="more" @click="shownCount += PAGE">{{ t('palette.fonts.showMore', { n: PAGE }) }}</button>
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
        <button v-if="!isInUse" class="ghost" :disabled="hostsFont || !!roomOff" :title="roomOff ?? undefined" :data-off-reason="roomOff ? '' : undefined" @click="apply">{{ t('palette.fonts.use') }}</button>
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
        <div class="sections" role="tablist" :aria-label="t('palette.fonts.sectionsAria')">
          <button v-for="s in sections" :key="s.key" role="tab" :class="{ on: section === s.key }" :aria-selected="section === s.key" @click="section = s.key">
            {{ s.label }} <span v-if="s.count !== undefined" class="count">{{ s.count }}</span>
          </button>
        </div>
        <FontBlocks
            v-if="section === 'blocks'"
            :font="font"
            :family="familyFor(chosen)"
            :picked="picked"
            :disabled="inRoom"
            :reason="t('palette.fonts.blocksInRoom')"
            @pick="picked = $event"
        />
        <component
            :is="section === 'lines' ? FontLines : FontSets"
            v-else
            ref="part"
            :font="font"
            :family="familyFor(chosen)"
            :picked="picked"
            :disabled="inRoom"
            :reason="t('palette.fonts.blocksInRoom')"
            @pick="picked = $event"
            @change="setPart(section, $event)"
            @removed="removed"
        />
        <div class="note">{{ t('palette.fonts.sheetNote') }}</div>
        <div class="grid sheet" :class="{ picking: picked && !inRoom }" :style="styleOf(chosen)" @mouseleave="hovered = null">
          <span
              v-for="(c, i) in chars"
              :key="i"
              class="cell"
              :class="{ role: blockAt.has(i), picked: !!blockAt.get(i)?.some((b) => BLOCKS[b].key === picked) }"
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

div.tag-row {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 0 12px 6px;
}

div.tag-row button {
  padding: 2px 8px;
  border: 1px solid var(--surface-3);
  border-radius: 10px;
  background: var(--surface-1);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

div.tag-row button.clear {
  border-color: transparent;
  background: none;
  color: var(--accent);
}

div.tag-row button.picked,
div.tag-row button[aria-expanded='true'] {
  border-color: var(--accent);
}

div.tag-row button:disabled {
  opacity: 0.4;
  cursor: default;
}

span.badge {
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--accent);
  color: var(--surface-0);
}

div.picker {
  position: absolute;
  top: 100%;
  left: 12px;
  right: 12px;
  z-index: 5;
  max-height: 60vh;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid var(--surface-3);
  border-radius: 6px;
  background: var(--surface-0);
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.4);
}

div.tag-group span.label {
  display: block;
  margin: 6px 0 3px;
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}

div.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

@media (max-width: 700px) { /* a phone: the picker over the full width, its chips in two columns */
  div.picker {
    left: 0;
    right: 0;
  }

  div.chips {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
}

.library-note {
  margin: 0;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--text-muted);
}

.library-note p {
  margin: 0 0 6px;
}

div.credit {
  font-size: 12px;
  color: var(--text-muted);
}

button.more {
  margin: 6px 12px;
}

/* Blocks | Lines | Sets: as the layer's page tabs, a size smaller */
div.sections {
  display: flex;
  border-bottom: 1px solid var(--surface-3);
}

div.sections button[role='tab'] {
  padding: 4px 10px 6px 0;
  margin-right: 10px;
  border: none;
  border-radius: 0;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

div.sections button[role='tab']:not(.on):hover {
  color: var(--accent);
}

div.sections button[role='tab']:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

div.sections button[role='tab'].on {
  color: var(--text);
  box-shadow: inset 0 -2px var(--accent);
}

span.count {
  color: var(--text-muted);
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

/* A tall Lines or Sets section scrolls the side, the sheet keeping a few rows. */
div.edit-side {
  overflow-y: auto;
  min-height: 0;
}

/* The 256 slots, 16 to a row as the font's sheet lays them out, framed as the Palettes page's glyph pane. */
div.grid.sheet {
  grid-template-columns: repeat(16, minmax(0, 1fr));
  overflow-y: auto;
  min-height: 160px;
  padding: 6px;
  border: 1px solid var(--surface-3);
  border-radius: 4px;
  background: var(--surface-0);
  line-height: 1;
  align-content: start;
}

div.grid.sheet.picking { /* a block is picked: a click here sets its slot */
  outline: 1px dashed var(--accent);
  outline-offset: 2px;
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
