<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { DISPLAY_FONTS, MIN_FONT_SIZE as MIN_SIZE, MAX_FONT_SIZE as MAX_SIZE } from '@/lib/displayFonts';
import { useProjectStore } from '@/store/ProjectStore';
import { fontId } from '@/lib/BitmapFont';
import { linkedFontOf } from '@/lib/linkedFonts';
import { notSetUp } from '@/lib/fontSetup';
import { storedBitmapFont } from '@/lib/userFonts';
import { useFontActions } from '@/composables/useFontActions';
import HelpInfo from '@/components/HelpInfo.vue';

// The font the art is drawn in, and its size: one of Phosphor's, or one you loaded (userFonts.js). Kept in this
// browser, not in the project. Fonts are loaded, saved and removed on the palette layer's Fonts page: Manage fonts.
const { t } = useI18n();
const workspace = useWorkspaceStore();
const project = useProjectStore();
const current = computed(() => workspace.displayFontSpec);
const loaded = computed(() => workspace.userFonts ?? []);
const drawn = computed(() => project.drawingFont);   // the drawing's own bitmap font, if it has one (the document's)
const credit = computed(() => (drawn.value ? linkedFontOf(fontId(drawn.value))?.credit : null)); // a linked font's credit, like FROGBLOCK's
const yours = computed(() => loaded.value.filter((font) => font.id !== (drawn.value && current.value.id)));
const { choose, hostsFont } = useFontActions();
// In a room, the bitmap fonts of yours that aren't set up (a room can't edit blocks, so it takes no such font).
const notReady = ref(new Set());
let reading = 0; // the newest read's number, so an older one can't overwrite it
watch([yours, () => project.inRoom, hostsFont], async ([list, inRoom, theirs]) => {
  const mine = ++reading;
  const ids = inRoom && !theirs ? list.filter((font) => font.kind === 'bitmap') : [];
  const bad = await Promise.all(ids.map(async (font) => (notSetUp(await storedBitmapFont(font.id).catch(() => null)) ? font.id : null)));
  if (mine === reading) notReady.value = new Set(bad.filter(Boolean));
}, { immediate: true });
const problem = ref(''); // why the font picked in the dropdown couldn't be used

const without = (sizes, id) => Object.fromEntries(Object.entries(sizes).filter(([key]) => key !== id));
const naturalSize = (id) => (drawn.value && fontId(drawn.value) === id ? drawn.value.height : DISPLAY_FONTS.find((font) => font.id === id)?.size ?? 16);

const onSelect = async (event) => {
  problem.value = '';
  try {
    await choose(event.target.value);
  } catch (error) {
    problem.value = error.message;
    event.target.value = current.value.id; // back to the font in use
  }
};

// The palette layer on its Fonts page, whatever tool is in hand; from SAUCE, the art is shown first. With no drawing
// it opens over the start screen (EditWorkspace).
const manage = () => {
  if (project.image && !workspace.editMode) workspace.editorTab = 'output';
  workspace.paletteLayerPage = 'fonts';
  workspace.paletteLayerOpen = true;
};

// A size in px, kept for this font; its own size is kept as no size at all. Typed, it waits for Enter or a click
// elsewhere, and Escape puts the field back to the size in use, as in Dimensions (ControlPanel).
const onSize = (event) => {
  const px = Math.round(Number(event.target.value)), { id } = current.value;
  if (!(px >= MIN_SIZE && px <= MAX_SIZE)) {
    event.target.value = current.value.size;
    return;
  }
  workspace.displayFontSizes = px === naturalSize(id) ? without(workspace.displayFontSizes, id) : { ...workspace.displayFontSizes, [id]: px };
};
</script>

<template>
  <div class="field">
    <div class="label-row">
      <div class="label-group"><label for="displayFont">{{ t('font.label') }}</label><HelpInfo :name="t('font.label')" :text="t('font.help')"/></div>
      <!-- Doesn't take focus, so the open layer keeps the keyboard (Escape); data-palette-toggle: it doesn't close the layer first. -->
      <button
          class="text"
          data-palette-toggle
          :title="t('font.manageTitle')"
          @mousedown.prevent
          @click="manage"
      >{{ t('font.manage') }}</button>
    </div>
    <div class="row-inputs">
      <select id="displayFont" :value="current.id" :disabled="hostsFont" @change="onSelect">
        <optgroup :label="t('font.groupBuiltIn')">
          <option v-for="font in DISPLAY_FONTS" :key="font.id" :value="font.id">{{ font.name }}</option>
        </optgroup>
        <optgroup v-if="drawn" :label="project.image ? t('font.thisDrawing') : t('font.nextDrawing')">
          <option :value="current.id">{{ current.name }}</option>
        </optgroup>
        <optgroup v-if="yours.length" :label="t('font.groupYours')">
          <option v-for="font in yours" :key="font.id" :value="font.id" :disabled="notReady.has(font.id)">{{ font.name }}</option>
        </optgroup>
      </select>
      <input
          type="number"
          class="mono size"
          :aria-label="t('font.sizeAria')"
          :title="t('font.sizeTitle')"
          :value="current.size"
          :min="MIN_SIZE"
          :max="MAX_SIZE"
          :disabled="hostsFont"
          @change="onSize"
          @keydown.esc="$event.target.value = current.size"
      >
    </div>
    <p v-if="hostsFont" class="hosts-font">{{ t('font.hostsFont') }}</p>
    <p v-if="credit" class="credit">{{ credit }}</p>
    <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
  </div>
</template>

<style scoped>
select {
  flex: 1;
  min-width: 0;
}

input.size {
  width: 56px;
  flex-shrink: 0;
}

/* Beside the label, styled like the panel's RESET buttons: small, quiet, uppercase. */
button.text {
  padding: 3px 0;
  border: none;
  box-shadow: none !important;
  background: transparent;
  font: inherit;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-faint);
  opacity: 0.8; /* as the RESET buttons beside the section titles */
  cursor: pointer;
}

button.text:hover {
  transform: none;
  background: transparent;
  color: var(--accent-hot);
}

p.problem {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--danger);
}

p.credit {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

p.hosts-font {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-faint);
}
</style>
