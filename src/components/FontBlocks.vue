<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { BLOCKS, CP437_BLOCKS, blocksOf, droppedSlot, slotChars } from '@/lib/BitmapFont';

// The Fonts page's Blocks row: the slot that draws each of a bitmap font's eight block characters, in the font's own
// glyphs, and one line on what a click sets. Picking a tile is the page's: the sheet's slots are clicked to set it, or one
// is dragged onto a tile (place: the block's key and the slot).
const props = defineProps({
  font: { type: Object, required: true }, // { name, height, bytes, blocks? }
  family: { type: String, required: true }, // the CSS font family it draws in
  picked: { type: String, default: null }, // the picked block's key
  disabled: { type: Boolean, default: false },
  reason: { type: String, default: '' }, // why the tiles are disabled
});
const emit = defineEmits(['pick', 'place']);
const { t } = useI18n();

const blocks = computed(() => blocksOf(props.font));
const chars = computed(() => slotChars(props.font));
// What a click on the sheet, or a drag onto a tile, sets, as the palette editor's line says it (none in a room). Where
// each block was found, or that it's missing, the tiles show.
const note = computed(() => {
  if (props.disabled) return '';
  return props.picked ? t('palette.fonts.assigning', { name: t(`palette.fonts.blockName.${props.picked}`) }) : t('palette.fonts.pickBlock');
});

const over = ref(null); // the block a slot is dragged over
const drop = (event, key) => {
  over.value = null;
  const n = droppedSlot(event);
  if (n !== null && !props.disabled) emit('place', key, n);
};
</script>

<template>
  <div class="blocks" role="group" :aria-label="t('palette.fonts.blocks')"><!-- under the Blocks tab, which shows the name -->
    <button
        v-for="(b, i) in BLOCKS"
        :key="b.key"
        class="tile"
        :class="{ moved: blocks[i] !== null && blocks[i] !== CP437_BLOCKS[i], missing: blocks[i] === null, picked: picked === b.key, over: over === b.key }"
        :aria-pressed="picked === b.key"
        :disabled="disabled"
        :title="disabled ? reason : undefined"
        :data-off-reason="disabled ? '' : undefined"
        @click="emit('pick', picked === b.key ? null : b.key)"
        @dragover.prevent="over = b.key"
        @dragleave="over = null"
        @drop.prevent="drop($event, b.key)"
    >
      <span class="glyph" :style="{ fontFamily: family }">{{ blocks[i] === null ? '' : chars[blocks[i]] }}</span>
      <span class="name">{{ t(`palette.fonts.blockName.${b.key}`) }}</span>
      <span class="slot">{{ blocks[i] === null ? t('palette.fonts.blockNone') : blocks[i] }}</span>
    </button>
    <p v-if="note" class="note">{{ note }}</p>
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

div.blocks button.tile { /* the eight share the row's width, none narrower than what it shows */
  flex: 1 1 0;
}

button.tile.moved span.slot {
  color: var(--accent);
}
</style>
