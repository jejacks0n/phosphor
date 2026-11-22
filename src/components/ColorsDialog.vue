<script setup>
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ModalDialog from '@/components/ModalDialog.vue';
import { useProjectStore } from '@/store/ProjectStore';
import { SHIPPED, useColorLibraryStore } from '@/store/ColorLibraryStore';
import { useSettingsLock } from '@/composables/useSettingsLock';
import { hexFile, listColors, sameColors, writeList } from '@/lib/colorList';
import { getPalette, pageOf, slugOf } from '@/lib/lospec';
import { desktop } from '@/social/desktop';
import { downloadBlob } from '@/document/projectIO';

// The Colors dialog (docs/layers.md), from Browse ▸ beside Color palette: two tabs, Library (the palettes Phosphor ships
// with, SHIPPED) and Favorites (the ones starred, ColorLibraryStore), as the Marketplace's cards (cards.css) with the
// palette's colors as the band, searched by name or author. Use makes a palette the drawing's Custom color list and the
// dialog stays; the card whose colors are the list, in its order, says In use. Put back is a line at the dialog's foot,
// not a toast: the page under a modal dialog is inert, a toast's button with it. It brings back the Color palette choice
// and the list as they were before the first Use, however many were tried since, and what it would bring back is
// forgotten when the dialog closes or another drawing opens (a desktop window's start screen opening a file), so it
// never writes one drawing's choice and list onto another. A lock can arrive while the dialog is up (someone joins the
// room): Use and Put back are off then, with the settings column's reason. Under the Library's search, Get from Lospec
// asks Lospec for one palette by name or link, the dialog's only request, and keeps it under Favorites, which it then
// shows; it changes nothing of the drawing, so a lock doesn't stop it.
const emit = defineEmits(['close']);
const { t } = useI18n();
const project = useProjectStore();
const library = useColorLibraryStore();
const locked = useSettingsLock();

const tab = ref('library');
const tabs = computed(() => [
  { key: 'library', label: t('colorsDialog.library'), id: 'colors-tab-library', controls: 'colors-panel-library' },
  { key: 'favorites', label: t('colorsDialog.favorites'), count: library.kept.length, id: 'colors-tab-favorites', controls: 'colors-panel-favorites' },
]);

const search = ref('');
const shown = computed(() => {
  const words = search.value.trim().toLowerCase();
  return (tab.value === 'library' ? SHIPPED : library.kept).filter(({ name, author }) => [name, author].some((field) => field.toLowerCase().includes(words)));
});

const listed = computed(() => (project.quantize === 'palette' ? listColors(project.palette) : null));
const inUse = ({ colors }) => !!listed.value && sameColors(listed.value, colors);
const nameId = ({ slug }) => `colors-${slug}`;

// A press that takes its own button away (Use turning to In use, Put back's line, a favorite's ★ on Favorites) leaves
// focus on nothing, and keys would then reach the page: focus goes to the dialog's body, as when it opened.
const root = useTemplateRef('root');
async function keepFocus() {
  await nextTick();
  const focused = document.activeElement;
  if (!root.value?.contains(focused) || focused.disabled) root.value?.closest('div.body')?.focus();
}

const before = ref(null); // { quantize, palette } as they were before the first Use, until Put back
watch(() => project.documentId, () => { before.value = null; });
function use({ colors }) {
  if (locked.value) return;
  before.value ??= { quantize: project.quantize, palette: project.palette };
  project.palette = writeList(colors); // the list first, so the choice never shows the old one
  project.quantize = 'palette';
  keepFocus();
}
function putBack() {
  if (locked.value || !before.value) return;
  project.quantize = before.value.quantize; // the choice first, so the old list never shows as the new one
  project.palette = before.value.palette;
  before.value = null;
  keepFocus();
}

function star(palette) {
  library.toggle(palette);
  keepFocus();
}
// Get from Lospec: what's typed is made a slug here (slugOf), and only a slug is asked for: of lospec.com on the web, of
// the main process in the desktop app, whose page reaches nothing but rooms. A failure this doesn't know reads as Lospec
// out of reach, and a failure shows the Library, where the form and its message are (the person may have gone to
// Favorites while it waited). `cut` is the palette just got when Lospec's had more than 256 colors, for the note on
// Favorites: what's kept doesn't remember how many there were.
const FAILURES = ['notFound', 'unreachable', 'notPalette'];
const typed = ref('');
const getting = ref(false);
const problem = ref('');
const cut = ref(null); // { slug, of }
async function get() {
  if (getting.value) return;
  const slug = slugOf(typed.value);
  if (!slug) {
    problem.value = t('colorsDialog.errors.noName');
    return;
  }
  problem.value = '';
  getting.value = true;
  try {
    const asks = import.meta.env.VITE_DESKTOP === '1' ? { ask: (s) => desktop.lospecPalette(s) } : {};
    const palette = await getPalette(slug, asks);
    library.keep(palette);
    cut.value = palette.of ? { slug, of: palette.of } : null;
    typed.value = '';
    search.value = ''; // so it shows, first
    tab.value = 'favorites';
    // The form is gone with the Library: focus goes to the kept card's Use, else where keepFocus puts it.
    await nextTick();
    root.value?.querySelector(`#${nameId(palette)}`)?.closest('li')?.querySelector('button.use:not(:disabled)')?.focus();
    keepFocus();
  } catch (error) {
    problem.value = t(`colorsDialog.errors.${FAILURES.includes(error.message) ? error.message : 'unreachable'}`, { name: slug });
    tab.value = 'library';
    keepFocus();
  } finally {
    getting.value = false;
  }
}

const save = ({ slug, colors }) => downloadBlob(new Blob([hexFile(colors)], { type: 'text/plain' }), `${slug}.hex`);
</script>

<template>
  <ModalDialog v-model:tab="tab" :label="t('colorsDialog.title')" :tabs="tabs" wide tall :focus="false" closable @cancel="emit('close')">
    <div ref="root" class="colors">
      <div :id="`colors-panel-${tab}`" role="tabpanel" :aria-labelledby="`colors-tab-${tab}`">
        <p class="intro">{{ t(tab === 'library' ? 'colorsDialog.libraryIntro' : 'colorsDialog.favoritesIntro') }}</p>
        <input v-model="search" type="search" class="search" :placeholder="t('colorsDialog.search')" :aria-label="t('colorsDialog.search')">
        <template v-if="tab === 'library'">
          <form class="get" @submit.prevent="get">
            <span>{{ t('colorsDialog.notHere') }}</span>
            <input v-model="typed" type="text" class="get-name" :placeholder="t('colorsDialog.getPlaceholder')" :aria-label="t('colorsDialog.getPlaceholder')">
            <button type="submit">{{ getting ? t('colorsDialog.getting') : t('colorsDialog.get') }}</button>
          </form>
          <p v-if="problem" class="get-problem" role="alert">{{ problem }}</p>
        </template>
        <p v-else-if="cut && library.has(cut.slug)" class="get-note" role="status">{{ t('colorsDialog.cut', { n: cut.of }) }}</p>

        <ul v-if="shown.length" class="cards">
          <li v-for="palette in shown" :key="palette.slug" class="card">
            <div class="art" aria-hidden="true">
              <i v-for="(color, i) in palette.colors" :key="i" :style="{ background: color }"/>
            </div>
            <div class="in">
              <div class="head">
                <a :id="nameId(palette)" class="name" :href="pageOf(palette.slug)" target="_blank" rel="noopener noreferrer">{{ palette.name }}</a>
                <span class="author">{{ palette.author ? t('colorsDialog.by', { author: palette.author }) : t('colorsDialog.onLospec') }}</span>
              </div>
              <div class="foot">
                <span>{{ t('colorsDialog.colors', palette.colors.length) }}</span>
                <button type="button" class="hex" :aria-label="t('colorsDialog.hexAria', { name: palette.name })" @click="save(palette)">{{ t('colorsDialog.hex') }}</button>
                <button
                    type="button"
                    class="star"
                    :aria-pressed="library.has(palette.slug) ? 'true' : 'false'"
                    :aria-label="t('colorsDialog.star', { name: palette.name })"
                    :title="t('colorsDialog.star', { name: palette.name })"
                    @click="star(palette)"
                >★</button>
                <button
                    type="button"
                    class="use"
                    :disabled="inUse(palette) || !!locked"
                    :title="locked"
                    :data-off-reason="locked ? '' : undefined"
                    :aria-describedby="nameId(palette)"
                    @click="use(palette)"
                >{{ inUse(palette) ? t('colorsDialog.inUse') : t('colorsDialog.use') }}</button>
              </div>
            </div>
          </li>
        </ul>
        <p v-else class="none">{{ tab === 'favorites' && !library.kept.length ? t('colorsDialog.favoritesEmpty') : t('colorsDialog.none') }}</p>
      </div>

      <p v-if="before" class="put-back" role="status">
        {{ t('colorsDialog.replaced') }}
        <button type="button" :disabled="!!locked" :title="locked" :data-off-reason="locked ? '' : undefined" @click="putBack">{{ t('colorsDialog.putBack') }}</button>
      </p>
    </div>
  </ModalDialog>
</template>

<style scoped src="./cards.css"></style>
<style scoped>
/* Only the cards scroll: the tabs, the words, the search and Put back's line stay. As the Plugins dialog's, each column
   down to the cards may shrink (min-height: 0) and the cards take the rest. */
div.colors, div[role='tabpanel'] {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

p.intro {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-muted);
}
input.search {
  flex: none;
  margin: 0 0 12px;
}
/* Not here? [field] [Get from Lospec] on one line, the field taking the room; in a narrow window the button wraps under. */
form.get {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-muted);
}
input.get-name {
  flex: 1 1 12em;
  min-width: 0;
}
form.get button {
  padding: 4px 12px;
}
p.get-problem, p.get-note {
  flex: none;
  margin: -4px 0 12px;
  font-size: 13px;
  line-height: 1.45;
}
p.get-problem {
  color: var(--danger);
}
p.get-note {
  color: var(--text-muted);
}
p.none {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

/* The count, then .hex, ★ and Use at the right; they wrap under it in a narrow card. */
div.foot {
  flex-wrap: wrap;
  justify-content: flex-end;
}
div.foot span {
  margin-right: auto;
}
div.foot button {
  padding: 4px 10px;
}
button.star[aria-pressed='true'] {
  border-color: var(--accent);
  color: var(--accent);
}

p.put-back {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 12px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  font-size: 13px;
  color: var(--text-muted);
}
p.put-back button {
  padding: 4px 12px;
}
</style>
