<script setup>
// The character a shape or a fill draws with: typed into a field, or chosen from the palette's glyphs and every slot
// of the drawing's font. A choice writes no palette. The last grapheme typed counts, and a wide one is refused.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { usePaletteStore } from '@/store/PaletteStore';
import DropdownMenu from '@/components/DropdownMenu.vue';
import { cellWidth, graphemes, usableChar } from '@/lib/CharWidth';
import { fitFont, slotChars } from '@/lib/BitmapFont';

const props = defineProps({ modelValue: String, label: String });
const emit = defineEmits(['update:modelValue']);
const { t } = useI18n();
const project = useProjectStore();
const palettes = usePaletteStore();

const shown = (g) => (project.drawingFont ? fitFont(g, project.drawingFont) : g);
const palette = computed(() => palettes.active.glyphs.filter(Boolean));
const slots = computed(() => slotChars(project.drawingFont));

function typed(event) {
  const g = graphemes(event.target.value).at(-1);
  if (g && usableChar(g) && cellWidth(g) === 1) emit('update:modelValue', shown(g));
  event.target.value = props.modelValue; // a refused one puts the character back; an accepted one is shown by the prop
}
</script>

<template>
  <div class="char-field">
    <input class="glyph-cell char-input" :value="modelValue" :aria-label="label" :title="t('tools.charField.title')" @input="typed"/>
    <DropdownMenu align="left" :label="t('tools.charField.choose')">
      <div class="char-palette">
        <button v-for="(g, i) in palette" :key="i" class="glyph-cell" :data-char="g" @click="emit('update:modelValue', shown(g))">{{ shown(g) }}</button>
      </div>
      <div class="char-slots">
        <button v-for="(c, i) in slots" :key="i" class="glyph-cell" :data-char="c" @click="emit('update:modelValue', c)">{{ c === '␀' ? ' ' : shown(c) }}</button>
      </div>
    </DropdownMenu>
  </div>
</template>

<style scoped>
.char-field {
  display: flex;
  align-items: center;
  gap: 2px;
}

.char-input {
  box-sizing: content-box;
  width: 2ch;
  padding: 2px 4px;
}

.char-palette,
.char-slots {
  display: grid;
  gap: 1px;
  padding: 4px;
}

.char-palette {
  grid-auto-flow: column;
  grid-auto-columns: min-content;
}

.char-slots {
  grid-template-columns: repeat(16, 1fr);
}

.char-palette button,
.char-slots button {
  padding: 2px;
}
</style>
