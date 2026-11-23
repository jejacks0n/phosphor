<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { blocksOf, droppedSlot, BLOCKS } from '@/lib/BitmapFont';
import { TRASH } from '@/components/icons';
import { PIECES, lineStylesOf, nextId } from '@/lib/FontLines';

// The Fonts page's Lines section: Single and Double with their Hide switches, then the font's own line styles as cards
// of eleven tiles. A tile is picked here; the page passes a click on the sheet to slot(n), which sets that piece.
const props = defineProps({
  font: { type: Object, required: true }, // { name, height, bytes, blocks?, lines? }
  family: { type: String, required: true }, // the CSS font family it draws in
  picked: { type: Object, default: null }, // { style, piece }: the piece a click on the sheet sets
  disabled: { type: Boolean, default: false },
  reason: { type: String, default: '' }, // why it's disabled
});
const emit = defineEmits(['pick', 'change', 'removed']); // removed: { entry, at }, a style deleted and where it was
const { t } = useI18n();

const SAMPLE = '┌─┬─┐ ├─┼─┤ └─┴─┘';
const lines = computed(() => props.font.lines ?? { hide: [], styles: [] });
const all = computed(() => lineStylesOf(props.font));
const stock = computed(() => all.value.filter((s) => s.stock));
const own = computed(() => all.value.filter((s) => !s.stock));
const refused = ref(null); // { n, block } or { n, piece }: a slot last clicked for a piece that a block, or another piece of the style, has
watch(() => props.picked, () => { refused.value = null; });

const blockName = (key) => t(`palette.fonts.blockName.${key}`);
const sample = (s) => [...SAMPLE].map((c) => (PIECES.includes(c) ? s.chars[PIECES.indexOf(c)] ?? ' ' : c)).join('');
const problemAt = (s, piece) => s.problems.find((p) => p.piece === piece);
const shares = (s, p) => t('palette.fonts.lineSharesBlock', { piece: PIECES[p.piece], n: s.slots[p.piece], block: blockName(p.block) });
// What stops a style being offered under Draw with, or that it is.
const status = (s) => {
  const block = s.problems.find((p) => p.reason === 'block');
  if (block) return shares(s, block);
  const missing = s.problems.length;
  return missing ? t('palette.fonts.lineToGo') : t('palette.fonts.lineOffered');
};
const isPicked = (s, piece) => props.picked?.style === s.id && props.picked.piece === piece;
// Only a refused slot says anything under the styles.
const note = computed(() => {
  const no = refused.value;
  return no && (no.block ? t('palette.fonts.lineBlockSlot', { n: no.n, block: blockName(no.block) }) : t('palette.fonts.lineSlotTaken', { n: no.n, piece: PIECES[no.piece] }));
});

const change = (styles, hide = lines.value.hide) => emit('change', { hide, styles });
const toggleHide = (id) => change(lines.value.styles, lines.value.hide.includes(id) ? lines.value.hide.filter((h) => h !== id) : [...lines.value.hide, id]);
// A name left empty, or only spaces, is the one + New gives (the field shows it too).
const rename = (id, field) => {
  const name = field.value = field.value.trim() ? field.value : t('palette.fonts.lineName', { n: id.slice(1) });
  change(lines.value.styles.map((s) => (s.id === id ? { ...s, name } : s)));
};
const remove = (id) => {
  if (props.picked?.style === id) emit('pick', null);
  const at = lines.value.styles.findIndex((s) => s.id === id), entry = lines.value.styles[at];
  change(lines.value.styles.filter((s) => s.id !== id));
  emit('removed', { entry, at });
};
const add = () => {
  const id = nextId(lines.value.styles, 'l');
  change([...lines.value.styles, { id, name: t('palette.fonts.lineName', { n: id.slice(1) }), slots: Array(PIECES.length).fill(null) }]);
  emit('pick', { style: id, piece: 0 });
};

// A slot clicked on the sheet: the picked piece's, unless a block is drawn from it or another piece of the style has it
// (two styles may share one); then the next unset piece is picked. One dragged onto a tile is that piece's (pick), and
// leaves the pick as it was.
const slot = (n, pick = props.picked) => {
  const style = lines.value.styles.find((s) => s.id === pick?.style);
  if (props.disabled || !style) return;
  const block = blocksOf(props.font).indexOf(n);
  if (block >= 0) return void (refused.value = { n, block: BLOCKS[block].key });
  const piece = pick.piece, other = style.slots.findIndex((s, i) => s === n && i !== piece);
  if (other >= 0) return void (refused.value = { n, piece: other });
  const slots = style.slots.map((s, i) => (i === piece ? n : s));
  if (style.slots[piece] !== n) change(lines.value.styles.map((s) => (s === style ? { ...s, slots } : s)));
  if (pick !== props.picked) return;
  const next = [...slots.keys()].map((i) => (piece + 1 + i) % slots.length).find((i) => slots[i] === null);
  emit('pick', next === undefined ? null : { style: style.id, piece: next });
};
defineExpose({ slot });

const over = ref(null); // 'style:piece', the tile a slot is dragged over
const drop = (event, style, piece) => {
  over.value = null;
  refused.value = null;
  const n = droppedSlot(event);
  if (n !== null) slot(n, { style, piece });
};
</script>

<template>
  <div class="lines">
    <div v-for="s in stock" :key="s.id" class="stock">
      <span class="name">{{ t(`tools.drawWith.${s.id}`) }}</span>
      <span class="sample" :style="{ fontFamily: family }">{{ sample(s) }}</span>
      <span v-if="!s.hidden && s.problems.length" class="status warn">{{ status(s) }}</span>
      <button class="ghost" :disabled="disabled" :title="disabled ? reason : undefined" @click="toggleHide(s.id)">{{ t(s.hidden ? 'palette.fonts.show' : 'palette.fonts.hide') }}</button>
    </div>
    <div v-for="s in own" :key="s.id" class="card">
      <div class="top-row">
        <input :value="s.name" maxlength="40" :aria-label="t('palette.fonts.lineNameAria')" :disabled="disabled" @change="rename(s.id, $event.target)">
        <button class="ghost delete" :disabled="disabled" :aria-label="t('common.delete')" :title="disabled ? reason : t('common.delete')" @click="remove(s.id)" v-html="TRASH"/>
      </div>
      <div class="tiles">
        <button
            v-for="(piece, i) in PIECES"
            :key="i"
            class="tile"
            :class="{ missing: problemAt(s, i), picked: isPicked(s, i), over: over === `${s.id}:${i}` }"
            :aria-pressed="isPicked(s, i)"
            :disabled="disabled"
            :title="disabled ? reason : problemAt(s, i)?.reason === 'block' ? shares(s, problemAt(s, i)) : undefined"
            :data-off-reason="disabled ? '' : undefined"
            @click="emit('pick', isPicked(s, i) ? null : { style: s.id, piece: i })"
            @dragover.prevent="over = `${s.id}:${i}`"
            @dragleave="over = null"
            @drop.prevent="drop($event, s.id, i)"
        >
          <span class="glyph" :style="{ fontFamily: family }">{{ s.chars[i] ?? '' }}</span>
          <span class="name">{{ piece }}</span>
          <span class="slot">{{ s.slots[i] ?? '—' }}</span>
        </button>
      </div>
      <span class="status">{{ status(s) }}</span>
    </div>
    <div><button class="ghost" :disabled="disabled" :title="disabled ? reason : undefined" @click="add">{{ t('palette.fonts.newLineStyle') }}</button></div>
    <p v-if="note" class="note warn">{{ note }}</p>
  </div>
</template>

<style scoped src="./fontTile.css"></style>

<style scoped>
div.lines {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

div.stock {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  font-size: 13px;
}

div.stock span.name {
  min-width: 80px;
}

span.sample {
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--surface-0);
  font-size: 16px;
  line-height: 1.2;
  white-space: pre;
}

div.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--surface-3);
  border-radius: 4px;
}

div.top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

div.top-row input {
  width: 140px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 13px;
}

div.tiles { /* equal columns across the card, as a palette's slots are; a short last row keeps their width */
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  gap: 4px;
}

span.status {
  font-size: 12px;
  color: var(--text-muted);
}

span.status.warn {
  color: var(--danger);
}

button.ghost:disabled,
input:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
