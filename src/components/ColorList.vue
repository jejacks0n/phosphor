<script setup>
import { onBeforeUnmount, ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMediaQuery } from '@vueuse/core';
import { closeToast, toast } from '@/composables/useToast';
import { downloadBlob, fileStem } from '@/document/projectIO';
import { MOST_COLORS, firstColors, hexFile, listColors, moved, sameColors, withColor, withCopy, without, writeList } from '@/lib/colorList';

// The Custom color list's editor: the `palette` setting as swatches, one of them picked, and under them the picked
// color's chip (the system color picker), its hex, ◂ ▸ to move it and Remove. It writes the setting only when
// something is edited, so a list it didn't write stays as it was typed. The pick is a place, not a color, so a color
// the list holds twice is no trouble. While the system picker is open the list follows it, and `picking` says when a
// pick starts and ends, so whoever holds the list can send it on as one change, as a slider drag goes.
const props = defineProps({ modelValue: { type: String, default: '' }, name: { type: String, default: '' } });
const emit = defineEmits(['update:modelValue', 'picking']);
const { t } = useI18n();

const colors = computed(() => listColors(props.modelValue));
// The place picked, read inside the list whatever its holder did with a write (+ picks the copy's place before the list
// holds it, and a holder may not take it), and kept there when the list shrinks.
const place = ref(0);
const picked = computed({
  get: () => Math.max(0, Math.min(place.value, colors.value.length - 1)),
  set: (i) => { place.value = i; },
});
watch(() => colors.value.length, () => { place.value = picked.value; });
const current = computed(() => colors.value[picked.value] ?? '');

const write = (list) => {
  if (!sameColors(list, colors.value)) emit('update:modelValue', writeList(list));
};
// The list with the picked color changed; a list with none takes it as its first.
const recolored = (hex) => (colors.value.length ? withColor(colors.value, picked.value, hex) : [hex.toLowerCase()]);

// What's typed is applied on Enter or on leaving the field: one color is the picked one's, two or more are the whole
// list (with Put back, as Import's, since the field shows one color and what it replaced can't be seen), and none
// changes nothing. The field then shows the picked color of the list written (its prop is the old list until the next
// render, and a color typed as it was, in capitals, isn't a new value to show).
const apply = (event) => {
  const typed = listColors(event.target.value);
  let list = colors.value;
  if (typed.length === 1) write((list = recolored(typed[0])));
  else if (typed.length) {
    const { colors: first, of } = firstColors(typed);
    list = first;
    if (!sameColors(list, colors.value)) replace(list, of ? t('colorList.typedCut', { n: of }) : t('colorList.typed', { n: typed.length }));
  }
  event.target.value = list[Math.min(picked.value, list.length - 1)] ?? '';
};
const putBack = (event) => { event.target.value = current.value; };

const move = (to) => {
  write(moved(colors.value, picked.value, to));
  picked.value = to;
};
const add = () => {
  write(withCopy(colors.value, picked.value));
  picked.value = colors.value.length; // the copy's place, once the list holds it
};
const remove = () => {
  const rest = without(colors.value, picked.value);
  write(rest);
  picked.value = Math.min(picked.value, rest.length - 1); // its neighbor: the next one, or the one before the last
};

// The system picker's chip: every color it moves through is applied, and the pick ends when it closes, or when the chip
// loses focus (a picker moved and brought back to where it started closes with no change).
let picking = false, quiet = null;
// A pick also ends when the chip has been still this long: a system panel that isn't modal (macOS's) can stay open with
// neither change nor blur to come, and a pick that never ends would keep a room from hearing the host for good. A move
// after it starts another.
const PICK_QUIET_MS = 1000;
const onPick = (event) => {
  if (!picking) emit('picking', (picking = true));
  clearTimeout(quiet);
  quiet = setTimeout(endPick, PICK_QUIET_MS);
  write(recolored(event.target.value));
};
const endPick = () => {
  clearTimeout(quiet);
  if (picking) emit('picking', (picking = false));
};
onBeforeUnmount(endPick);

// The swatches are one Tab stop, the picked one, and the keys walk them as the grid they're drawn in: Left and Right
// a swatch, Up and Down a row, Home and End to the first and last, stopping at the ends. Each picks the swatch it
// reaches. The keys stop here, so they don't reach the app's (data-walk tells ownsKey the swatch keeps them).
const ROW = 8;
const STEP = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -ROW, ArrowDown: ROW };
const onSwatchKey = (event, i) => {
  if (event.altKey || event.metaKey || event.ctrlKey) return;
  const last = colors.value.length - 1;
  const to = { Home: 0, End: last }[event.key] ?? (STEP[event.key] === undefined ? null : i + STEP[event.key]);
  if (to === null) return;
  event.preventDefault();
  event.stopPropagation();
  if (to < 0 || to > last) return;
  picked.value = to;
  event.currentTarget.parentElement.children[to].focus();
};

// With a mouse or a pen a swatch can be dragged to another place; a finger's drag scrolls the settings, so it can't.
const mouse = useMediaQuery('(pointer: fine)');
let dragged = null;
const onDragStart = (event, i) => {
  dragged = i;
  event.dataTransfer?.setData('text/plain', colors.value[i]); // some browsers start no drag without data
};
const onDragOver = (event) => {
  if (dragged !== null) event.preventDefault();
};
const onDrop = (i) => {
  if (dragged !== null && dragged !== i) {
    picked.value = dragged; // the swatch dragged goes where it's dropped, picked
    move(i);
  }
  dragged = null;
};

// A list typed or a file imported replaces the whole list, and its toast puts back the list as it was, as it was
// written. The toast goes when the editor does (and the settings column makes a new editor for another drawing), so no
// Put back is left that does nothing or writes one drawing's list onto another.
let replacedToast = null;
onBeforeUnmount(() => {
  if (replacedToast) closeToast(replacedToast);
});
const replace = (list, message) => {
  const before = props.modelValue;
  write(list);
  replacedToast = toast(message, { action: { label: t('colorList.putBack'), run: () => emit('update:modelValue', before) } });
};

// A .hex file (Lospec's: six digits a line) or any text with colors in it replaces the list. A file past MOST_BYTES
// isn't read: no list of colors is that big, and reading one would hold the page.
const MOST_BYTES = 1024 * 1024;
const file = ref(null);
const onFile = async (event) => {
  const [chosen] = event.target.files;
  event.target.value = ''; // so the same file can be chosen again
  if (!chosen) return;
  if (chosen.size > MOST_BYTES) return toast(t('colorList.tooBig', { name: chosen.name }));
  const found = listColors(await chosen.text());
  if (!found.length) return toast(t('colorList.noColors', { name: chosen.name }));
  const { colors: list, of } = firstColors(found);
  replace(list, of ? t('colorList.importedCut', { name: chosen.name, n: of }) : t('colorList.imported', { name: chosen.name }));
};
const exportList = () => downloadBlob(new Blob([hexFile(colors.value)], { type: 'text/plain' }), `${fileStem(props.name, 'hex') || 'palette'}.hex`);
</script>

<template>
  <div class="color-list">
    <label for="palette">{{ t('panel.paletteColors.label') }}</label>
    <div class="swatches">
      <button
          v-for="(hex, i) in colors"
          :key="i"
          type="button"
          class="swatch"
          :style="{ backgroundColor: hex }"
          :aria-label="t('colorList.swatch', { hex, n: i + 1, count: colors.length })"
          :title="hex"
          :aria-pressed="String(i === picked)"
          :tabindex="i === picked ? 0 : -1"
          data-walk
          :draggable="mouse"
          @click="picked = i"
          @keydown="onSwatchKey($event, i)"
          @dragstart="onDragStart($event, i)"
          @dragover="onDragOver"
          @drop.prevent="onDrop(i)"
          @dragend="dragged = null"
      ></button>
      <button
          type="button"
          class="add"
          :aria-label="t('colorList.add')"
          :title="t('colorList.add')"
          :disabled="!colors.length || colors.length >= MOST_COLORS"
          @click="add"
      >+</button>
    </div>
    <div class="picked">
      <input type="color" class="chip" :aria-label="t('colorList.color')" :title="t('colorList.color')" :value="current || '#000000'" @input="onPick" @change="endPick" @blur="endPick">
      <input
          id="palette"
          type="text"
          class="mono"
          spellcheck="false"
          autocomplete="off"
          :value="current"
          @keydown.enter="apply"
          @keydown.esc="putBack"
          @blur="apply"
      >
      <button type="button" class="earlier" :aria-label="t('colorList.earlier')" :title="t('colorList.earlier')" :disabled="picked <= 0" @click="move(picked - 1)">◂</button>
      <button type="button" class="later" :aria-label="t('colorList.later')" :title="t('colorList.later')" :disabled="picked >= colors.length - 1" @click="move(picked + 1)">▸</button>
      <button type="button" class="remove text" :disabled="colors.length <= 1" @click="remove">{{ t('colorList.remove') }}</button>
    </div>
    <div class="foot">
      <p class="count">{{ t('colorList.count', colors.length) }}</p>
      <span class="links">
        <button type="button" class="import text" :title="t('colorList.importTitle')" @click="file.click()">{{ t('colorList.import') }}</button>
        <span aria-hidden="true">·</span>
        <button type="button" class="export text" :title="t('colorList.exportTitle')" :disabled="!colors.length" @click="exportList">{{ t('colorList.export') }}</button>
      </span>
    </div>
    <input ref="file" type="file" class="hex-file" accept=".hex,.txt,text/plain" hidden @change="onFile">
  </div>
</template>

<style scoped src="./textLink.css"></style>
<style scoped>
/* Eight to a row, as the color box lays out the same list. */
div.swatches {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 3px;
  margin-top: 6px;
}

button.swatch,
button.add {
  aspect-ratio: 1;
  min-width: 0;
  padding: 0;
  border: 1px solid var(--border-light);
  border-radius: 2px;
  box-shadow: none;
}

button.swatch:hover {
  transform: none;
}

button.swatch[aria-pressed=true] {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

button.add {
  background: transparent;
  font-size: 14px;
  line-height: 1;
  color: var(--text-muted);
}

div.picked {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
}

/* Square, at the hex field's height, and the field's padding and ◂ ▸ narrow, so a whole #rrggbb shows in the settings
   column. */
div.picked input.chip {
  flex: none;
  width: 34px;
  height: 34px;
}

div.picked input#palette {
  flex: 1;
  min-width: 0;
  padding: 8px 6px;
}

button.earlier,
button.later {
  flex: none;
  height: 34px;
  padding: 0 6px;
}

div.foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
}

p.count {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

span.links {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--text-faint);
  font-size: 10px;
}

button.remove {
  flex: none;
  margin-left: 4px;
}
</style>
