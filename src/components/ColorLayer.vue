<script setup>
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount, useTemplateRef, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useResizeObserver } from '@vueuse/core';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { ownsKey } from '@/lib/fields';
import FloatingPanel, { BIG_WIDTH } from '@/components/FloatingPanel.vue';
import ColorsPage from '@/components/ColorsPage.vue';
import ColorPalettesPage from '@/components/ColorPalettesPage.vue';

// The color layer: the color box in the character palette layer's frame (FloatingPanel), opened by the color pair's
// chips, Alt+F and Alt+B, or a gradient's stop (workspace.openColors), and on its Palettes page by the settings column's
// Palettes link. Its pages are Colors (ColorsPage), the picker for the slot open, small; and Palettes
// (ColorPalettesPage), the drawing's colors and the palette library, the big size. It's mounted while workspace.colorBox
// is set, and however it goes, it clears it, as the character palette layer clears its own: so it closes with the drawing
// and on a switch away from the art, and an opener that switches first (Palettes from SAUCE) opens a new one after. The
// two layers show one at a time: this one opening closes the character palette layer, and that one opening closes this.
const { t } = useI18n();
const workspace = useWorkspaceStore();
const panel = useTemplateRef('panel');
const palettesPage = useTemplateRef('palettesPage');
const onPalettes = computed(() => workspace.colorLayerPage === 'palettes');
// The frame's width: inside it the page's 10px padding leaves the swatches 260px, as the color box had before it was a
// layer (282px across with the border, as that box was).
const WIDTH = 280;

// It opens under the toolbar at the pair's left, but never so far along that its right edge, border and all, comes
// nearer than 10px to the toolbar's (the frame is never wider than the toolbar less 20px), at the small width or, on
// Palettes, the big one. Measured as it opens, as it changes size, and whenever the toolbar's width changes: the
// window's, or the side panel's edge dragged, which leaves the layer open. With no pair beside it (over the start
// screen), it sits at the right, as the character palette layer does.
const left = ref(null);
// What `left` is measured from: the toolbar, kept from the first time the frame floats in it, since opened on Palettes
// as a dialog (fixed, on a smaller window) it has none until Colors.
const bar = shallowRef(null);
let shrinking = null; // the width's move back to Colors, which the left waits out (see the watch below)
const place = () => {
  const el = panel.value?.root;
  if (shrinking || !el?.offsetParent) return; // waiting, not laid out, or a dialog
  bar.value = el.offsetParent;
  const box = bar.value.getBoundingClientRect(), pair = bar.value.querySelector('.color-pair')?.getBoundingClientRect();
  const frame = Math.min(onPalettes.value ? BIG_WIDTH : WIDTH, box.width - 20) + el.offsetWidth - el.clientWidth;
  left.value = pair ? Math.min(pair.left - box.left, box.width - 10 - frame) : null;
};
useResizeObserver(bar, place);

const close = () => { workspace.colorBox = null; };
// A press that takes its own button away (Use turning to In use, Put back's line), or a page whose focus went with it,
// gives the keyboard back to the layer.
const keepKeys = () => panel.value?.keepKeys();

// The Palettes page's keys, as the Fonts page's: Up and Down choose a row, Escape closes the layer. A field's own Escape
// comes first (the search's, Get's) and leaves the keys on the layer, so a second Escape closes it. The Colors page
// hears its own keys.
const onKeyDown = (event) => {
  if (!onPalettes.value) return;
  if (ownsKey(event.target, event)) {
    if (event.key === 'Escape') panel.value.root.focus();
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') palettesPage.value?.step(event.key === 'ArrowDown' ? 1 : -1);
  else if (event.key === 'Escape') close();
  else return;
  event.preventDefault();
};

// Growing to Palettes, the new left comes at once, so the right edge never passes the toolbar's 10px line as the width
// moves. Shrinking back, the left waits until the width is done, a toolbar's resize meanwhile too: moved at once, it
// would put the frame, still as wide as Palettes for the move's 0.25s (coming back from the dialog too), past that
// line. Then it hops under the pair.
watch(onPalettes, async (wide) => {
  keepKeys();
  shrinking = null;
  if (!wide) {
    await nextTick();
    shrinking = panel.value?.root.getAnimations().find((move) => move.transitionProperty === 'width') ?? null;
    await shrinking?.finished.catch(() => {}); // cut short by Palettes again, or the layer closed
    shrinking = null;
  }
  place();
});
onMounted(() => {
  workspace.paletteLayerOpen = false;
  place();
  if (onPalettes.value) keepKeys(); // the Colors page focuses its own color
});
watch(() => workspace.paletteLayerOpen, (open) => {
  if (open) close();
});
onBeforeUnmount(close);
</script>

<template>
  <FloatingPanel
      ref="panel"
      class="color-layer"
      :wide="onPalettes"
      :width="WIDTH"
      :left="left"
      keep=".color-pair, [data-colors-toggle]"
      :label="t('colorLayer.aria')"
      @keydown="onKeyDown"
      @close="close"
  >
    <template #tabs>
      <div class="tablist" role="tablist">
        <button role="tab" :class="{ on: !onPalettes }" :aria-selected="!onPalettes" @click="workspace.colorLayerPage = 'colors'">{{ t('colorLayer.colors') }}</button>
        <button role="tab" :class="{ on: onPalettes }" :aria-selected="onPalettes" @click="workspace.colorLayerPage = 'palettes'">{{ t('colorLayer.palettes') }}</button>
      </div>
    </template>
    <!-- Palettes is kept while Colors shows, so what it would put back, the row chosen and the search last until the layer closes. -->
    <KeepAlive include="ColorPalettesPage">
      <ColorPalettesPage v-if="onPalettes" ref="palettesPage" @acted="keepKeys"/>
      <ColorsPage v-else v-model:slot-name="workspace.colorBox" @close="close"/>
    </KeepAlive>
  </FloatingPanel>
</template>

<style scoped src="./tabStrip.css"></style>
