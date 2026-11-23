<script setup>
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLocalStorage } from '@vueuse/core';
import { useProjectStore } from '@/store/ProjectStore';
import { SHIPPED, useColorLibraryStore } from '@/store/ColorLibraryStore';
import { useSettingsLock } from '@/composables/useSettingsLock';
import { choicePalette, hexFile, listColors, sameColors, writeList } from '@/lib/colorList';
import { getPalette, pageOf, slugOf } from '@/lib/lospec';
import { desktop } from '@/social/desktop';
import { downloadBlob } from '@/document/projectIO';
import ArrowIcon from '@/components/ArrowIcon.vue';
import ColorList from '@/components/ColorList.vue';

// The color layer's Palettes page (docs/layers.md), laid out as the Fonts page: on the left one list, This drawing (New
// drawings with none open: the settings the next one starts with), Favorites (the palettes starred, ColorLibraryStore)
// and Library (the ones Phosphor ships with, SHIPPED), Favorites and Library searched by name or author; on the right the
// row chosen. Choosing only shows a palette: Use this palette makes it the drawing's Custom color list, and its button
// says In use while its colors are the list, in its order. Put back is a line at the details' foot. It brings back the
// Color palette choice and the list as they were before the first Use, however many were tried since, and what it would
// bring back is forgotten when the layer closes, when another drawing replaces this one while the toolbar stays mounted,
// or when the list is edited by hand, so it never writes one drawing's choice and list onto another or over an edit. With the Custom color list chosen,
// This drawing is the list's editor (ColorList); with any other choice it shows the colors and Edit as a Custom color
// list makes them the list. A lock can arrive while the page is open (someone joins the room): Use, Put back and the
// editor are off then, with the settings column's reason. At the list's foot, Get
// from Lospec asks Lospec for one palette by name or link, the page's only request, keeps it under Favorites and
// chooses it; it changes nothing of the drawing, so a lock doesn't stop it.
const emit = defineEmits(['acted']); // a press that may have taken its own button away
const { t } = useI18n();
const project = useProjectStore();
const library = useColorLibraryStore();
const locked = useSettingsLock();
const page = useTemplateRef('page');

// This drawing's colors: VGA's or CGA's, the Custom color list, Limited count's current ones (none without a picture),
// and for Full color no list at all (null). Only Limited count's are read from the render (activePalette): with no
// drawing open there is none, but the next drawing's VGA, CGA or list are known.
const drawingColors = computed(() => {
  if (project.quantize === 'count') return (project.activePalette ?? []).map((p) => p.hex.toLowerCase());
  return choicePalette(project)?.map((p) => p.hex.toLowerCase()) ?? null;
});
// This drawing's row id: not a slug, which is only letters, digits and hyphens, so no palette's can be it.
const DRAWING = ':drawing';
const choiceName = computed(() => t(`panel.quantize.${project.quantize}`));

const search = ref('');
const matching = (list) => {
  const words = search.value.trim().toLowerCase();
  return list.filter(({ name, author }) => [name, author].some((field) => field.toLowerCase().includes(words)));
};
// Favorites and Library fold on their titles, as the Fonts page's groups do (This drawing, like In use there, never
// folds), and stay folded in this browser.
const folds = useLocalStorage('phosphor.paletteGroups', []);
const open = (key) => key === 'drawing' || !folds.value.includes(key);
const fold = (key) => { folds.value = open(key) ? [...folds.value, key] : folds.value.filter((k) => k !== key); };
// The rows in the list's order, each with its group and its place on screen; a folded group has none. A favorite from
// the Library is two rows, so the arrow keys step from the group it was chosen in.
const groups = computed(() => {
  let at = 0;
  const rowsOf = (group, list) => (open(group) ? list.map((palette) => ({ id: palette.slug, group, palette, at: at++ })) : []);
  return [
    { key: 'drawing', label: t(project.image ? 'colorPalettes.thisDrawing' : 'colorPalettes.newDrawings'), rows: [{ id: DRAWING, group: 'drawing', at: at++ }] },
    { key: 'favorites', label: t('colorPalettes.favorites', { n: library.kept.length }), rows: rowsOf('favorites', matching(library.kept)) },
    { key: 'library', label: t('colorPalettes.library', { n: SHIPPED.length }), rows: rowsOf('library', matching(SHIPPED)) },
  ];
});
const rows = computed(() => groups.value.flatMap((g) => g.rows));
const nothingMatches = computed(() => !!search.value.trim() && !matching(library.kept).length && !matching(SHIPPED).length);

const chosen = ref(DRAWING); // DRAWING or a palette's slug
const chosenIn = ref('drawing'); // the group it was chosen in
const choose = ({ id, group }) => {
  chosen.value = id;
  chosenIn.value = group;
};
const palette = computed(() => (chosen.value === DRAWING ? null : library.kept.find((p) => p.slug === chosen.value) ?? SHIPPED.find((p) => p.slug === chosen.value) ?? null));
// A palette got from Lospec and taken out of Favorites is in neither list any more: This drawing shows instead.
watch(palette, (shown) => {
  if (!shown) choose({ id: DRAWING, group: 'drawing' });
});
// The next or previous row on screen (the layer passes its arrow keys here), from the row chosen; one the search hides
// steps from the top.
const step = (delta) => {
  const list = rows.value;
  const at = list.findIndex((r) => r.id === chosen.value && r.group === chosenIn.value);
  const from = at >= 0 ? at : list.findIndex((r) => r.id === chosen.value);
  const next = list[Math.max(0, Math.min(list.length - 1, from + delta))];
  choose(next);
  nextTick(() => page.value?.querySelectorAll('div.list > div.row')[next.at]?.scrollIntoView({ block: 'nearest' }));
};
defineExpose({ step });

const listed = computed(() => (project.quantize === 'palette' ? listColors(project.palette) : null));
const inUse = ({ colors }) => !!listed.value && sameColors(listed.value, colors);
const metaOf = ({ colors, author }) => `${t('colorPalettes.colors', colors.length)} · ${author ? t('colorPalettes.by', { author }) : t('colorPalettes.onLospec')}`;

const before = ref(null); // { quantize, palette } as they were before the first Use, until Put back
watch(() => project.documentId, () => { before.value = null; });
watch(locked, (why) => { if (why) emit('acted'); }); // the control focused is off now, and the keys go with it
function use(colors) {
  if (locked.value) return;
  before.value ??= { quantize: project.quantize, palette: project.palette };
  project.palette = writeList(colors); // the list first, so the choice never shows the old one
  project.quantize = 'palette';
  emit('acted');
}
// Edit as a Custom color list: this drawing's colors as they show here (Full color's are the list kept), made the list.
const canEdit = computed(() => !locked.value && !(project.quantize === 'count' && !drawingColors.value?.length));
const editAsList = () => use(drawingColors.value ?? listColors(project.palette));
// A hand edit of the list (typed, picked, moved, imported, put back by its toast) is the person's own, so what Put back
// would bring back is theirs to keep: it ends Put back. A lock stops it, as it stops everything of the settings.
const edited = (text) => {
  emit('acted'); // the import toast's Put back may have been pressed: its button isn't the layer's
  if (locked.value) return;
  before.value = null;
  project.palette = text;
};
function putBack() {
  if (locked.value || !before.value) return;
  project.quantize = before.value.quantize; // the choice first, so the old list never shows as the new one
  project.palette = before.value.palette;
  before.value = null;
  emit('acted');
}

function star(chosenPalette) {
  library.toggle(chosenPalette);
  emit('acted');
}
// Get from Lospec: what's typed is made a slug here (slugOf), and only a slug is asked for: of lospec.com on the web, of
// the main process in the desktop app, whose page reaches nothing but rooms. A failure this doesn't know reads as Lospec
// out of reach. `cut` is the palette just got when Lospec's had more than 256 colors, for the note under the field:
// what's kept doesn't remember how many there were.
const FAILURES = ['notFound', 'unreachable', 'notPalette'];
const typed = ref('');
const getting = ref(false);
const problem = ref('');
const cut = ref(null); // { slug, of }
async function get() {
  if (getting.value) return;
  const slug = slugOf(typed.value);
  if (!slug) {
    problem.value = t('colorPalettes.errors.noName');
    return;
  }
  problem.value = '';
  getting.value = true;
  try {
    const asks = import.meta.env.VITE_DESKTOP === '1' ? { ask: (s) => desktop.lospecPalette(s) } : {};
    const got = await getPalette(slug, asks);
    library.keep(got);
    cut.value = got.of ? { slug, of: got.of } : null;
    typed.value = '';
    search.value = ''; // so it shows
    folds.value = folds.value.filter((k) => k !== 'favorites');
    choose({ id: got.slug, group: 'favorites' });
    await nextTick();
    page.value?.querySelector('div.list > div.row.current')?.scrollIntoView({ block: 'nearest' });
  } catch (error) {
    problem.value = t(`colorPalettes.errors.${FAILURES.includes(error.message) ? error.message : 'unreachable'}`, { name: slug });
  } finally {
    getting.value = false;
  }
}

const save = ({ slug, colors }) => downloadBlob(new Blob([hexFile(colors)], { type: 'text/plain' }), `${slug}.hex`);
</script>

<template>
  <div ref="page" class="page colors-palettes">
    <!-- the list: choose a palette to see it (or with the arrow keys) -->
    <div class="list-side">
      <div class="top">
        <input v-model="search" type="search" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search" :placeholder="t('colorPalettes.search')" :aria-label="t('colorPalettes.search')">
      </div>
      <div class="list">
        <template v-for="g in groups" :key="g.key">
          <div v-if="g.key === 'drawing'" class="group"><span class="label">{{ g.label }}</span></div>
          <div v-else class="group">
            <button class="group-head" :aria-expanded="open(g.key)" @click="fold(g.key)">
              <svg class="chevron" viewBox="0 0 448 512" aria-hidden="true"><path d="M201.4 342.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 274.7 86.6 137.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>
              <span class="label">{{ g.label }}</span>
            </button>
          </div>
          <p v-if="g.key === 'favorites' && open(g.key) && !library.kept.length" class="empty">{{ t('colorPalettes.favoritesEmpty') }}</p>
          <div v-for="r in g.rows" :key="r.id" class="row" :class="{ current: r.id === chosen && g.key === chosenIn }" @click="choose(r)">
            <template v-if="r.palette">
              <div class="name"><span>{{ r.palette.name }}</span><em :title="r.palette.author || undefined">{{ r.palette.author }}</em></div>
              <div class="strip" aria-hidden="true"><i v-for="(color, i) in r.palette.colors" :key="i" :style="{ background: color }"></i></div>
            </template>
            <template v-else>
              <div class="name"><span>{{ choiceName }}</span></div>
              <div v-if="drawingColors?.length" class="strip" aria-hidden="true"><i v-for="(color, i) in drawingColors" :key="i" :style="{ background: color }"></i></div>
            </template>
          </div>
        </template>
        <p v-if="nothingMatches" class="none">{{ t('colorPalettes.none') }}</p>
      </div>
      <form class="get" @submit.prevent="get">
        <span>{{ t('colorPalettes.notHere') }}</span>
        <input v-model="typed" type="text" class="get-name" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" enterkeyhint="go" :placeholder="t('colorPalettes.getPlaceholder')" :aria-label="t('colorPalettes.getPlaceholder')">
        <button type="submit" class="search" :aria-busy="getting" :aria-label="getting ? t('colorPalettes.getting') : t('colorPalettes.get')" :title="getting ? t('colorPalettes.getting') : t('colorPalettes.get')">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>
        </button>
      </form>
      <p v-if="problem" class="get-problem" role="alert">{{ problem }}</p>
      <p v-else-if="cut && library.has(cut.slug)" class="get-note" role="status">{{ t('colorPalettes.cut', { n: cut.of }) }}</p>
    </div>

    <!-- the row chosen -->
    <div class="edit-side">
      <p v-if="locked" class="locked">{{ locked }}</p>
      <template v-if="palette">
        <div class="head">
          <span class="title">{{ palette.name }}</span>
          <span class="meta">{{ metaOf(palette) }}</span>
        </div>
        <div class="actions">
          <button
              type="button"
              class="ghost use"
              :disabled="inUse(palette) || !!locked"
              :title="locked ?? undefined"
              :data-off-reason="locked ? '' : undefined"
              @click="use(palette.colors)"
          >{{ inUse(palette) ? t('colorPalettes.inUse') : t('colorPalettes.use') }}</button>
          <button type="button" class="ghost star" :aria-pressed="library.has(palette.slug) ? 'true' : 'false'" @click="star(palette)"><span aria-hidden="true">{{ library.has(palette.slug) ? '★' : '☆' }}</span> {{ t('colorPalettes.favorite') }}</button>
          <button type="button" class="ghost save" @click="save(palette)">{{ t('colorPalettes.saveHex') }}</button>
          <a class="ghost button lospec" :href="pageOf(palette.slug)" target="_blank" rel="noopener noreferrer">{{ t('colorPalettes.lospecPage') }}<ArrowIcon shape="out" :size="12"/><span class="visually-hidden">{{ ' ' + t('common.newTab') }}</span></a>
        </div>
        <div class="swatches">
          <div v-for="(color, i) in palette.colors" :key="i" class="swatch"><i :style="{ background: color }"></i><span>{{ color }}</span></div>
        </div>
        <p class="use-note">{{ t('colorPalettes.useNote') }}</p>
      </template>
      <!-- One editor per drawing, so its toast's Put back never reaches another (keyed by the document). -->
      <ColorList
          v-else-if="project.quantize === 'palette'"
          :key="project.documentId ?? ''"
          :model-value="project.palette"
          :name="project.filename ?? ''"
          :disabled="!!locked"
          @update:model-value="edited"
          @picking="project._colorPick = $event"
      />
      <template v-else>
        <div class="head">
          <span class="title">{{ choiceName }}</span>
          <span v-if="drawingColors?.length" class="meta">{{ t('colorPalettes.colors', drawingColors.length) }}</span>
        </div>
        <div class="actions">
          <button
              type="button"
              class="ghost edit"
              :disabled="!canEdit"
              :title="locked ?? undefined"
              :data-off-reason="locked ? '' : undefined"
              @click="editAsList"
          >{{ t('colorPalettes.editAsList') }}</button>
        </div>
        <div v-if="drawingColors?.length" class="swatches">
          <div v-for="(color, i) in drawingColors" :key="i" class="swatch"><i :style="{ background: color }"></i><span>{{ color }}</span></div>
        </div>
        <p v-else-if="!drawingColors" class="full-color">{{ t('colorPalettes.fullColor') }}</p>
      </template>
      <p v-if="before" class="put-back" role="status">
        {{ t('colorPalettes.replaced') }}
        <button type="button" :disabled="!!locked" :title="locked ?? undefined" :data-off-reason="locked ? '' : undefined" @click="putBack">{{ t('colorPalettes.putBack') }}</button>
      </p>
    </div>
  </div>
</template>

<style scoped>
/* The list, row, head, meta and actions styles every page shares are FloatingPanel's; these are the page's own. */

/* A palette's colors as a band under its name, every one however many (VGA's 256 too), never past the row. */
div.strip {
  display: flex;
  height: 10px;
  margin-top: 2px;
  border-radius: 2px;
  overflow: hidden;
}

div.strip > i {
  flex: 1 1 0;
  min-width: 0;
}

p.empty,
p.none {
  margin: 0;
  padding: 6px 12px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-muted);
}

/* A palette's name keeps its line; a long author gives way first, cut short with its whole name in the tooltip. */
div.colors-palettes div.name {
  gap: 8px;
}

div.colors-palettes div.name > span,
div.colors-palettes div.name > em {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

div.colors-palettes div.name > span {
  flex: none;
  max-width: 100%; /* only a name longer than the whole row is cut */
}

/* Searching Lospec at the list's foot: "Not here? Search Lospec." on its line, then [field] [search]. */
form.get {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--surface-3);
  font-size: 12px;
  color: var(--text-muted);
}

form.get input {
  flex: 1 1 8em;
  box-sizing: border-box;
  min-width: 0;
  height: 30px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
}

form.get > span {
  flex: 1 0 100%;
}

form.get button.search {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
}

form.get button.search svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
}

p.get-problem,
p.get-note {
  flex: none;
  margin: 0;
  padding: 0 12px 10px;
  font-size: 12px;
  line-height: 1.4;
}

p.get-problem {
  color: var(--danger);
}

p.get-note {
  color: var(--text-muted);
}

/* VGA's 256 colors, or a long list, scroll inside the details. */
div.colors-palettes > div.edit-side {
  overflow-y: auto;
  min-height: 0;
}

p.locked,
p.use-note,
p.full-color {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-muted);
}

button.star[aria-pressed='true'] span {
  color: var(--accent);
}

/* A palette's colors large, each with its hex under it. Read-only here; This drawing's editor (ColorList) lays out its
   own swatches by the same rule, so they reach into it. */
div.colors-palettes :deep(div.swatches) {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 8px 6px;
}

div.colors-palettes :deep(div.swatch) {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

div.colors-palettes :deep(div.swatch > i) {
  aspect-ratio: 3 / 2;
  border: 1px solid var(--border-light);
  border-radius: 3px;
}

div.colors-palettes :deep(div.swatch > span) {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  text-align: center;
  color: var(--text-muted);
}

p.put-back {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 0;
  padding-top: 10px;
  border-top: 1px solid var(--surface-3);
  font-size: 12px;
  color: var(--text-muted);
}

p.put-back button {
  padding: 4px 12px;
}
</style>
