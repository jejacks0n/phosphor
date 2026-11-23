<script setup>
import { ref, shallowRef, computed, watch, useTemplateRef, nextTick, toRaw, onMounted } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { usePaletteStore } from '@/store/PaletteStore';
import { notSetUp } from '@/lib/fontSetup';
import { useFontActions, FONT_FILES } from '@/composables/useFontActions';
import { setFontWidth } from '@/composables/useFontWidth';
import { storedBitmapFont, registerBitmapFont, releaseBitmapFont, familyOf, storeFontPart, withPart } from '@/lib/userFonts';
import { parseRawFont, narrowWidthOf, fontId, fontKey, encodeBlocks, blocksOf, findBlocks, sampleOf, slotChars, withBlock, BLOCKS } from '@/lib/BitmapFont';
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
import FontFilters from '@/components/FontFilters.vue';
import CloseButton from '@/components/CloseButton.vue';
import ToggleGroup from '@/components/ToggleGroup.vue';
import { loadLibrary, libraryEntryOf, libraryFile, licenseUrl, searchLibrary, shapeOf, tagCounts, tagsOf, tellUsUrl } from '@/lib/fontLibrary';
import ArrowIcon from '@/components/ArrowIcon.vue';
import GlyphZoom from '@/components/GlyphZoom.vue';
import { useGlyphZoom } from '@/composables/useGlyphZoom';

// The palette layer's Fonts page: the font in use, yours and the built-in ones on the left, each sampled in its own glyphs;
// on the right the chosen one with its actions and its 256 slots (a TrueType font has a sample instead). Choosing a
// font here only shows it: Use this font applies it, as the Font field's dropdown does.
// stage: where the layer is, 'float' | 'dialog' (under 1000px) | 'full' (full screen) | 'phone'
const props = defineProps({ stage: { type: String, default: 'float' } });
const emit = defineEmits(['acted']);
const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();
const palettes = usePaletteStore();
const { loadFile, choose, useLibraryFont, keepLibraryFont, remove, hostsFont } = useFontActions();
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
// The Filters column's fold (null until « or » is pressed: folded till then), its groups' folds, and the list's folded
// groups (Yours, Built-in, Library: In use never folds).
const prefs = useLocalStorage('phosphor.fontFilters', { folded: null, closed: [], list: [] }, { mergeDefaults: true });
const listOpen = (key) => key === 'inUse' || !prefs.value.list.includes(key);
const foldList = (key) => { prefs.value.list = listOpen(key) ? [...prefs.value.list, key] : prefs.value.list.filter((k) => k !== key); };
const folded = computed(() => prefs.value.folded ?? true);
const showColumn = computed(() => libraryState.value === 'ready' && props.stage !== 'phone' && !folded.value);
const fetchLibrary = async () => {
  libraryState.value = 'loading';
  try {
    index.value = await loadLibrary();
    libraryState.value = 'ready';
  } catch {
    libraryState.value = 'failed';
  }
};
onMounted(fetchLibrary);
const libraryFilter = computed(() => ({ query: filter.value, tags: tags.value }));
const matches = computed(() => (index.value ? searchLibrary(index.value, libraryFilter.value) : []));
const libraryRows = computed(() => matches.value.slice(0, shownCount.value));
const narrowed = computed(() => tags.value.length > 0 || !!filter.value.trim());
watch(libraryFilter, () => { shownCount.value = PAGE; });
const tagLabel = (key) => {
  const [group, value] = [key.split(':')[0], key.slice(key.indexOf(':') + 1)];
  if (group === 'shape') return value.replace('x', '×');
  if (group === 'chars') return t(`palette.fonts.charsets.${value}`, value);
  if (group === 'collection') return index.value.collections[value]?.name ?? value;
  if (key === 'ready') return t('palette.fonts.tagReady');
  return value;
};
const shapeOrder = (label) => { const [w, h] = label.split('×'); return h * 100 + +w; };
// Every tag the library carries, by group: machines and character sets by name, shapes by height, then width.
const tagList = computed(() => {
  const found = new Map();
  for (const e of [...index.value.fonts, ...index.value.linked]) for (const { key, group } of tagsOf(e)) found.set(key, group);
  return TAG_GROUPS.map((group) => ({
    group,
    tags: [...found].filter(([, g]) => g === group).map(([key]) => ({ key, label: tagLabel(key) }))
      .sort((a, b) => (group === 'shape' ? shapeOrder(a.label) - shapeOrder(b.label) : a.label.localeCompare(b.label))),
  })).filter((g) => g.tags.length);
});
const counts = computed(() => (index.value ? tagCounts(index.value) : new Map()));
const toggleTag = (key) => { tags.value = tags.value.includes(key) ? tags.value.filter((k) => k !== key) : [...tags.value, key]; };
const clearAll = () => { tags.value = []; filter.value = ''; };
// Clear all goes away once pressed: the focus goes back to the layer.
const clearTags = () => { tags.value = []; emit('acted'); };
const focusOn = async (selector) => { await nextTick(); page.value.querySelector(selector)?.focus(); };
// « / » beside the search folds and opens the column, as the side panel's does; on a phone it opens a sheet over the
// layer, which gives the focus back to it on closing.
const sheetOpen = ref(false);
const filtersShown = computed(() => (props.stage === 'phone' ? sheetOpen.value : showColumn.value));
const toggleFilters = () => {
  if (props.stage !== 'phone') return void (prefs.value.folded = showColumn.value);
  sheetOpen.value = true;
  focusOn('button.close-sheet');
};
const closeSheet = () => {
  sheetOpen.value = false;
  focusOn('button.filters-toggle');
};
watch(() => props.stage, (stage) => {
  if (stage === 'phone' || !sheetOpen.value) return;
  sheetOpen.value = false; // a window grown past a phone's: the column takes over
  emit('acted');
});
// A library entry's From, License and Credit lines: [{ label, text, href?, tail? }].
const originLines = (e) => {
  const lines = [];
  if (e.linked) {
    lines.push({ label: t('palette.fonts.credit'), text: e.linked.credit });
    lines.push({ label: t('palette.fonts.license'), text: t('palette.fonts.licenseFile'), href: e.linked.license });
    return lines;
  }
  const c = index.value.collections[e.collection];
  if (!c) return lines;
  lines.push({ label: t('palette.fonts.from'), text: c.name, href: c.url });
  const license = c.license?.kind === 'none'
    ? { text: t('palette.fonts.licenseNone'), href: licenseUrl(c.license.file) }
    : { text: t('palette.fonts.licenseUnknown'), href: tellUsUrl(e, index.value), prefix: t('palette.fonts.unknown') };
  lines.push({ label: t('palette.fonts.license'), ...license });
  return lines;
};
const libMeta = (e) => [shapeOf(e.width, e.height), t('palette.fonts.library'), e.linked && t('palette.fonts.notIncluded')].filter(Boolean).join(' · ');
const fetching = ref(false);
// Use this font / Add to Yours: the fetch, then the font is in Yours and the page shows it (chosen follows by font id).
const fromLibrary = (action) => async () => {
  const entry = libEntry.value;
  fetching.value = true;
  try { await run(() => action(entry)); } finally { fetching.value = false; }
};
const useFromLibrary = fromLibrary((e) => useLibraryFont(e));
const keepFromLibrary = fromLibrary((e) => keepLibraryFont(e));
const pickTag = (key) => { tags.value = [key]; filter.value = ''; };
const libraryMeta = (e) => (e.linked ? t('palette.fonts.notIncluded') : [shapeOf(e.width, e.height), e.machine].filter(Boolean).join(' · '));
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
// A font whose bytes are a linked font's was named for it when loaded (addBitmapFont); its row shows the credit.
const linkedOf = (id) => index.value?.linked.find((e) => e.fontId === id);
const all = computed(() => [
  ...(drawn.value ? [{ id: drawnId.value, name: drawn.value.name, kind: 'bitmap', height: drawn.value.height, cellWidth: drawn.value.cellWidth }] : []),
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
// A library row chosen shows the library's details, unless its font is already in Yours or the drawing's: then those.
const libEntry = computed(() => (index.value && chosenId.value ? [...index.value.fonts, ...index.value.linked].find((e) => e.id === chosenId.value) : null) ?? null);
const chosen = computed(() => all.value.find((f) => f.id === chosenId.value)
  ?? (libEntry.value ? all.value.find((f) => f.id === libEntry.value.fontId) : null)
  ?? (libEntry.value ? null : all.value.find((f) => f.id === inUseId.value) ?? all.value[0] ?? null));
const held = computed(() => (index.value && chosen.value ? libraryEntryOf(index.value, chosen.value.id) : null)); // a library font's entry, for From and License
// A library font chosen that isn't in Yours: its file fetched to show its slots (the index holds only a sample), its face
// registered for the page until another is previewed. While it loads the sheet is an empty frame (the sample there
// first was a flash before the slots); if it can't be fetched, the sample shows instead.
const preview = shallowRef(null); // { id, font, family, key }
const previewFailed = ref(null); // the library id whose file couldn't be fetched or read
watch(() => (libEntry.value && !libEntry.value.linked && !chosen.value ? libEntry.value : null), async (entry) => {
  if (!entry || preview.value?.id === entry.id) return;
  try {
    const font = parseRawFont(new Uint8Array(await (await libraryFile(entry)).arrayBuffer()), entry.name);
    if (entry.width < 8) font.cellWidth = entry.width;
    const family = await registerBitmapFont(font, { keep: false });
    if (libEntry.value?.id !== entry.id) return releaseBitmapFont(fontKey(font)); // chosen away while it loaded
    if (preview.value) releaseBitmapFont(preview.value.key);
    preview.value = { id: entry.id, font, family, key: fontKey(font) };
  } catch {
    previewFailed.value = entry.id; // the sample shows
  }
});
const previewChars = computed(() => (preview.value?.id === libEntry.value?.id ? slotChars(preview.value.font) : null));
const bitmap = computed(() => chosen.value?.kind === 'bitmap');
const isDrawn = computed(() => chosen.value?.id === drawnId.value);
const isInUse = computed(() => chosen.value?.id === inUseId.value);
const isStored = computed(() => stored.value.some((f) => f.id === chosen.value?.id));
const count = computed(() => (chosen.value ? palettes.countFor(chosen.value.id) : 0));

// A row's size: the drawing's font as it's drawn (cellWidth), another bitmap font at its remembered width, else its own.
const size = (f) => (f.kind === 'bitmap' ? shapeOf(f.cellWidth ?? f.width ?? f.ownWidth, f.height) : t('palette.fonts.trueType'));
// A row's sample drawn at the font's own height; the sheet twice that when it's too small to read.
const keys = ref({}); // a bitmap font's id -> the key it's registered under (its blocks too: BitmapFont.fontKey)
const samples = ref({}); // a bitmap font's id -> its sample in its face's characters (sampleOf), as the library's are drawn
const familyFor = (f) => f.family ?? familyOf(keys.value[f.id] ?? f.id);
const rowStyle = (f) => ({ fontFamily: familyFor(f), fontSize: `${f.height ?? 16}px` });
const styleOf = (f) => ({ fontFamily: familyFor(f), fontSize: `${f.kind === 'bitmap' && f.height < 12 ? 2 * f.height : f.height ?? 16}px` });
// The width a bitmap font is drawn at: the drawing's own cellWidth; a stored font's remembered answer, else its own width.
const own = computed(() => (font.value ? narrowWidthOf(font.value) : null));
const widthNow = computed(() => (isDrawn.value ? drawn.value.cellWidth : stored.value.find((f) => f.id === chosen.value?.id)?.width ?? own.value ?? 8));
// 9 only on the drawing (it's never remembered per font), and a font that isn't the drawing's shows the switch only when narrow
const widths = computed(() => (isDrawn.value || own.value ? [...(own.value ? [own.value] : []), 8, ...(isDrawn.value ? [9] : [])] : []));
const widthOff = computed(() => isDrawn.value && project._sharing?.role === 'artist'); // the host's width is the room's
const widthLit = computed(() => Object.fromEntries(widths.value.map((w) => [w, widthNow.value === w])));
const widthOptions = computed(() => widths.value.map((w) => ({ key: String(w), label: String(w), disabled: widthOff.value, title: widthOff.value ? t('palette.fonts.widthInRoom') : undefined, reason: widthOff.value })));
const setWidth = (w) => run(() => (isDrawn.value ? setFontWidth(drawn.value, w) : storePart(chosen.value.id, 'width', w)));
const meta = computed(() => (bitmap.value ? shapeOf(widthNow.value, chosen.value.height) : size(chosen.value)));

// A listed bitmap font as a drawing holds one: { name, height, bytes }.
const bitmapOf = (f) => (f.id === drawnId.value ? drawn.value : storedBitmapFont(f.id));

// The chosen bitmap font as a drawing holds one, with its blocks: the drawing's own, else the browser's copy.
const kept = shallowRef(null); // shallow: its parts go back to the browser's store, which can't keep a proxy
const font = computed(() => (!bitmap.value ? null : isDrawn.value ? drawn.value : kept.value));
// The Blocks, Lines and Sets tiles draw a glyph in their box's middle, a whole number of times the font's size: a narrow
// font in a face at its own width, whatever width it's drawn at, so its ink isn't left of the middle at 8; an 8-wide one
// at its width now, so 9 shows the ninth column. (The sheet draws the slots as the drawing does.)
const tileFamily = ref('');
const tileFont = computed(() => font.value && { ...font.value, cellWidth: own.value ?? (widthNow.value === 9 ? 9 : 8) });
watch(() => tileFont.value && fontKey(tileFont.value), async (key) => {
  if (!key) return;
  const family = await registerBitmapFont(tileFont.value);
  if (tileFont.value && fontKey(tileFont.value) === key) tileFamily.value = family;
}, { immediate: true });
const tileStyle = computed(() => chosen.value?.height && { '--tile-glyph-size': `${chosen.value.height * Math.max(1, Math.floor(22 / chosen.value.height))}px` });
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
// The head's … menu: Export palettes, Palettes, Find blocks again and Remove, as the character palette's is. A press
// anywhere else in the page shuts it, as does Escape or another font chosen.
const moreOpen = ref(false);
watch(() => chosen.value?.id, () => { moreOpen.value = false; });
const shutMore = (event) => { if (moreOpen.value && !event.target.closest?.('.more')) moreOpen.value = false; };
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
// are registered as they're loaded.) Again when a font's blocks or width change: its face is keyed by them. A row's
// face is at the width its size says (the library's rows draw theirs at it too), and a pass a later one overtook
// (a width chosen while it registered) leaves the rows to that one.
const widthOf = (f) => f.cellWidth ?? f.width ?? f.ownWidth ?? 8;
const faceSignature = (f) => `${f.id === drawnId.value ? fontKey(drawn.value) : f.blocks ? encodeBlocks(f.blocks) : ''}:${widthOf(f)}`;
let facesPass = 0;
watch(() => all.value.filter((f) => f.kind === 'bitmap').map((f) => `${f.id}:${faceSignature(f)}`).join(' '), async () => {
  const pass = ++facesPass;
  for (const f of all.value.filter((font) => font.kind === 'bitmap')) {
    try {
      const font = { ...(await bitmapOf(f)), cellWidth: widthOf(f) };
      await registerBitmapFont(font);
      if (pass !== facesPass) return;
      keys.value[f.id] = fontKey(font);
      samples.value[f.id] = sampleOf(font);
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
// A slot clicked (no block picked to set): its glyph large over the sheet, for a closer look (GlyphZoom). Another click,
// Escape, a press elsewhere or a scroll puts it away. A long press shows it whatever a click would do (set a block's or
// a line piece's slot), and the click that ends it lands nowhere.
const { zoom, show, close: closeZoom, press: pressSlot, release: releaseSlot, pressedLong } = useGlyphZoom('span.cell');
const showZoom = (event, n, char, f) => show(event, n, char, styleOf(f).fontFamily, f.height);
const chosenZoom = (event, n) => (zoom.value?.n === n ? null : showZoom(event, n, chars.value[n], chosen.value));
const clickSlot = (event, n) => {
  if (pressedLong(n)) return;
  return picked.value && !inRoom.value ? setSlot(n) : showZoom(event, n, chars.value[n], chosen.value);
};
const libFace = computed(() => libEntry.value && preview.value && { kind: 'bitmap', height: libEntry.value.height, family: preview.value.family });
const zoomOut = () => { closeZoom(); emit('acted'); };
watch([chosenId, () => libEntry.value?.id, picked, section], closeZoom);
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
const apply = () => run(() => choose(chosen.value.id, held.value?.sauce ? { sauceFontName: held.value.sauce } : undefined)); // a library font's SAUCE name, as from the library
const forget = () => run(() => remove(chosen.value.id));
// The next or previous font on screen, in the list's order, the library rows shown last (the layer passes its arrow
// keys here). A library row chosen is where it steps from, though its font in Yours is current too.
const step = (delta) => { // a folded group's rows are skipped
  const library = libraryState.value === 'ready' && listOpen('library') ? libraryRows.value.map((e) => e.id) : [];
  const ids = [...groups.value.filter((g) => listOpen(g.key)).flatMap((g) => g.rows.map((f) => f.id)), ...library];
  const at = ids.indexOf(chosenId.value), i = at >= 0 ? at : ids.indexOf(chosen.value?.id);
  const next = ids[Math.max(0, Math.min(ids.length - 1, i + delta))];
  if (!next) return;
  chosenId.value = next;
  nextTick(() => page.value?.querySelector(library.includes(next) ? '.row.library.current' : '.row.current')?.scrollIntoView({ block: 'nearest' }));
};
defineExpose({ step });

const exportPalettes = () => {
  const list = palettes.all.filter((p) => p.font?.id === chosen.value.id);
  downloadBlob(new Blob([writePaletteFile(list)], { type: 'application/json' }), paletteFileName(chosen.value.name));
};
</script>

<template>
  <div ref="page" class="page fonts" :class="stage" @pointerdown="shutMore">
    <!-- a phone's filters: a sheet over the layer (Escape and the arrow keys stop at it) -->
    <div
        v-if="sheetOpen"
        class="filters-sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="t('palette.fonts.filters')"
        @keydown.esc.stop="closeSheet"
        @keydown.up.down.stop
    >
      <div class="filters-head">
        <h3 class="title">{{ t('palette.fonts.filters') }}</h3>
        <button v-if="tags.length" class="clear-all" @click="clearTags">{{ t('palette.fonts.clearAll') }}</button>
        <CloseButton class="close-sheet" :label="t('palette.fonts.closeFilters')" @click="closeSheet"/>
      </div>
      <FontFilters v-model:closed="prefs.closed" class="sheet-body" :groups="tagList" :counts="counts" :picked="tags" @toggle="toggleTag" />
      <button class="show" @click="closeSheet">{{ t('palette.fonts.showFonts', { n: matches.length }, matches.length) }}</button>
    </div>
    <!-- the list: choose a font to see it (or with the arrow keys) -->
    <div class="list-side">
      <div class="top">
        <button
            v-if="libraryState === 'ready'"
            class="filters-toggle link"
            :aria-expanded="filtersShown"
            :aria-label="t(filtersShown ? 'palette.fonts.foldFilters' : 'palette.fonts.showFilters')"
            :title="t(filtersShown ? 'palette.fonts.foldFilters' : 'palette.fonts.showFilters')"
            @click="toggleFilters"
        ><ArrowIcon shape="double" :size="10" :turn="filtersShown ? 180 : 0"/></button>
        <input v-model="filter" type="search" :placeholder="t('palette.fonts.filterPlaceholder')" :aria-label="t('palette.fonts.filterAria')">
        <button :title="t('palette.fonts.loadTitle')" @click="fileInput.click()">{{ t('palette.fonts.load') }}</button>
        <input ref="file" type="file" :accept="FONT_FILES" hidden @change="onFile">
      </div>
      <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
      <div class="list">
        <template v-for="g in groups" :key="g.key">
          <div v-if="g.key === 'inUse'" class="group"><span class="label">{{ g.label }}</span></div>
          <div v-else class="group">
            <button class="group-head" :aria-expanded="listOpen(g.key)" @click="foldList(g.key)">
              <svg class="chevron" viewBox="0 0 448 512" aria-hidden="true"><path d="M201.4 342.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 274.7 86.6 137.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>
              <span class="label">{{ g.label }}</span><span class="n"> · {{ g.rows.length }}</span>
            </button>
          </div>
          <div
              v-for="f in listOpen(g.key) ? g.rows : []"
              :key="f.id"
              class="row"
              :class="{ current: f.id === chosen?.id, active: f.id === workspace.displayFontSpec.id }"
              @click="chosenId = f.id"
          >
            <div class="name"><span>{{ f.name }}</span><em>{{ size(f) }}</em></div>
            <div v-if="linkedOf(f.id)" class="credit">{{ linkedOf(f.id).linked.credit }}</div>
            <div class="sample" :style="rowStyle(f)">{{ samples[f.id] ?? SAMPLE }}</div>
          </div>
        </template>
        <div class="group library-group">
          <button class="group-head" :aria-expanded="listOpen('library')" @click="foldList('library')">
            <svg class="chevron" viewBox="0 0 448 512" aria-hidden="true"><path d="M201.4 342.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 274.7 86.6 137.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>
            <span class="label">{{ libraryState === 'ready' ? t(narrowed ? 'palette.fonts.libraryFound' : 'palette.fonts.libraryCount', { n: matches.length }, matches.length) : t('palette.fonts.library') }}</span>
          </button>
        </div>
        <template v-if="listOpen('library')">
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
            <GlyphSample v-else :sample="e.sample" :height="e.height" :width="e.width" />
          </div>
          <button v-if="matches.length > shownCount" class="more" @click="shownCount += PAGE">{{ t('palette.fonts.showMore', { n: PAGE }) }}</button>
        </template>
        </template>
      </div>
    </div>

    <!-- the library's tags, left of the list where there's room (after the search in tab order) -->
    <aside v-if="showColumn" class="filters-side">
      <div class="filters-head">
        <span class="title">{{ t('palette.fonts.filters') }}</span>
        <button v-if="tags.length" class="clear-all" @click="clearTags">{{ t('palette.fonts.clearAll') }}</button>
      </div>
      <FontFilters v-model:closed="prefs.closed" :groups="tagList" :counts="counts" :picked="tags" @toggle="toggleTag" />
    </aside>
    <!-- the chosen font -->
    <div v-if="chosen" class="edit-side" :style="tileStyle">
      <div class="head">
        <span class="title">{{ chosen.name }}</span>
        <span class="meta">{{ meta }}</span>
        <span class="spacer"></span>
        <span class="more" @keydown.esc.stop="moreOpen = false">
          <button class="ghost" :title="t('palette.fonts.moreAria')" :aria-label="t('palette.fonts.moreAria')" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen">…</button>
          <span v-if="moreOpen" class="menu">
            <button :disabled="!count" @click="moreOpen = false; exportPalettes()">{{ t('palette.fonts.exportPalettes') }}</button>
            <button v-if="isInUse" @click="moreOpen = false; workspace.paletteLayerPage = 'palettes'">{{ t('palette.fonts.toPalettes') }}</button>
            <button v-if="bitmap && font?.blocks" :disabled="inRoom" :data-off-reason="inRoom ? '' : undefined" :title="inRoom ? t('palette.fonts.blocksInRoom') : t('palette.fonts.findBlocksTitle')" @click="moreOpen = false; setBlocks(undefined)">{{ t('palette.fonts.findBlocks') }}</button>
            <button v-if="isStored" :title="t('palette.fonts.removeTitle')" @click="moreOpen = false; forget()">{{ t('palette.fonts.remove') }}</button>
          </span>
        </span>
      </div>
      <div v-if="!isInUse" class="actions">
        <button class="ghost" :disabled="hostsFont || !!roomOff" :title="roomOff ?? undefined" :data-off-reason="roomOff ? '' : undefined" @click="apply">{{ t('palette.fonts.use') }}</button>
      </div>
      <template v-if="bitmap && font">
        <div v-if="widths.length" class="width-row">
          <span class="width-label">{{ t('palette.fonts.width') }}</span>
          <ToggleGroup
              class="width-switch"
              single
              :model-value="widthLit"
              :options="widthOptions"
              :label="t('palette.fonts.width')"
              @update:model-value="setWidth(+Object.keys($event).find((k) => $event[k]))"
          />
          <span v-if="widthNow < 8" class="width-note">{{ t('palette.fonts.widthNarrowNote', { width: widthNow }) }}</span>
        </div>
        <div class="sections" role="tablist" :aria-label="t('palette.fonts.sectionsAria')">
          <button v-for="s in sections" :key="s.key" role="tab" :class="{ on: section === s.key }" :aria-selected="section === s.key" @click="section = s.key">
            {{ s.label }} <span v-if="s.count !== undefined" class="count">{{ s.count }}</span>
          </button>
        </div>
        <FontBlocks
            v-if="section === 'blocks'"
            :font="font"
            :family="tileFamily || familyFor(chosen)"
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
            :family="tileFamily || familyFor(chosen)"
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
              @pointerdown="pressSlot($event, (e) => chosenZoom(e, i))"
              @pointerup="releaseSlot"
              @pointerleave="releaseSlot"
              @pointercancel="releaseSlot"
              @contextmenu.prevent
              @click="clickSlot($event, i)"
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
      <dl v-if="held" class="origin">
        <template v-for="l in originLines(held)" :key="l.label">
          <dt>{{ l.label }}</dt>
          <dd>{{ l.prefix }}<a v-if="l.href" :href="l.href" target="_blank" rel="noopener">{{ l.text }}</a><template v-else>{{ l.text }}</template></dd>
        </template>
      </dl>
    </div>
    <!-- a library font not in Yours -->
    <div v-else-if="libEntry" class="edit-side">
      <div class="head">
        <span class="title">{{ libEntry.name }}</span>
        <span class="meta">{{ libMeta(libEntry) }}</span>
      </div>
      <div class="actions">
        <template v-if="libEntry.linked">
          <a class="ghost button" :href="libEntry.linked.url" target="_blank" rel="noopener">{{ t('palette.fonts.getIt') }}<ArrowIcon shape="out" :size="12"/><span class="visually-hidden">{{ ' ' + t('common.newTab') }}</span></a>
          <button class="ghost" :title="t('palette.fonts.loadTitle')" @click="fileInput.click()">{{ t('palette.fonts.load') }}</button>
        </template>
        <template v-else>
          <button class="ghost primary" :disabled="fetching" @click="useFromLibrary">{{ t('palette.fonts.use') }}</button>
          <button class="ghost" :disabled="fetching" @click="keepFromLibrary">{{ t('palette.fonts.addToYours') }}</button>
        </template>
      </div>
      <div class="chips tag-chips">
        <button v-for="x in tagsOf(libEntry)" :key="x.key" class="chip" :title="tagLabel(x.key)" @click="pickTag(x.key)">{{ tagLabel(x.key) }}</button>
      </div>
      <template v-if="previewChars">
        <div class="grid sheet" :style="styleOf({ kind: 'bitmap', height: libEntry.height, family: preview.family })" @mouseleave="hovered = null">
          <span
              v-for="(c, i) in previewChars"
              :key="i"
              class="cell"
              @mouseenter="hovered = i"
              @pointerdown="pressSlot($event, (e) => zoom?.n !== i && showZoom(e, i, c, libFace))"
              @pointerup="releaseSlot"
              @pointerleave="releaseSlot"
              @pointercancel="releaseSlot"
              @contextmenu.prevent
              @click="pressedLong(i) || showZoom($event, i, c, libFace)"
          >{{ c === '␀' ? ' ' : c }}</span>
        </div>
        <div class="info">{{ hovered === null ? t('palette.fonts.slotHint') : t('palette.fonts.slot', { n: hovered, char: previewChars[hovered] }) }}</div>
      </template>
      <GlyphSample v-else-if="!libEntry.linked && previewFailed === libEntry.id" :sample="libEntry.sample" :height="libEntry.height" :width="libEntry.width" class="big" />
      <div v-else-if="!libEntry.linked" class="grid sheet"></div>
      <dl class="origin">
        <template v-for="l in originLines(libEntry)" :key="l.label">
          <dt>{{ l.label }}</dt>
          <dd>{{ l.prefix }}<a v-if="l.href" :href="l.href" target="_blank" rel="noopener">{{ l.text }}</a><template v-else>{{ l.text }}</template></dd>
        </template>
      </dl>
    </div>
    <GlyphZoom v-if="zoom" :key="zoom.n" :char="zoom.char" :family="zoom.family" :size="zoom.size" :cell="zoom.cell" :label="t('palette.fonts.slot', { n: zoom.n, char: zoom.char })" @close="zoomOut"/>
  </div>
</template>

<style scoped>
/* The list, row, head, meta, grid and actions styles every page shares are FloatingPanel's; these are the page's own. */
div.sample {
  overflow: hidden;
  white-space: nowrap;
  line-height: 1;
  color: var(--text);
}

/* The column's head and the search's row beside it, one height: the row's 34px controls, its padding and border. */
div.page.fonts div.top,
div.filters-head {
  flex-shrink: 0; /* in a short window the column below scrolls; the heads don't give way */
  box-sizing: border-box;
  height: 55px;
}

/* The double arrow beside the search, the size the typed « » it replaced was, in the middle of the row: a wide button,
   pulled into the row's padding and gap, so it's easy to hit and the arrow sits close to the edge and the search. */
div.top button.filters-toggle {
  display: flex;
  flex: none;
  align-items: center;
  margin: 0 -10px 0 -12px;
  padding: 0 8px;
  border: none;
  background: none;
  box-shadow: none;
  color: var(--text-muted);
}

div.top button.filters-toggle:hover {
  transform: none;
  background: none;
  color: var(--accent);
}

aside.filters-side {
  order: -1; /* left of the list, though after it in the page */
  display: flex;
  flex: 0 10 200px;
  flex-direction: column;
  min-width: 140px;
  overflow-y: auto;
  border-right: 1px solid var(--surface-3);
}

div.page.full aside.filters-side {
  flex-basis: 260px;
}

div.filters-sheet {
  position: fixed;
  inset: 0;
  z-index: 5001;
  display: flex;
  flex-direction: column;
  background: var(--surface-0);
}

div.filters-sheet .sheet-body {
  flex: 1;
  overflow-y: auto;
}

/* Its first line as a dialog's: the title 18px in, the close button (CloseButton) 6px inside the top right corner. */
div.filters-sheet div.filters-head {
  padding-right: 38px;
  padding-left: 18px;
}
div.filters-sheet h3.title {
  flex: 1;
  font-size: 16px;
}
div.filters-sheet button.close-sheet {
  position: absolute;
  top: 6px;
  right: 6px;
}

div.filters-sheet button.show {
  margin: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
  padding: 10px;
  border: none;
  border-radius: 6px;
  background: var(--accent);
  color: var(--surface-0);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

div.filters-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--surface-3);
}

div.filters-head span.title {
  flex: 1;
  font-weight: 600;
}

div.filters-head button:not(.close-sheet) { /* Clear all; the sheet's close button is CloseButton's own */
  padding: 2px 6px;
  border: none;
  background: none;
  color: var(--accent);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

div.filters-head button.fold {
  color: var(--text-muted);
  font-size: 14px;
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
  box-shadow: none;
  transition: color 0.3s ease; /* as the layer's own tabs: only the color changes on hover */
}

div.sections button[role='tab']:hover {
  transform: none;
  background: none;
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

div.width-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

span.width-label {
  color: var(--text-muted);
}

/* Under 8 wide, beside the switch: what exports will make of it. */
span.width-note {
  color: var(--warning);
}

span.count {
  color: var(--text-muted);
}

p.problem {
  margin: 0;
  padding: 6px 12px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--danger);
}

/* Short of room, the Filters column and the list (shrink weight 10) narrow ten times as fast as the details (1), which
   want 16 slots of 28px; once those two are at their least, the details take the rest. A tall Lines or Sets section
   scrolls the side, the sheet keeping a few rows. */
div.page.fonts:not(.phone) > div.edit-side {
  flex: 2 1 530px;
}

div.edit-side {
  overflow-y: auto;
  min-height: 0;
}

/* The 256 slots, 16 to a row as the font's sheet lays them out, framed as the Palettes page's glyph pane. A slot is never
   narrower than 28px or a little more than its glyph: past that the sheet scrolls across as well as down. */
div.grid.sheet {
  grid-template-columns: repeat(16, minmax(max(28px, 1.25em), 1fr));
  overflow: auto;
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
  -webkit-touch-callout: none; /* a long press is a closer look, not the phone's menu */
  user-select: none;
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

div.grid.sheet:not(.picking) span.cell {
  cursor: zoom-in;
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

div.tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 0;
}

div.tag-chips button.chip {
  padding: 2px 8px;
  border: 1px solid var(--surface-3);
  border-radius: 10px;
  background: var(--surface-1);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  max-width: 60px; /* one line each, cut short (the whole of it on hover) */
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

dl.origin {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 12px;
  margin: 0;
  padding: 6px 0;
  font-size: 12px;
}

dl.origin dt {
  color: var(--text-dim);
}

dl.origin dd {
  margin: 0;
}

dl.origin a {
  color: var(--accent);
}

canvas.big {
  margin: 8px 12px;
  zoom: 2;
}
</style>
