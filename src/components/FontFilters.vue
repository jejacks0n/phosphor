<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';

// The Fonts page's filters: the library's tags by group, each group folding under its header, each chip a toggle
// showing how many library fonts carry it. Machine has a finder and shows its ten biggest (picked ones first) until
// + N more shows them all by name. The page holds what's picked and which groups are folded.
const props = defineProps({
  groups: { type: Array, required: true }, // [{ group, tags: [{ key, label }] }], in order and sorted
  counts: { type: Map, required: true },
  picked: { type: Array, required: true },
  closed: { type: Array, required: true }, // the groups folded shut
});
const emit = defineEmits(['toggle', 'update:closed']);
const { t } = useI18n();

const TOP = 10;
const find = ref('');
const expanded = ref(false);
const isPicked = (key) => props.picked.includes(key);
const count = (key) => props.counts.get(key) ?? 0;
// Machine's chips: those the finder matches, all by name; else the picked first, then the biggest, ten in all.
const machines = (tags) => {
  const query = find.value.trim().toLowerCase();
  if (query) return { shown: tags.filter((x) => x.label.toLowerCase().includes(query)), more: 0 };
  if (expanded.value) return { shown: tags, more: 0 };
  const byName = (a, b) => a.label.localeCompare(b.label);
  const ranked = [
    ...tags.filter((x) => isPicked(x.key)).sort(byName),
    ...tags.filter((x) => !isPicked(x.key)).sort((a, b) => count(b.key) - count(a.key) || byName(a, b)),
  ];
  const n = Math.max(TOP, tags.filter((x) => isPicked(x.key)).length);
  return { shown: ranked.slice(0, n), more: Math.max(0, ranked.length - n) };
};
const rows = computed(() => props.groups.map((g) => {
  const picked = g.tags.filter((x) => isPicked(x.key)).length;
  const { shown, more } = g.group === 'machine' ? machines(g.tags) : { shown: g.tags, more: 0 };
  return { ...g, shown, more, open: !props.closed.includes(g.group), note: picked ? t('palette.fonts.groupPicked', { n: picked }, picked) : String(g.tags.length) };
}));
const fold = (group) => emit('update:closed', props.closed.includes(group) ? props.closed.filter((g) => g !== group) : [...props.closed, group]);
</script>

<template>
  <div class="font-filters">
    <section v-for="g in rows" :key="g.group" class="filter-group" :data-group="g.group">
      <button class="group-head" :aria-expanded="g.open" @click="fold(g.group)">
        <svg class="chevron" viewBox="0 0 448 512" aria-hidden="true"><path d="M201.4 342.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 274.7 86.6 137.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>
        <span class="name">{{ t(`palette.fonts.tagGroups.${g.group}`) }}</span>
        <span class="note">{{ g.note }}</span>
      </button>
      <template v-if="g.open">
        <input v-if="g.group === 'machine'" v-model="find" class="find" :placeholder="t('palette.fonts.findMachine')" :aria-label="t('palette.fonts.findMachine')">
        <div class="chips">
          <button
              v-for="x in g.shown"
              :key="x.key"
              class="chip"
              :class="{ picked: isPicked(x.key) }"
              :aria-pressed="isPicked(x.key)"
              :title="x.label"
              @click="emit('toggle', x.key)"
          ><span class="label">{{ x.label }}</span><span class="count">{{ count(x.key) }}</span></button>
          <button v-if="g.more" class="more" @click="expanded = true">{{ t('palette.fonts.moreTags', { n: g.more }) }}</button>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
section.filter-group {
  padding: 6px 12px;
}

button.group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 2px 0;
  border: none;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-align: left;
  cursor: pointer;
  box-shadow: none;
  transition: color 0.2s;
}

button.group-head:hover {
  transform: none;
  background: none;
  color: var(--text);
}

svg.chevron {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  fill: currentColor;
  transition: transform 0.15s;
}

button.group-head[aria-expanded='false'] svg.chevron {
  transform: rotate(-90deg);
}

span.note {
  margin-left: auto;
  text-transform: none;
  letter-spacing: 0;
}

input.find {
  box-sizing: border-box;
  width: 100%;
  margin: 4px 0;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 12px;
}

div.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

div.chips button {
  padding: 2px 8px;
  border: 1px solid var(--surface-3);
  border-radius: 10px;
  background: var(--surface-1);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

div.chips button.chip { /* one line: a long name is cut short, its count kept */
  display: inline-flex;
  gap: 4px;
  max-width: 100%;
  min-width: 0;
}

span.label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

div.chips button.picked {
  border-color: var(--accent);
}

div.chips button.more {
  border-color: transparent;
  background: none;
  color: var(--accent);
}

span.count {
  flex-shrink: 0;
  color: var(--text-muted);
}
</style>
