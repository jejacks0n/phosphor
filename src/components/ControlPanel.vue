<script setup>
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLocalStorage } from '@vueuse/core';
import { useProjectStore } from '@/store/ProjectStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { CHAR_KEYS, SETTINGS, getSetting } from '@/store/settings';
import { useLayerName } from '@/composables/useLayerName';

import ProjectActions from '@/components/ProjectActions.vue';
import ProjectFooter from '@/components/ProjectFooter.vue';
import HelpInfo from '@/components/HelpInfo.vue';
import RangeField from '@/components/RangeField.vue';
import CharsetField from '@/components/CharsetField.vue';
import FontField from '@/components/FontField.vue';
import { ANSI_CHARSETS, ASCII_CHARSETS } from '@/lib/charsetPresets';
import { resolves } from '@/lib/CharResolver';

const { t } = useI18n();
const store = useProjectStore();
const drawing = useDrawingStore();
const workspace = useWorkspaceStore();
const layerName = useLayerName();

// Why the settings are off, if they are: only the host's in a room; and inside an art layer the dimmed rest is a snapshot
// of how they had the picture, which a change would leave stale.
const locked = computed(() => drawing.hostOnly || (store.artInside ? t('art.settingsOff') : null));

// The slider groups: Transforms and Adjustments are the whole drawing's, Image filters the picture's (with the Characters
// and Picture sections before it).
const sliderGroups = computed(() => [
  { id: 'transform', title: t('panel.groups.transform') },
  { id: 'adjust', title: t('panel.groups.adjust') },
  { id: 'effects', title: t('panel.groups.effects') },
].map(group => ({ ...group, sliders: SETTINGS.filter(s => s.group === group.id && s.min !== undefined) })));

// The layer the Characters section shows: the one picked, or inside an art layer its vector layer. A pick that isn't in
// the stack yet (VECTOR before the first shape brings its layer) shows the bottom's.
const picked = computed(() => {
  const id = store.artInside ? store.shapes.get(store.artInside)?.layer ?? 'vector' : workspace.pickedLayer;
  return store.layerById(id) ? id : 'base';
});
const pickedKind = computed(() => store.layerById(picked.value).kind);
// Its character settings, read and written as its own (charsOf, setLayerChars).
const own = reactive(Object.fromEntries(CHAR_KEYS.map((key) => [key, computed({
  get: () => store.charsOf(picked.value)[key],
  set: (value) => store.setLayerChars(picked.value, { [key]: value }),
})])));
const ownParams = computed(() => store.layerParams.get(picked.value) ?? store.processParams);
const charsNote = computed(() => {
  if (picked.value === 'base') return null;
  return t(pickedKind.value === 'vector' ? 'panel.charsNoteVector' : 'panel.charsNote', { name: layerName(picked.value) });
});
// Smoothing and the Image filters are the picture's: off, saying why, unless its layer is picked.
const pictureOff = computed(() => (workspace.pickedLayer === 'base' ? null : t('panel.pictureOff', { name: layerName('base') })));
// Why a slider group is off: locked, or Image filters away from the picture's layer.
const groupOff = (id) => locked.value || (id === 'effects' ? pictureOff.value : null);

const help = (key) => getSetting(key).help;
const ansi = computed(() => store.renderStyle === 'ansi');

// A slider group folds and unfolds on its title, and stays as it was left in this browser. Folded, it says how many of
// its sliders are on (off their defaults), so a forgotten Threshold doesn't change the picture unseen.
const folded = useLocalStorage('phosphor.panel.folded', []);
const isFolded = (id) => folded.value.includes(id);
const toggleFold = (id) => { folded.value = isFolded(id) ? folded.value.filter((f) => f !== id) : [...folded.value, id]; };
const onCount = (group) => group.sliders.filter((s) => Number(store[s.key]) !== s.default).length;

// Each way of choosing characters' own options, from the way the picked layer's cells are made (an unknown choice
// from an old file or a room converts as Random or By weight, and shows their options).
const showSeed = computed(() => ownParams.value.charMode === 'random' && own.chars.length > 1);
const showPatternLight = computed(() => resolves(ownParams.value));
const showSolids = computed(() => ansi.value && showPatternLight.value); // ASCII's background is always black: no solid to prefer

// The ready-made set the Characters field holds, or Custom.
const charsetName = computed(() => {
  const [chars, presets] = store.renderStyle === 'ansi' ? [own.chars, ANSI_CHARSETS] : [own.charsAscii, ASCII_CHARSETS];
  return presets.find((p) => p.chars === chars)?.name ?? t('common.custom');
});
</script>

<template>
  <aside class="control-panel">
    <div class="logo"></div>
    <fieldset class="drawing" :disabled="!!locked" :title="locked">
      <legend>{{ t('panel.groups.drawing') }} <span class="sub">{{ t('panel.groups.drawingSub') }}</span></legend>

      <div class="field">
        <div class="label-group"><label for="cols">{{ getSetting('cols').label }}</label><HelpInfo :text="help('cols')" /></div>
        <div class="row-inputs">
          <input
              type="number"
              id="cols"
              :value="store.cols"
              @input="store.updateCols($event.target.value)"
              @change="$event.target.value = store.cols"
              :disabled="!!drawing.someoneInside"
              :title="drawing.someoneInside"
              min="1"
              :max="store.maxCols"
              class="mono"
          >
          <button :title="store.hasEdits ? t('panel.aspectFreeWithEdits') : t('panel.aspectLock')" :aria-pressed="store.aspectLock && !store.hasEdits" :class="{ active: store.aspectLock && !store.hasEdits }" :disabled="store.hasEdits" @click="store.aspectLock = !store.aspectLock">
            <svg v-if="store.aspectLock" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M192 288V192A128 128 0 0 1 448 192V288H384V192A64 64 0 0 0 256 192V288ZM176 288H464A48 48 0 0 1 512 336V528A48 48 0 0 1 464 576H176A48 48 0 0 1 128 528V336A48 48 0 0 1 176 288Z"/></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M320 288V192A128 128 0 0 1 576 192V256H512V192A64 64 0 0 0 384 192V288ZM112 288H400A48 48 0 0 1 448 336V528A48 48 0 0 1 400 576H112A48 48 0 0 1 64 528V336A48 48 0 0 1 112 288Z"/></svg>
          </button>
          <input
              type="number"
              id="rows"
              :value="store.rows"
              @input="store.updateRows($event.target.value)"
              @change="$event.target.value = store.rows"
              :disabled="!!drawing.someoneInside"
              :title="drawing.someoneInside"
              min="1"
              :max="store.maxRows"
              class="mono"
          >
        </div>
      </div>

      <div class="field">
        <div class="label-group"><label for="renderStyle">{{ t('panel.renderStyle.label') }}</label><HelpInfo :text="help('renderStyle')" /></div>
        <select id="renderStyle" v-model="store.renderStyle">
          <option value="ansi">{{ t('panel.renderStyle.ansi') }}</option>
          <option value="colorAscii">{{ t('panel.renderStyle.colorAscii') }}</option>
          <option value="ascii">{{ t('panel.renderStyle.ascii') }}</option>
        </select>
      </div>

      <FontField/>

      <div class="field">
        <div class="label-group"><label for="quantize">{{ t('panel.quantize.label') }}</label><HelpInfo :text="help('quantize')" /></div>
        <select id="quantize" v-model="store.quantize">
          <option value="none">{{ t('panel.quantize.none') }}</option>
          <option value="vga">{{ t('panel.quantize.vga') }}</option>
          <option value="cga">{{ t('panel.quantize.cga') }}</option>
          <option value="count">{{ t('panel.quantize.count') }}</option>
          <option value="palette">{{ t('panel.quantize.palette') }}</option>
        </select>
      </div>

      <RangeField v-if="store.quantize === 'count'" :setting="getSetting('colorCount')" v-model="store.colorCount"/>
      <div v-else-if="store.quantize === 'palette'" class="field">
        <label for="palette">{{ t('panel.paletteColors.label') }}</label>
        <input type="text" id="palette" v-model.lazy="store.palette" placeholder="#FFFFFF #000000">
      </div>
      <template v-if="store.quantize !== 'none'">
        <div class="field">
          <div class="label-group"><label for="ditherStyle">{{ t('panel.ditherStyle.label') }}</label><HelpInfo :text="help('ditherStyle')" /></div>
          <select id="ditherStyle" v-model="store.ditherStyle">
            <option value="floyd">{{ t('panel.ditherStyle.floyd') }}</option>
            <option value="bayer">{{ t('panel.ditherStyle.bayer') }}</option>
          </select>
        </div>
        <RangeField :setting="getSetting('dither')" v-model="store.dither"/>
      </template>
    </fieldset>

    <template v-for="(group, i) in sliderGroups" :key="group.id">
      <!-- Under a folded group its title's line is the separator. -->
      <hr v-if="i === 0 || !isFolded(sliderGroups[i - 1].id)"/>

      <!-- Before Image filters, the picked layer's Characters and the picture's own settings. -->
      <template v-if="group.id === 'effects'">
        <fieldset class="characters" :disabled="!!locked" :title="locked">
          <legend>{{ t('panel.groups.characters', { name: layerName(picked) }) }}</legend>
          <p v-if="charsNote" class="note">{{ charsNote }}</p>

          <div class="field">
            <div class="label-group"><label :for="ansi ? 'charChoice' : 'charChoiceAscii'">{{ t('panel.charChoice.label') }}</label><HelpInfo :text="help(ansi ? 'charChoice' : 'charChoiceAscii')" /></div>
            <select v-if="ansi" id="charChoice" v-model="own.charChoice">
              <option value="random">{{ t('panel.charChoice.random') }}</option>
              <option value="best">{{ t('panel.charChoice.best') }}</option>
              <option value="shape">{{ t('panel.charChoice.shape') }}</option>
            </select>
            <select v-else id="charChoiceAscii" v-model="own.charChoiceAscii">
              <option value="weight">{{ store.renderStyle === 'ascii' ? t('panel.charChoice.brightness') : t('panel.charChoice.intensity') }}</option>
              <option value="shape">{{ t('panel.charChoice.shape') }}</option>
            </select>
          </div>

          <div class="field">
            <div class="label-row">
              <div class="label-group"><label for="chars">{{ t('panel.chars.label') }}</label><HelpInfo :text="help('chars')" /></div>
              <span class="value">{{ charsetName }}</span>
            </div>
            <CharsetField v-if="store.renderStyle === 'ansi'" id="chars" v-model="own.chars" :presets="ANSI_CHARSETS"/>
            <CharsetField v-else id="chars" v-model="own.charsAscii" :presets="ASCII_CHARSETS"/>
          </div>

          <div v-if="showSeed" class="field">
            <div class="label-group"><label for="seed">{{ t('panel.seed.label') }}</label><HelpInfo :text="help('seed')" /></div>
            <div class="row-inputs">
              <input type="text" id="seed" v-model.lazy="own.seed" :placeholder="t('panel.seed.placeholder')">
              <button @click="store.randomizeSeed(picked)" :title="t('panel.seed.randomize')">🎲</button>
            </div>
          </div>

          <RangeField v-if="showSolids" :setting="getSetting('solids')" v-model="own.solids"/>
          <RangeField v-if="showPatternLight" :setting="getSetting('patternLight')" v-model="own.patternLight"/>
        </fieldset>

        <hr/>

        <fieldset class="picture" :class="{ off: !!pictureOff }" :disabled="!!(locked || pictureOff)" :title="locked || pictureOff">
          <legend>{{ t('panel.groups.picture', { name: layerName('base') }) }}</legend>
          <p v-if="pictureOff" class="note">{{ pictureOff }}</p>

          <div class="field">
            <div class="label-group"><label for="smoothing">{{ t('panel.smoothing.label') }}</label><HelpInfo :text="help('smoothing')" /></div>
            <select id="smoothing" v-model="store.smoothing">
              <option value="low">{{ t('panel.smoothing.low') }}</option>
              <option value="medium">{{ t('panel.smoothing.medium') }}</option>
              <option value="high">{{ t('panel.smoothing.high') }}</option>
            </select>
          </div>
        </fieldset>
      </template>

      <fieldset :class="{ folded: isFolded(group.id), off: group.id === 'effects' && !!pictureOff }" :disabled="!!groupOff(group.id)" :title="groupOff(group.id)">
        <legend>
          <button class="fold" :aria-expanded="!isFolded(group.id)" :aria-controls="`group-${group.id}`" @click="toggleFold(group.id)">
            <svg class="chevron" viewBox="0 0 448 512" aria-hidden="true"><path d="M201.4 342.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 274.7 86.6 137.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>
            {{ group.title }}
            <span v-if="isFolded(group.id) && onCount(group)" class="on">{{ t('panel.onCount', onCount(group)) }}</span>
          </button>
          <button :disabled="!!groupOff(group.id)" @click="store.resetGroup(group.id)" tabindex="-1">{{ t('panel.reset') }}</button>
        </legend>

        <div v-show="!isFolded(group.id)" :id="`group-${group.id}`">
          <!-- Undoable: each drag, nudge or color pick is one step (setSlider, then commitSliders). -->
          <RangeField
              v-for="slider in group.sliders"
              :key="slider.key"
              :setting="slider"
              :model-value="store[slider.key]"
              @update:model-value="store.setSlider(slider.key, $event)"
              @commit="store.commitSliders(slider.key, $event)"
          >
            <!-- Its colors: Edges' one, Threshold's dark and light. -->
            <input
                v-for="key in [slider.companion ?? []].flat()"
                :key="key"
                type="color"
                :aria-label="getSetting(key).label"
                :title="getSetting(key).label"
                :value="store[key]"
                @input="store.setSlider(key, $event.target.value)"
                @change="store.commitSliders(key)"
            >
          </RangeField>
        </div>
      </fieldset>
    </template>

    <button :disabled="!!locked" :title="locked" @click="store.resetSliders">{{ t('panel.resetAll') }}</button>

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

legend span.sub {
  margin-left: 4px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  color: var(--text-faint);
}

/* A line under a section's title: what it's about, or why it's off. */
p.note {
  margin: -8px 0 12px;
  font-size: 11px;
  font-style: italic;
  color: var(--text-muted);
}

/* The picture's settings away from its layer: off, and dimmed. */
fieldset.off {
  opacity: 0.5;
}

/* Folded, a group is its underlined title (where it was: folding doesn't move it), with no room for sliders under it. */
fieldset.folded legend {
  margin-bottom: 0;
}

legend button.fold {
  float: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: inherit;
}

legend button.fold svg.chevron {
  width: 9px;
  height: 9px;
  fill: currentColor;
  transition: transform 0.15s;
}

legend button.fold[aria-expanded="false"] svg.chevron {
  transform: rotate(-90deg);
}

legend button.fold span.on {
  color: var(--accent-hot);
  text-transform: none;
  letter-spacing: 0;
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
  white-space: nowrap;
}

/* The label row shows the value, so the tooltip is gone (display, not visibility: hidden, so it takes no room;
   at a slider's far end it would hang past the row). */
:deep(span.value-tooltip) {
  display: none;
}

@media (max-width: 768px) {
  aside.control-panel {
    height: 100dvh;
  }

  /* A phone's finger covers the label row's value: the tooltip shows while dragging. */
  :deep(span.value-tooltip) {
    display: block;
  }
}
</style>