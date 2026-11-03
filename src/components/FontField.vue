<script setup>
import { ref, computed, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { DISPLAY_FONTS, MIN_FONT_SIZE as MIN_SIZE, MAX_FONT_SIZE as MAX_SIZE } from '@/lib/displayFonts';
import { addFont, removeFont } from '@/lib/userFonts';
import HelpInfo from '@/components/HelpInfo.vue';

// The font the art is drawn in, and its size: one of Phosphor's, or a monospaced one you load from
// your computer (userFonts.js). Kept in this browser, not in the project.
const { t } = useI18n();
const workspace = useWorkspaceStore();
const current = computed(() => workspace.displayFontSpec);
const loaded = computed(() => workspace.userFonts ?? []);
const isLoaded = computed(() => loaded.value.some((font) => font.id === current.value.id));
const hostsFont = computed(() => !!workspace.roomFont);   // the host's, so not yours to change here
const problem = ref('');
const fileInput = useTemplateRef('file');

const without = (sizes, id) => Object.fromEntries(Object.entries(sizes).filter(([key]) => key !== id));
const naturalSize = (id) => DISPLAY_FONTS.find((font) => font.id === id)?.size ?? 16;

// The picked file, used when it's a font Phosphor can use; otherwise we say why not. (The picker
// opens from a button's click: Safari opens one only in answer to a click, not a menu choice.)
const onFile = async (event) => {
  const [file] = event.target.files;
  event.target.value = ''; // so the same file can be picked again
  if (!file) return;
  problem.value = '';
  try {
    const font = await addFont(file);
    workspace.userFonts = [...loaded.value, font];
    workspace.displayFont = font.id;
  } catch (error) {
    problem.value = error.message;
  }
};

const onSelect = (event) => {
  problem.value = '';
  workspace.displayFont = event.target.value;
};

// A size in px, kept for this font; its own size is kept as no size at all.
const onSize = (event) => {
  const px = Math.round(Number(event.target.value)), { id } = current.value;
  if (!(px >= MIN_SIZE && px <= MAX_SIZE)) {
    event.target.value = current.value.size;
    return;
  }
  workspace.displayFontSizes = px === naturalSize(id) ? without(workspace.displayFontSizes, id) : { ...workspace.displayFontSizes, [id]: px };
};

const remove = async () => {
  const { id } = current.value;
  await removeFont(id);
  workspace.userFonts = loaded.value.filter((font) => font.id !== id);
  workspace.displayFontSizes = without(workspace.displayFontSizes, id);
  workspace.displayFont = DISPLAY_FONTS[0].id;
};
</script>

<template>
  <div class="field">
    <div class="label-row">
      <div class="label-group"><label for="displayFont">{{ t('font.label') }}</label><HelpInfo :text="t('font.help')"/></div>
      <span class="actions">
        <button v-if="isLoaded" class="text" :title="t('font.removeTitle')" :aria-label="t('font.removeAria')" @click="remove">{{ t('font.remove') }}</button>
        <button class="text" :title="t('font.loadTitle')" :disabled="hostsFont" @click="fileInput.click()">{{ t('font.load') }}</button>
      </span>
      <input ref="file" type="file" accept=".ttf,.otf,.woff,.woff2" hidden @change="onFile">
    </div>
    <div class="row-inputs">
      <select id="displayFont" :value="current.id" :disabled="hostsFont" @change="onSelect">
        <optgroup :label="t('font.groupBuiltIn')">
          <option v-for="font in DISPLAY_FONTS" :key="font.id" :value="font.id">{{ font.name }}</option>
        </optgroup>
        <optgroup v-if="loaded.length" :label="t('font.groupYours')">
          <option v-for="font in loaded" :key="font.id" :value="font.id">{{ font.name }}</option>
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
      >
    </div>
    <p v-if="hostsFont" class="hosts-font">{{ t('font.hostsFont') }}</p>
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
span.actions {
  display: flex;
  gap: 8px;
}

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

button.text:disabled {
  opacity: 0.4;
  cursor: default;
}

button.text:hover:not(:disabled) {
  transform: none;
  background: transparent;
  color: var(--accent-hot);
}

p.hosts-font {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-faint);
}

p.problem {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--danger);
}
</style>
