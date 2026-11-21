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
  if (missing.includes(pick) && !props.disabled) lines.push(t('palette.fonts.pickedMissing', { name: t(`palette.fonts.blockName.${props.picked}`), long: long(pick).toLowerCase() }));
  if (missing.includes(1) && (pick !== 1 || props.disabled)) lines.push(t('palette.fonts.noLower'));
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
  <div class="blocks" role="group" :aria-label="t('palette.fonts.blocks')"><!-- under the Blocks tab, which shows the name -->
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

<style scoped src="./fontTile.css"></style>

<style scoped>
div.blocks {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: stretch;
}

button.tile.moved span.slot {
  color: var(--accent);
}
</style>
