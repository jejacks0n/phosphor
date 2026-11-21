<script setup>
import { computed, reactive, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLocalStorage, useMediaQuery } from '@vueuse/core';
import { useProjectStore } from '@/store/ProjectStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { usePluginStore } from '@/store/PluginStore';
import { useRoomStore } from '@/store/RoomStore';
import { CHAR_KEYS, SETTINGS, getSetting } from '@/store/settings';
import { useLayerName } from '@/composables/useLayerName';
import { useStandIn, solverName } from '@/composables/useStandIn';

import ProjectActions from '@/components/ProjectActions.vue';
import ProjectFooter from '@/components/ProjectFooter.vue';
import HelpInfo from '@/components/HelpInfo.vue';
import RangeField from '@/components/RangeField.vue';
import CharsetField from '@/components/CharsetField.vue';
import FontField from '@/components/FontField.vue';
import SolverOptions from '@/components/SolverOptions.vue';
import { isSolverRef } from '@/plugins/solvers';
import { filterEntry } from '@/plugins/filters';
import { ANSI_CHARSETS, ASCII_CHARSETS, charsetPresetsFor } from '@/lib/charsetPresets';
import { resolves } from '@/lib/CharResolver';
import { charRowsOf } from '@/lib/Cells';
import { isUniform } from '@/lib/ImageProcessor';
import { FOCUSABLE } from '@/lib/focus';
import { ownsKey } from '@/lib/fields';
import { desktopQuery } from '@/social/config';

const { t } = useI18n();
const store = useProjectStore();
const drawing = useDrawingStore();
const workspace = useWorkspaceStore();
const layerName = useLayerName();
const plugins = usePluginStore();
const room = useRoomStore();
const standIn = useStandIn();

// Why the settings are off, if they are: only the host's in a room; and inside an art layer the dimmed rest is a snapshot
// of how they had the picture, which a change would leave stale.
const locked = computed(() => drawing.hostOnly || (store.artInside ? t('art.settingsOff') : null));
// Dimensions: a size typed digit by digit waits for Enter, Tab or a click elsewhere (the field's change), and Escape puts
// the field back to the grid's size, so a half-typed number never reaches the grid, a room or the undo history. The
// stepper arrows and the up and down keys give a whole size at a time, so they resize at once: their input isn't typing.
const stepped = (e) => !e.inputType;
// Characters in a room are the host's alone, and each layer has its own: an artist sees the picked layer's, with that reason.
const lockedFor = (group) => (group.id === 'characters' && drawing.hostOnly ? t('layers.charsHostOnly') : locked.value);

// The slider groups: Transforms and Adjustments are the whole drawing's, Image filters the picture's.
const sliderGroups = computed(() => [
  { id: 'transform', title: t('panel.groups.transform') },
  { id: 'adjust', title: t('panel.groups.adjust') },
  { id: 'effects', title: t('panel.groups.effects') },
].map(group => ({ ...group, sliders: SETTINGS.filter(s => s.group === group.id && s.min !== undefined) })));

// The layer the Characters section shows: the one picked, or inside an art layer its vector layer. A pick that isn't in
// the stack yet (VECTOR before the first shape brings its layer) shows the bottom's, and so does the start screen: with
// no drawing open there's no Layer 1, only the settings the next drawing starts with.
const picked = computed(() => {
  const id = store.artInside ? store.drawsOn : workspace.pickedLayer;
  return store.image && store.layerById(id) ? id : 'base';
});
const pickedKind = computed(() => store.layerById(picked.value).kind);
// Its character settings, read and written as its own (charsOf, setLayerChars), each change an undo step: a pick or a set
// typed at once, a slider's drag or nudge when it ends (its RangeField's commit).
const SLID = ['solids', 'patternLight', 'dither'];
const own = reactive(Object.fromEntries(CHAR_KEYS.map((key) => [key, computed({
  get: () => store.charsOf(picked.value)[key],
  set: (value) => {
    if (store.setLayerChars(picked.value, { [key]: value }) && !SLID.includes(key)) store.commitLayerChars();
  },
})])));
const ownParams = computed(() => store.layerParams.get(picked.value) ?? store.processParams);
// What the section says above its settings: why a plugin solver the layer chose isn't drawing it, else what it converts.
const charsNote = computed(() => {
  const why = standIn(picked.value);
  if (why) return why;
  if (picked.value === 'base') return null;
  return t(pickedKind.value === 'vector' ? 'panel.charsNoteVector' : 'panel.charsNote', { name: layerName(picked.value) });
});
// The sections under Drawing, in order: the drawing's slider groups, the picked layer's Characters (every layer converts
// something: the base its picture, a cells layer its paint, a vector layer its shapes), and only with the base picked the
// picture's own Smoothing and Image filters (effects only with a real image: not a blank canvas's or a flattened
// drawing's stand-in; a working copy, after Bake or Blend into source image, is one the filters work on).
const hasRealImage = computed(() => !!store.image && !isUniform(store.image));
const sections = computed(() => {
  const [transform, adjust, effects] = sliderGroups.value;
  const characters = { id: 'characters', title: t('panel.groups.characters', { name: layerName(picked.value) }) };
  const picture = { id: 'picture', title: t('panel.groups.picture', { name: layerName('base') }) };
  // Picture (Smoothing, how the picture and the base's own pixels are scaled to the grid) only where it changes something.
  const scaled = store.smoothingMatters ? [picture] : [];
  // After Image filters, and only where they show, a group per plugin filter (store.filterGroups), titled with its name;
  // none in a room, where none applies.
  const filters = room.inRoom ? [] : store.filterGroups.map((filter) => ({ id: filter.ref, title: filter.name, filter }));
  return [transform, adjust, characters, ...(workspace.pickedLayer === 'base' ? [...scaled, ...(hasRealImage.value ? [effects, ...filters] : [])] : [])];
});

const help = (key) => getSetting(key).help;
const ansi = computed(() => store.renderStyle === 'ansi');

// The plugin solvers the choice offers after the built-in ones: those that do the drawing's style, by name; none in a
// room, where they aren't used. A plugin solver the layer chose that isn't offered (not installed, off, not this style,
// in a room) stays as one more option, so the choice still shows it, and the file keeps it until another is chosen.
const solverChoices = computed(() => (room.inRoom ? [] : Object.entries(plugins.solvers)
  .filter(([, solver]) => solver.styles.includes(store.renderStyle)).map(([ref, { name }]) => ({ ref, name }))));
const notOffered = computed(() => {
  const ref = ansi.value ? own.charChoice : own.charChoiceAscii;
  if (!isSolverRef(ref) || solverChoices.value.some((choice) => choice.ref === ref)) return null;
  return { ref, name: t('panel.solver.notHere', { name: solverName(plugins, ref) }) };
});
// The plugin solver drawing the layer, if one is (not a stand-in), and its options' values (params' solverOptions). A
// change replaces the layer's options for that solver and keeps the others' (setLayerChars), each an undo step as a
// character setting's is: a slider's drag or nudge when it ends, a checkbox or a choice at once.
const solverInUse = computed(() => plugins.solvers[ownParams.value.solver] ?? null);
const setSolverOptions = (values) => store.setLayerChars(picked.value, { solverOptions: { ...own.solverOptions, [ownParams.value.solver]: values } });

// A section folds and unfolds on its title, and stays as it was left in this browser. Folded, a slider group says how
// many of its sliders are on (off their defaults), so a forgotten Threshold doesn't change the picture unseen.
const folded = useLocalStorage('phosphor.panel.folded', []);
const isFolded = (id) => folded.value.includes(id);
const toggleFold = (id) => { folded.value = isFolded(id) ? folded.value.filter((f) => f !== id) : [...folded.value, id]; };
// A plugin filter's group counts its options off their defaults (with no def, those saved).
const onCount = (group) => (group.filter ? filterOnCount(group.filter) : (group.sliders ?? []).filter((s) => Number(store[s.key]) !== s.default).length);
const filterOnCount = ({ def, values }) => (def ? def.options.filter((option) => values[option.id] !== option.default).length : Object.keys(values).length);

// A plugin filter's group: its options drawn as a solver's are (SolverOptions), each change the drawing's filterOptions
// with this filter's entry replaced (only its values off their defaults, none at all when every one's at its default), an
// undo step as a slider's; its Reset takes the entry out, one step. A group whose filter isn't running says why, dimmed.
const without = (ref) => Object.fromEntries(Object.entries(store.filterOptions).filter(([key]) => key !== ref));
function setFilter({ ref, def, name }, values) {
  const entry = filterEntry(def, name, values);
  store.setSlider('filterOptions', entry ? { ...without(ref), [ref]: entry } : without(ref));
}
function resetFilter(ref) {
  store.setSlider('filterOptions', without(ref));
  store.commitSliders();
}
const dimmed = (group) => !!group.filter && !['on', 'idle'].includes(group.filter.state);
function filterWords({ ref, name, state }) {
  if (state === 'missing') return t('panel.filter.missing', { name });
  if (state === 'off' || state === 'pluginsOff') return t('panel.filter.off', { name });
  if (state !== 'failed') return null;
  const why = plugins.filterFailures[ref];
  return why?.lost ? t('plugins.errors.filterLost', { name }) : t('plugins.errors.filterShader', { name, log: why?.log ?? '' });
}

// Each way of choosing characters' own options, from the way the picked layer's cells are made (an unknown choice
// from an old file or a room converts as Random or By weight, and shows their options).
const showSeed = computed(() => ownParams.value.charMode === 'random' && own.chars.length > 1);
const showPatternLight = computed(() => resolves(ownParams.value));
const showSolids = computed(() => ansi.value && showPatternLight.value); // ASCII's background is always black: no solid to prefer
// Dither works on what converts like a picture (the base's picture, a vector layer's shapes), never on paint: not on a
// cells layer, and only with a palette to dither to.
const showDither = computed(() => store.quantize !== 'none' && (picked.value === 'base' || pickedKind.value === 'vector'));

// The ready-made set the Characters field holds, or Custom.
const ansiPresets = computed(() => charsetPresetsFor(store.drawingFont, ANSI_CHARSETS, t('panel.chars.stockGroup')));
const asciiPresets = computed(() => charsetPresetsFor(store.drawingFont, ASCII_CHARSETS, t('panel.chars.stockGroup')));
const charsetName = computed(() => {
  const [chars, presets] = store.renderStyle === 'ansi' ? [own.chars, ansiPresets.value] : [own.charsAscii, asciiPresets.value];
  return presets.find((p) => p.chars === chars)?.name ?? t('common.custom');
});

// On a narrow screen the settings are a drawer, opened by the menu button (EditTabs). Opened, focus goes to its first
// control, so Tab goes on through the settings; Escape shuts it, and focus goes back to the menu button. Escape in a
// field you type in is the field's (it puts back what was typed), and a tip or a menu open in the drawer takes it first.
const panel = useTemplateRef('panel');
const wide = useMediaQuery(desktopQuery);
watch(() => workspace.settingsOpen, (open) => {
  if (open && !wide.value) panel.value?.querySelector(FOCUSABLE)?.focus();
}, { flush: 'post' }); // once App has taken the drawer's inert off
function onKeyDown(event) {
  if (event.key !== 'Escape' || event.defaultPrevented || wide.value || !workspace.settingsOpen || ownsKey(event.target, event)) return;
  event.preventDefault();
  event.stopPropagation(); // the drawer's Escape, not also the art's (a selection kept)
  workspace.toggleSettings();
  document.querySelector('nav.workspace-tabs button.menu-btn')?.focus();
}
</script>

<template>
  <aside ref="panel" class="control-panel" @keydown="onKeyDown">
    <button class="logo" :aria-label="t('about.label')" :title="t('about.label')" @click="workspace.showAboutModal = true"></button>
    <fieldset class="drawing" :disabled="!!locked" :title="locked">
      <legend>{{ t('panel.groups.drawing') }} <span class="sub">{{ t('panel.groups.drawingSub') }}</span></legend>

      <div class="field">
        <div class="label-row">
          <div class="label-group"><label for="cols">{{ getSetting('cols').label }}</label><HelpInfo :name="getSetting('cols').label" :text="help('cols')" /></div>
          <span class="value">{{ t('panel.charRows', charRowsOf(store.rows)) }}</span>
        </div>
        <div class="row-inputs">
          <input
              type="number"
              id="cols"
              :value="store.cols"
              @input="stepped($event) && store.updateCols($event.target.value)"
              @change="store.updateCols($event.target.value); $event.target.value = store.cols"
              @keydown.esc="$event.target.value = store.cols"
              :disabled="!!drawing.someoneInside"
              :title="drawing.someoneInside"
              min="1"
              :max="store.maxCols"
              class="mono"
          >
          <button :title="t('panel.aspectLock')" :aria-pressed="store.aspectLock" :class="{ active: store.aspectLock }" @click="store.setAspectLock(!store.aspectLock)">
            <svg v-if="store.aspectLock" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M192 288V192A128 128 0 0 1 448 192V288H384V192A64 64 0 0 0 256 192V288ZM176 288H464A48 48 0 0 1 512 336V528A48 48 0 0 1 464 576H176A48 48 0 0 1 128 528V336A48 48 0 0 1 176 288Z"/></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true"><path d="M320 288V192A128 128 0 0 1 576 192V256H512V192A64 64 0 0 0 384 192V288ZM112 288H400A48 48 0 0 1 448 336V528A48 48 0 0 1 400 576H112A48 48 0 0 1 64 528V336A48 48 0 0 1 112 288Z"/></svg>
          </button>
          <input
              type="number"
              id="rows"
              :aria-label="t('panel.rowsAria')"
              :value="store.rows"
              @input="stepped($event) && store.updateRows($event.target.value)"
              @change="store.updateRows($event.target.value); $event.target.value = store.rows"
              @keydown.esc="$event.target.value = store.rows"
              :disabled="!!drawing.someoneInside"
              :title="drawing.someoneInside"
              min="1"
              :max="store.maxRows"
              class="mono"
          >
        </div>
      </div>

      <div class="field">
        <div class="label-group"><label for="renderStyle">{{ t('panel.renderStyle.label') }}</label><HelpInfo :name="t('panel.renderStyle.label')" :text="help('renderStyle')" /></div>
        <select id="renderStyle" v-model="store.renderStyle">
          <option value="ansi">{{ t('panel.renderStyle.ansi') }}</option>
          <option value="colorAscii">{{ t('panel.renderStyle.colorAscii') }}</option>
          <option value="ascii">{{ t('panel.renderStyle.ascii') }}</option>
        </select>
      </div>

      <FontField/>

      <div class="field">
        <div class="label-group"><label for="quantize">{{ t('panel.quantize.label') }}</label><HelpInfo :name="t('panel.quantize.label')" :text="help('quantize')" /></div>
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
        <input type="text" id="palette" v-model.lazy="store.palette" @keydown.esc="$event.target.value = store.palette" placeholder="#FFFFFF #000000">
      </div>
    </fieldset>

    <template v-for="(group, i) in sections" :key="group.id">
      <!-- Under a folded group its title's line is the separator. -->
      <hr v-if="i === 0 || !isFolded(sections[i - 1].id)"/>

      <fieldset :class="[group.filter ? 'plugin-filter' : group.id, { folded: isFolded(group.id), dim: dimmed(group) }]" :disabled="!!locked" :title="lockedFor(group)">
        <legend class="folds">
          <button class="fold" :aria-expanded="!isFolded(group.id)" :aria-controls="`group-${group.id}`" @click="toggleFold(group.id)">
            <svg class="chevron" viewBox="0 0 448 512" aria-hidden="true"><path d="M201.4 342.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 274.7 86.6 137.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>
            <span class="title" :title="group.title">{{ group.title }}</span>
            <span v-if="isFolded(group.id) && onCount(group)" class="on">{{ t('panel.onCount', onCount(group)) }}</span>
            <span v-if="group.filter" class="chip">{{ t('panel.pluginChip') }}</span>
          </button>
          <button v-if="group.sliders" :disabled="!!locked" @click="store.resetGroup(group.id)" tabindex="-1">{{ t('panel.reset') }}</button>
          <button v-else-if="group.filter" :disabled="!!locked" @click="resetFilter(group.id)" tabindex="-1">{{ t('panel.reset') }}</button>
        </legend>

        <div v-show="!isFolded(group.id)" :id="`group-${group.id}`">
          <template v-if="group.id === 'characters'">
            <p v-if="charsNote" class="note">{{ charsNote }}</p>

            <div class="field">
              <div class="label-group"><label :for="ansi ? 'charChoice' : 'charChoiceAscii'">{{ t('panel.charChoice.label') }}</label><HelpInfo :name="t('panel.charChoice.label')" :text="help(ansi ? 'charChoice' : 'charChoiceAscii')" /></div>
              <select v-if="ansi" id="charChoice" v-model="own.charChoice">
                <option value="random">{{ t('panel.charChoice.random') }}</option>
                <option value="best">{{ t('panel.charChoice.best') }}</option>
                <option value="shape">{{ t('panel.charChoice.shape') }}</option>
                <option v-for="choice in solverChoices" :key="choice.ref" :value="choice.ref">{{ choice.name }}</option>
                <option v-if="notOffered" :value="notOffered.ref">{{ notOffered.name }}</option>
              </select>
              <select v-else id="charChoiceAscii" v-model="own.charChoiceAscii">
                <option value="weight">{{ store.renderStyle === 'ascii' ? t('panel.charChoice.brightness') : t('panel.charChoice.intensity') }}</option>
                <option value="shape">{{ t('panel.charChoice.shape') }}</option>
                <option v-for="choice in solverChoices" :key="choice.ref" :value="choice.ref">{{ choice.name }}</option>
                <option v-if="notOffered" :value="notOffered.ref">{{ notOffered.name }}</option>
              </select>
            </div>
            <SolverOptions
                v-if="solverInUse" :options="solverInUse.options" :values="ownParams.solverOptions"
                @change="setSolverOptions" @commit="store.commitLayerChars($event)"
            />

            <div class="field">
              <div class="label-row">
                <div class="label-group"><label for="chars">{{ t('panel.chars.label') }}</label><HelpInfo :name="t('panel.chars.label')" :text="help('chars')" /></div>
                <span class="value">{{ charsetName }}</span>
              </div>
              <CharsetField v-if="store.renderStyle === 'ansi'" id="chars" v-model="own.chars" :presets="ansiPresets"/>
              <CharsetField v-else id="chars" v-model="own.charsAscii" :presets="asciiPresets"/>
            </div>

            <div v-if="showSeed" class="field">
              <div class="label-group"><label for="seed">{{ t('panel.seed.label') }}</label><HelpInfo :name="t('panel.seed.label')" :text="help('seed')" /></div>
              <div class="row-inputs">
                <input type="text" id="seed" v-model.lazy="own.seed" :placeholder="t('panel.seed.placeholder')">
                <button @click="store.randomizeSeed(picked)" :title="t('panel.seed.randomize')" :aria-label="t('panel.seed.randomize')">🎲</button>
              </div>
            </div>

            <RangeField v-if="showSolids" :setting="getSetting('solids')" v-model="own.solids" @commit="store.commitLayerChars($event)"/>
            <RangeField v-if="showPatternLight" :setting="getSetting('patternLight')" v-model="own.patternLight" @commit="store.commitLayerChars($event)"/>

            <template v-if="showDither">
              <div class="field">
                <div class="label-group"><label for="ditherStyle">{{ t('panel.ditherStyle.label') }}</label><HelpInfo :name="t('panel.ditherStyle.label')" :text="help('ditherStyle')" /></div>
                <select id="ditherStyle" v-model="own.ditherStyle">
                  <option value="floyd">{{ t('panel.ditherStyle.floyd') }}</option>
                  <option value="bayer">{{ t('panel.ditherStyle.bayer') }}</option>
                </select>
              </div>
              <RangeField :setting="getSetting('dither')" v-model="own.dither" @commit="store.commitLayerChars($event)"/>
            </template>
          </template>

          <template v-else-if="group.id === 'picture'">
            <div class="field">
              <div class="label-group"><label for="smoothing">{{ t('panel.smoothing.label') }}</label><HelpInfo :name="t('panel.smoothing.label')" :text="help('smoothing')" /></div>
              <select id="smoothing" v-model="store.smoothing">
                <option value="low">{{ t('panel.smoothing.low') }}</option>
                <option value="medium">{{ t('panel.smoothing.medium') }}</option>
                <option value="high">{{ t('panel.smoothing.high') }}</option>
              </select>
            </div>
          </template>

          <template v-else-if="group.filter">
            <p v-if="filterWords(group.filter)" class="note">{{ filterWords(group.filter) }}</p>
            <SolverOptions
                v-if="group.filter.def" :id-prefix="`filter-${group.id}`" :options="group.filter.def.options" :values="group.filter.values"
                @change="setFilter(group.filter, $event)" @commit="store.commitSliders(`filterOptions:${group.id}`, $event)"
            />
          </template>

          <template v-else>
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
          </template>
        </div>
      </fieldset>
    </template>

    <p v-if="workspace.pickedLayer === 'base' && !hasRealImage" class="note effects-note">{{ t('panel.effectsNoImage') }}</p>

    <button :disabled="!!locked" :title="locked" :data-off-reason="locked ? '' : undefined" @click="store.resetSliders">{{ t('panel.resetAll') }}</button>

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

/* The logo opens About: a button with only the picture, no button look. */
button.logo {
  display: block;
  width: 100%;
  padding: 30% 0;
  margin-bottom: 10px;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  user-select: none;
  background-color: transparent;
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

/* A line under a section's title: what it's about. */
p.note {
  margin: -8px 0 12px;
  font-size: 11px;
  font-style: italic;
  color: var(--text-muted);
}

/* Folded, a group is its underlined title (where it was: folding doesn't move it), with no room for sliders under it. */
fieldset.folded legend {
  margin-bottom: 0;
}

/* A foldable group's title: one line, a long layer name in it cut short (the whole of it on hover), Reset beside it. */
legend.folds {
  display: flex;
  gap: 8px;
}

legend.folds button {
  float: none;
  flex-shrink: 0;
}

legend button.fold {
  float: none;
  display: inline-flex;
  flex-shrink: 1;
  min-width: 0;
  align-items: center;
  gap: 6px;
  padding: 0;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: inherit;
}

legend button.fold span.title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

legend button.fold svg.chevron {
  flex-shrink: 0;
  width: 9px;
  height: 9px;
  fill: currentColor;
  transition: transform 0.15s;
}

legend button.fold[aria-expanded="false"] svg.chevron {
  transform: rotate(-90deg);
}

/* A plugin filter's group: a small PLUGIN chip after its name, and dimmed (its title and options) while it isn't running. */
legend button.fold span.chip {
  flex-shrink: 0;
  padding: 0 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 3px;
  font-size: 9px;
  font-weight: 400;
  color: var(--text-faint);
}

fieldset.dim legend span.title,
fieldset.dim .solver-options {
  opacity: 0.5;
}

legend button.fold span.on {
  flex-shrink: 0;
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