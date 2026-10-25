<script setup>
import { computed } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { SETTINGS, getSetting } from '@/store/settings';

import ProjectActions from '@/components/ProjectActions.vue';
import ProjectFooter from '@/components/ProjectFooter.vue';
import HelpInfo from '@/components/HelpInfo.vue';
import RangeField from '@/components/RangeField.vue';
import CharsetField from '@/components/CharsetField.vue';
import FontField from '@/components/FontField.vue';
import { ANSI_CHARSETS, ASCII_CHARSETS } from '@/lib/charsetPresets';

const store = useProjectStore();

const SLIDER_GROUPS = [
  { id: 'transform', title: 'Transforms' },
  { id: 'adjust', title: 'Adjustments' },
  { id: 'effects', title: 'Image Filters' },
].map(group => ({ ...group, sliders: SETTINGS.filter(s => s.group === group.id && s.min !== undefined) }));

const help = (key) => getSetting(key).help;

// The ready-made set the Characters field holds, or Custom.
const charsetName = computed(() => {
  const [chars, presets] = store.renderStyle === 'ansi' ? [store.chars, ANSI_CHARSETS] : [store.charsAscii, ASCII_CHARSETS];
  return presets.find((p) => p.chars === chars)?.name ?? 'Custom';
});
</script>

<template>
  <aside class="control-panel">
    <div class="logo"></div>
    <fieldset>
      <legend>Setup</legend>

      <div class="field">
        <div class="label-group"><label for="cols">Dimensions</label><HelpInfo :text="help('cols')" /></div>
        <div class="row-inputs">
          <input
              type="number"
              id="cols"
              :value="store.cols"
              @input="store.updateCols($event.target.value)"
              @change="$event.target.value = store.cols"
              min="1"
              :max="store.maxCols"
              class="mono"
          >
          <button :title="store.hasEdits ? 'With edits, resizing adds or removes cells at the right and bottom (the aspect ratio is free)' : 'Lock Aspect Ratio'" :aria-pressed="store.aspectLock && !store.hasEdits" :class="{ active: store.aspectLock && !store.hasEdits }" :disabled="store.hasEdits" @click="store.aspectLock = !store.aspectLock">
            <svg v-if="store.aspectLock" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M192 288V192A128 128 0 0 1 448 192V288H384V192A64 64 0 0 0 256 192V288ZM176 288H464A48 48 0 0 1 512 336V528A48 48 0 0 1 464 576H176A48 48 0 0 1 128 528V336A48 48 0 0 1 176 288Z"/></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M320 288V192A128 128 0 0 1 576 192V256H512V192A64 64 0 0 0 384 192V288ZM112 288H400A48 48 0 0 1 448 336V528A48 48 0 0 1 400 576H112A48 48 0 0 1 64 528V336A48 48 0 0 1 112 288Z"/></svg>
          </button>
          <input
              type="number"
              id="rows"
              :value="store.rows"
              @input="store.updateRows($event.target.value)"
              @change="$event.target.value = store.rows"
              min="1"
              :max="store.maxRows"
              class="mono"
          >
        </div>
      </div>

      <div class="field">
        <div class="label-group"><label for="renderStyle">Art Style</label><HelpInfo :text="help('renderStyle')" /></div>
        <select id="renderStyle" v-model="store.renderStyle">
          <option value="ansi">ANSI</option>
          <option value="colorAscii">Color ASCII</option>
          <option value="ascii">Monochrome ASCII</option>
        </select>
      </div>

      <div class="field">
        <div class="label-row">
          <div class="label-group"><label for="chars">Characters</label><HelpInfo :text="help('chars')" /></div>
          <span class="value">{{ charsetName }}</span>
        </div>
        <CharsetField v-if="store.renderStyle === 'ansi'" id="chars" v-model="store.chars" :presets="ANSI_CHARSETS"/>
        <CharsetField v-else id="chars" v-model="store.charsAscii" :presets="ASCII_CHARSETS"/>
      </div>

      <div v-if="store.renderStyle === 'ansi' && store.chars.length > 1" class="field">
        <div class="label-group"><label for="seed">Character Seed</label><HelpInfo :text="help('seed')" /></div>
        <div class="row-inputs">
          <input type="text" id="seed" v-model.lazy="store.seed" placeholder="seed">
          <button @click="store.randomizeSeed" title="Randomize Seed">🎲</button>
        </div>
      </div>

      <FontField/>

      <div class="field">
        <div class="label-group"><label for="quantize">Color Palette</label><HelpInfo :text="help('quantize')" /></div>
        <select id="quantize" v-model="store.quantize">
          <option value="none">Full color (24-bit)</option>
          <option value="vga">VGA colors (8-bit)</option>
          <option value="cga">CGA colors (4-bit)</option>
          <option value="count">Color count (24-bit)</option>
          <option value="palette">Color list (24-bit)</option>
        </select>
      </div>

      <RangeField v-if="store.quantize === 'count'" :setting="getSetting('colorCount')" v-model="store.colorCount"/>
      <div v-else-if="store.quantize === 'palette'" class="field">
        <label for="palette">Palette Colors</label>
        <input type="text" id="palette" v-model.lazy="store.palette" placeholder="#FFFFFFF #000000">
      </div>

      <div class="field">
        <div class="label-group"><label for="smoothing">Smoothing</label><HelpInfo :text="help('smoothing')" /></div>
        <select id="smoothing" v-model="store.smoothing">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
    </fieldset>

    <template v-for="group in SLIDER_GROUPS" :key="group.id">
      <hr/>

      <fieldset>
        <legend>
          {{ group.title }}
          <button @click="store.resetGroup(group.id)" tabindex="-1">RESET</button>
        </legend>

        <!-- Undoable: each drag, nudge or color pick is one step (setSlider, then commitSliders). -->
        <RangeField
            v-for="slider in group.sliders"
            :key="slider.key"
            :setting="slider"
            :model-value="store[slider.key]"
            @update:model-value="store.setSlider(slider.key, $event)"
            @commit="store.commitSliders(slider.key, $event)"
        >
          <input
              v-if="slider.companion"
              type="color"
              :value="store[slider.companion]"
              @input="store.setSlider(slider.companion, $event.target.value)"
              @change="store.commitSliders(slider.companion)"
          >
        </RangeField>
      </fieldset>
    </template>

    <button @click="store.resetSliders">RESET ALL</button>

    <hr/>

    <ProjectActions/>
    <ProjectFooter/>
  </aside>
</template>

<style scoped>
aside.control-panel {
  display: flex;
  flex-direction: column;
  flex: 0 0 210px;
  gap: 8px;
  max-width: 210px;
  padding: 20px;
  overflow-y: auto;
}

div.logo {
  display: block;
  width: 100%;
  padding: 30% 0;
  margin-bottom: 10px;
  user-select: none;
  pointer-events: none;
  background-image: var(--logo);
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

fieldset {
  margin: 10px 0 0;
  min-width: 0;
  padding: 0;
  border: 0;
}

legend {
  width: 100%;
  padding: 0 0 4px;
  margin: 10px 0 15px 0;
  opacity: 0.8;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text);
}

legend button {
  float: right;
  padding: 3px;
  border: none;
  box-shadow: none !important;
  background: transparent;
  font-size: 10px;
  color: var(--text-faint);
}

legend button:hover {
  transform: none;
  color: var(--accent-hot);
}

:deep(div.field) {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

:deep(div.label-row) {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

:deep(div.row-inputs) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
}

:deep(div.row-inputs button) {
  width: 38px;
  padding: 8px;
  flex-shrink: 0;
}

:deep(div.row-inputs button svg) {
  display: block;
  width: 16px;
  height: 16px;
  margin: auto;
  fill: currentColor;
}

:deep(label) {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--accent-hot);
}

:deep(div.label-group) {
  display: flex;
  align-items: center;
  gap: 6px;
}

:deep(span.value) {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-muted);
}

:deep(span.value-tooltip) {
  visibility: hidden !important;
}

@media (max-width: 768px) {
  aside.control-panel {
    height: 100dvh;
  }

  :deep(input[type=range]:active + span.value-tooltip) {
    visibility: visible !important;
  }
}
</style>