<script setup>
import { ref, watch, onMounted, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useResizeObserver } from '@vueuse/core';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import FloatingPanel from '@/components/FloatingPanel.vue';
import ColorsPage from '@/components/ColorsPage.vue';

// The color layer: the color box in the character palette layer's frame (FloatingPanel), opened by the color pair's
// chips, Alt+F and Alt+B, or a gradient's stop (workspace.openColors). Its page is Colors (ColorsPage), the picker for
// the slot open. It's mounted exactly while workspace.colorBox is set, and the two layers show one at a time: this one
// opening closes the character palette layer, and that one opening closes this.
const { t } = useI18n();
const workspace = useWorkspaceStore();
const panel = useTemplateRef('panel');
const WIDTH = 260;

// It opens under the toolbar at the pair's left, but never so far along that its right edge, border and all, comes
// nearer than 10px to the toolbar's (the frame is never wider than the toolbar less 20px). Measured as it opens and
// whenever the toolbar's width changes: the window's, or the side panel's edge dragged, which leaves the layer open. With
// no pair beside it, it sits at the right, as the character palette layer does.
const left = ref(null);
const bar = () => panel.value?.root?.offsetParent; // what `left` is measured from: the toolbar
const place = () => {
  const el = panel.value?.root, box = bar()?.getBoundingClientRect();
  if (!box) return; // not laid out
  const pair = bar().querySelector('.color-pair')?.getBoundingClientRect();
  const frame = Math.min(WIDTH, box.width - 20) + el.offsetWidth - el.clientWidth;
  left.value = pair ? Math.min(pair.left - box.left, box.width - 10 - frame) : null;
};
useResizeObserver(bar, place);

onMounted(() => {
  workspace.paletteLayerOpen = false;
  place();
});
watch(() => workspace.paletteLayerOpen, (open) => {
  if (open) workspace.colorBox = null;
});
</script>

<template>
  <FloatingPanel ref="panel" class="color-layer" :width="WIDTH" :left="left" keep=".color-pair" :label="t('colorLayer.aria')" @close="workspace.colorBox = null">
    <template #tabs>
      <div class="tablist" role="tablist">
        <button role="tab" class="on" aria-selected="true">{{ t('colorLayer.colors') }}</button>
      </div>
    </template>
    <ColorsPage v-model:slot-name="workspace.colorBox" @close="workspace.colorBox = null"/>
  </FloatingPanel>
</template>

<style scoped src="./tabStrip.css"></style>
