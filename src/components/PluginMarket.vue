<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePluginStore } from '@/store/PluginStore';
import { marketState, swatches } from '@/plugins/listing';

// The Plugins dialog's Marketplace tab (docs/plugins.md): the loaded list as cards, Official first, then by name,
// searched and filtered. Each card's button reads by what's installed with the same id (marketState); taking one is the
// dialog's (`take`, the entry), which reads its files and asks, the card saying Reading… meanwhile (`reading`, the ids
// being read). A manifest's words, its preview among them, are the author's, shown as text. Only the cards scroll; the
// words and the search above them stay. The search, the filter and where the cards were scrolled to are the store's
// (marketView), so they come back after a question (which takes this tab's place) and on the next visit to the tab.
const { reading } = defineProps({ reading: { type: Set, default: () => new Set() } });
const emit = defineEmits(['take']);
const { t } = useI18n();
const plugins = usePluginStore();

const view = plugins.marketView;
const cards = useTemplateRef('cards');
onMounted(() => nextTick(() => { if (cards.value) cards.value.scrollTop = view.scroll; }));
onBeforeUnmount(() => { view.scroll = cards.value?.scrollTop ?? 0; });
const FILTERS = {
  all: () => true,
  official: (entry) => entry.official,
  themes: (entry) => entry.manifest.themes.length > 0,
  scripts: (entry) => !!entry.manifest.script,
};

const shown = computed(() => {
  const words = view.search.trim().toLowerCase();
  const matches = ({ manifest: { name, author, description, id } }) => [name, author, description, id].some((field) => field.toLowerCase().includes(words));
  return plugins.market.entries.filter((entry) => FILTERS[view.filter](entry) && matches(entry))
    .sort((a, b) => b.official - a.official || a.manifest.name.localeCompare(b.manifest.name));
});

const state = (entry) => marketState(entry, plugins.plugins.find(({ id }) => id === entry.manifest.id));
const page = ({ manifest, repo }) => manifest.homepage || `https://github.com/${repo}`;
function adds({ themes, script }) {
  const count = themes.length ? t('plugins.themes', themes.length) : '';
  if (!script) return count;
  return count ? t('plugins.market.themesAndScript', { adds: count }) : t('plugins.market.script');
}
const nameId = (entry) => `market-${entry.manifest.id}`;
</script>

<template>
  <div class="market">
    <p class="intro">{{ t('plugins.market.intro') }}</p>
    <div class="find">
      <input v-model="view.search" type="search" :placeholder="t('plugins.market.search')" :aria-label="t('plugins.market.search')">
      <select v-model="view.filter" :aria-label="t('plugins.market.show')">
        <option v-for="(_, id) in FILTERS" :key="id" :value="id">{{ t(`plugins.market.${id}`) }}</option>
      </select>
    </div>

    <div v-if="plugins.market.status === 'failed'" class="none">
      <p role="alert">{{ t(plugins.market.reason === 'newer' ? 'plugins.errors.listNewer' : 'plugins.errors.listUnavailable') }}</p>
      <button type="button" @click="plugins.loadMarket({ again: true })">{{ t('plugins.market.tryAgain') }}</button>
    </div>
    <p v-else-if="plugins.market.status !== 'ready'" class="none">{{ t('plugins.market.loading') }}</p>
    <p v-else-if="!shown.length" class="none">{{ t('plugins.market.none') }}</p>

    <ul v-if="shown.length" ref="cards" class="cards">
      <li v-for="entry in shown" :key="entry.manifest.id" class="card">
        <div v-if="entry.manifest.preview" class="art preview" aria-hidden="true">{{ entry.manifest.preview }}</div>
        <div v-else class="art" aria-hidden="true">
          <i v-for="(color, i) in swatches(entry.manifest)" :key="i" :style="{ background: color }"/>
        </div>
        <div class="in">
          <div class="head">
            <a :id="nameId(entry)" class="name" :href="page(entry)" target="_blank" rel="noopener noreferrer">{{ entry.manifest.name }}</a>
            <span class="version">{{ entry.manifest.version }}</span>
            <span v-if="entry.official" class="badge">{{ t('plugins.official') }}</span>
            <span v-else class="author">{{ t('plugins.by', { author: entry.manifest.author }) }}</span>
          </div>
          <p v-if="entry.manifest.description" class="description" :title="entry.manifest.description">{{ entry.manifest.description }}</p>
          <div class="foot">
            <span>{{ adds(entry.manifest) }}</span>
            <button
                type="button"
                :class="{ primary: ['install', 'update'].includes(state(entry)) }"
                :disabled="state(entry) === 'installed' || reading.has(entry.manifest.id)"
                :aria-describedby="nameId(entry)"
                @click="emit('take', entry)"
            >{{ reading.has(entry.manifest.id) ? t('plugins.market.reading') : t(`plugins.market.${state(entry)}`) }}</button>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
div.market {   /* a column in the dialog's tab panel, the cards taking what's left (PluginsDialog) */
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

div.find {
  display: flex;
  gap: 8px;
  margin: 0 0 12px;
}
div.find input {
  flex: 1;
  min-width: 0;
}
div.find select {
  flex: none;
  width: auto;
}

.none {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}
div.none p {
  margin: 0;
}
div.none button {
  padding: 4px 12px;
}

ul.cards {
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  grid-auto-rows: max-content; /* a card hides its overflow, so rows would otherwise squeeze to fit instead of scroll */
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
li.card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-1);
  font-size: 13px;
}

div.art {
  display: flex;
  height: 64px;
  flex: none;
  background: var(--surface-2);
}
div.art i {
  flex: 1;
}
div.art.preview {   /* the author's characters, as a drawing shows them */
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--black);
  color: var(--accent);
  font: 15px/1.05 'JetBrains Mono', monospace;
  letter-spacing: 1px;
  white-space: pre;
}

div.in {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
}
div.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
}
a.name {
  min-width: 0;
  font-weight: 600;
  color: var(--text);
  text-decoration: none;
  overflow-wrap: anywhere;
}
a.name:hover {
  color: var(--accent);
  text-decoration: underline;
}
span.version, span.author {
  font-size: 12px;
  color: var(--text-muted);
}
span.badge {   /* as the Installed rows' */
  align-self: center;
  padding: 1px 5px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}
p.description {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  line-height: 1.45;
  color: var(--text-dim);
  overflow-wrap: anywhere;
}
div.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
  font-size: 12px;
  color: var(--text-muted);
}
div.foot button {
  flex: none;
  padding: 4px 12px;
}
</style>
