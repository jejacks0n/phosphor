<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { BLOCKS, CP437_BLOCKS, blocksOf, findBlocks, slotChars } from '@/lib/BitmapFont';

// The Fonts page's Blocks row: the slot that draws each of a bitmap font's eight block characters, in the font's own
// glyphs, and one line on what was found. Picking a tile is the page's: the sheet's slots are clicked to set it.
const props = defineProps({
  font: { type: Object, required: true }, // { name, height, bytes, blocks? }
  family: { type: String, required: true }, // the CSS font family it draws in
  picked: { type: String, default: null }, // the picked block's key
  disabled: { type: Boolean, default: false },
  reason: { type: String, default: '' }, // why the tiles are disabled
});
const emit = defineEmits(['pick']);
const { t } = useI18n();

const blocks = computed(() => blocksOf(props.font));
const chars = computed(() => slotChars(props.font));
// the blocks whose slot the person chose: those that differ from what the pixels say
const byYou = computed(() => (props.font.blocks ? findBlocks({ ...props.font, blocks: undefined }) : blocks.value).map((s, i) => s !== blocks.value[i]));
const long = (i) => t(`palette.fonts.blockLong.${BLOCKS[i].key}`);

const note = computed(() => {
  const missing = blocks.value.flatMap((s, i) => (s === null ? [i] : []));
  const moved = blocks.value.flatMap((s, i) => (s !== null && s !== CP437_BLOCKS[i] ? [i] : []));
  const lines = [], pick = BLOCKS.findIndex((b) => b.key === props.picked);
  // a missing block picked: what to do with it (in place of "Pick Lower, then click a slot")
  if (missing.includes(pick)) lines.push(t('palette.fonts.pickedMissing', { name: t(`palette.fonts.blockName.${props.picked}`), long: long(pick).toLowerCase() }));
  if (missing.includes(1) && pick !== 1) lines.push(t('palette.fonts.noLower'));
  const others = missing.filter((i) => i !== 1);
  if (others.length) lines.push(t('palette.fonts.noBlocks', { names: others.map((i) => long(i).toLowerCase()).join(', ') }));
  for (const i of moved) {
    lines.push(t(byYou.value[i] ? 'palette.fonts.blockMovedSet' : 'palette.fonts.blockMovedFound', { name: long(i), n: blocks.value[i], home: CP437_BLOCKS[i], char: chars.value[CP437_BLOCKS[i]] }));
  }
  if (!lines.length) lines.push(t(byYou.value.some(Boolean) ? 'palette.fonts.blocksSet' : 'palette.fonts.blocksFound'));
  if (!props.picked) lines.push(t('palette.fonts.blocksHint'));
  return { text: lines.join(' '), tone: missing.length ? 'warn' : moved.length || byYou.value.some(Boolean) ? 'accent' : '' };
});
</script>

<template>
  <div class="blocks">
    <span class="label">{{ t('palette.fonts.blocks') }}</span>
    <button
        v-for="(b, i) in BLOCKS"
        :key="b.key"
        class="tile"
        :class="{ moved: blocks[i] !== null && blocks[i] !== CP437_BLOCKS[i], missing: blocks[i] === null, picked: picked === b.key }"
        :aria-pressed="picked === b.key"
        :disabled="disabled"
        :title="disabled ? reason : undefined"
        :data-off-reason="disabled ? '' : undefined"
        @click="emit('pick', picked === b.key ? null : b.key)"
    >
      <span class="glyph" :style="{ fontFamily: family }">{{ blocks[i] === null ? '' : chars[blocks[i]] }}</span>
      <span class="name">{{ t(`palette.fonts.blockName.${b.key}`) }}</span>
      <span class="slot">{{ blocks[i] === null ? t('palette.fonts.blockNone') : blocks[i] }}</span>
    </button>
    <p class="note" :class="note.tone">{{ note.text }}</p>
  </div>
</template>

<style scoped>
div.blocks {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: stretch;
}

span.label {
  flex-basis: 100%;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

button.tile {
  display: grid;
  grid-template-columns: auto auto;
  column-gap: 6px;
  align-items: center;
  padding: 3px 7px 3px 4px;
  border: 1px solid var(--surface-3);
  border-radius: 4px;
  background: var(--surface-1);
  color: var(--text);
  font: inherit;
  font-size: 11px;
  line-height: 1.2;
  cursor: pointer;
}

button.tile:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

button.tile:disabled {
  opacity: 0.4;
  cursor: default;
}

button.tile.missing { /* always, so what the font lacks shows at a glance */
  border-style: dashed;
  border-color: var(--danger);
}

button.tile.picked {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

span.glyph {
  grid-row: span 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 22px;
  border-radius: 2px;
  background: var(--surface-0);
  font-size: 16px;
  line-height: 1;
}

span.slot {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

button.tile.moved span.slot {
  color: var(--accent);
}

button.tile.missing span.slot {
  color: var(--danger);
}

p.note {
  flex-basis: 100%;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-muted);
}

p.note.accent {
  color: var(--accent);
}

p.note.warn {
  color: var(--danger);
}
</style>
