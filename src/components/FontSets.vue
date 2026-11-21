<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { slotChars, slotOf } from '@/lib/BitmapFont';
import { nextId } from '@/lib/FontLines';
import { ANSI_CHARSETS, ASCII_CHARSETS } from '@/lib/charsetPresets';

// The Fonts page's Sets section: the font's own character sets, kept as slots, and one switch for the stock sets. A
// set is picked by focusing its characters; the page passes a click on the sheet to slot(n), which appends it.
const props = defineProps({
  font: { type: Object, required: true }, // { name, height, bytes, blocks?, sets? }
  family: { type: String, required: true }, // the CSS font family it draws in
  picked: { type: String, default: null }, // the id of the set a click on the sheet adds to
  disabled: { type: Boolean, default: false },
  reason: { type: String, default: '' }, // why it's disabled
});
const emit = defineEmits(['pick', 'change']);
const { t } = useI18n();

const sets = computed(() => props.font.sets ?? { hideStock: false, sets: [] });
const chars = computed(() => slotChars(props.font));
const charsOf = (set) => set.slots.map((s) => chars.value[s]).join('');
const stockNames = computed(() => [...new Set([...ANSI_CHARSETS, ...ASCII_CHARSETS].map((p) => p.name))].join(' · '));
const pickedSet = computed(() => sets.value.sets.find((s) => s.id === props.picked));
const note = computed(() => (pickedSet.value && !props.disabled
  ? t('palette.fonts.setPicked', { name: pickedSet.value.name })
  : sets.value.sets.length ? t('palette.fonts.setsHint') : ''));

const change = (list, hideStock = sets.value.hideStock) => emit('change', { hideStock, sets: list });
const setSlots = (id, slots) => change(sets.value.sets.map((s) => (s.id === id ? { ...s, slots } : s)));
const rename = (id, name) => change(sets.value.sets.map((s) => (s.id === id ? { ...s, name } : s)));
const remove = (id) => {
  if (props.picked === id) emit('pick', null);
  change(sets.value.sets.filter((s) => s.id !== id));
};
const add = () => {
  const id = nextId(sets.value.sets, 's');
  change([...sets.value.sets, { id, name: t('palette.fonts.setName', { n: id.slice(1) }), slots: [] }]);
  emit('pick', id);
};
// Typed characters as the font's slots, dropping those it has none for; the field shows what's kept.
const typed = (set, event) => {
  const slots = [...event.target.value].map((c) => slotOf(c, props.font)).filter((s) => s !== null);
  if (slots.length !== set.slots.length || slots.some((s, i) => s !== set.slots[i])) setSlots(set.id, slots);
  event.target.value = slots.map((s) => chars.value[s]).join('');
};
// Backspace with nothing selected takes the last slot off, wherever the caret is (clicks add at the end).
const backspace = (set, event) => {
  if (event.target.selectionStart !== event.target.selectionEnd) return;
  event.preventDefault();
  if (set.slots.length) setSlots(set.id, set.slots.slice(0, -1));
};

const slot = (n) => {
  if (!props.disabled && pickedSet.value) setSlots(pickedSet.value.id, [...pickedSet.value.slots, n]);
};
defineExpose({ slot });
</script>

<template>
  <div class="sets">
    <div v-for="s in sets.sets" :key="s.id" class="set">
      <input class="name" :value="s.name" maxlength="40" :aria-label="t('palette.fonts.setNameAria')" :disabled="disabled" @change="rename(s.id, $event.target.value)">
      <input
          class="chars"
          :class="{ picked: picked === s.id }"
          :value="charsOf(s)"
          :style="{ fontFamily: family }"
          :aria-label="t('palette.fonts.setCharsAria', { name: s.name })"
          :disabled="disabled"
          :title="disabled ? reason : undefined"
          @focus="emit('pick', s.id)"
          @input="typed(s, $event)"
          @keydown.backspace="backspace(s, $event)"
      >
      <button class="ghost" :disabled="disabled" :title="disabled ? reason : undefined" @click="remove(s.id)">{{ t('common.delete') }}</button>
    </div>
    <div><button class="ghost" :disabled="disabled" :title="disabled ? reason : undefined" @click="add">{{ t('palette.fonts.newSet') }}</button></div>
    <p v-if="note" class="note">{{ note }}</p>
    <label class="stock">
      <input type="checkbox" :checked="!sets.hideStock" :disabled="disabled" @change="change(sets.sets, !$event.target.checked)">
      {{ t('palette.fonts.showStockSets') }}
    </label>
    <p class="note">{{ stockNames }}</p>
  </div>
</template>

<style scoped>
div.sets {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

div.set {
  display: flex;
  align-items: center;
  gap: 8px;
}

div.set input {
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 13px;
}

div.set input.name {
  flex: 0 1 140px;
}

div.set input.chars {
  flex: 1;
  font-size: 16px;
  line-height: 1.2;
}

div.set input.chars.picked {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

label.stock {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text);
}

p.note {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-muted);
}

button.ghost:disabled,
input:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
