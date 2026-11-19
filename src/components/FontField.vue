<script setup>
import { ref, computed, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { DISPLAY_FONTS, MIN_FONT_SIZE as MIN_SIZE, MAX_FONT_SIZE as MAX_SIZE } from '@/lib/displayFonts';
import { useProjectStore } from '@/store/ProjectStore';
import { addFont, addBitmapFont, storedBitmapFont, removeFont } from '@/lib/userFonts';
import { fontId, fontSheet } from '@/lib/BitmapFont';
import { downloadBlob, fileStem } from '@/document/projectIO';
import HelpInfo from '@/components/HelpInfo.vue';

// The font the art is drawn in, and its size: one of Phosphor's, or a monospaced one you load from
// your computer (userFonts.js). Kept in this browser, not in the project.
const { t } = useI18n();
const workspace = useWorkspaceStore();
const project = useProjectStore();
const current = computed(() => workspace.displayFontSpec);
const loaded = computed(() => workspace.userFonts ?? []);
const drawn = computed(() => project.drawingFont);   // the drawing's own bitmap font, if it has one (the document's)
const yours = computed(() => loaded.value.filter((font) => font.id !== (drawn.value && current.value.id)));
const pad = (font) => String(font.height).padStart(2, '0');
const isLoaded = computed(() => loaded.value.some((font) => font.id === current.value.id));
const hostsFont = computed(() => !!workspace.roomFont);   // the host's, so not yours to change here
const problem = ref('');
const fileInput = useTemplateRef('file');

const without = (sizes, id) => Object.fromEntries(Object.entries(sizes).filter(([key]) => key !== id));
const naturalSize = (id) => (drawn.value && fontId(drawn.value) === id ? drawn.value.height : DISPLAY_FONTS.find((font) => font.id === id)?.size ?? 16);

// The picked file, used when it's a font Phosphor can use; otherwise we say why not. (The picker
// opens from a button's click: Safari opens one only in answer to a click, not a menu choice.)
const onFile = async (event) => {
  const [file] = event.target.files;
  event.target.value = ''; // so the same file can be picked again
  if (!file) return;
  problem.value = '';
  try {
    const bitmap = /\.(f\d\d|png)$/i.test(file.name) || file.type === 'image/png';
    const font = await (bitmap ? addBitmapFont(file) : addFont(file));
    workspace.userFonts = [...loaded.value.filter((f) => f.id !== font.id), font];
    await choose(font.id);
  } catch (error) {
    problem.value = error.message;
  }
};

// A bitmap font becomes the drawing's own; any other font takes it away again.
async function choose(id) {
  if (loaded.value.find((font) => font.id === id)?.kind === 'bitmap') {
    project.setDrawingFont(await storedBitmapFont(id));
    return;
  }
  if (project.drawingFont) project.setDrawingFont(null);
  workspace.displayFont = id;
}

const onSelect = async (event) => {
  problem.value = '';
  try {
    await choose(event.target.value);
  } catch (error) {
    problem.value = error.message;
  }
};

const stem = (ext) => fileStem(drawn.value.name, ext) || 'font'; // a nameless font still gets a name

const saveRaw = () => downloadBlob(new Blob([drawn.value.bytes]), `${stem(`F${pad(drawn.value)}`)}.F${pad(drawn.value)}`);

const savePng = async () => {
  const { width, height, data } = fontSheet(drawn.value), canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
  downloadBlob(await new Promise((resolve) => canvas.toBlob(resolve, 'image/png')), `${stem('png')}.png`);
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

const remove = async () => {
  const { id } = current.value, drawsIn = !!drawn.value && fontId(drawn.value) === id; // the drawing's own: it stays, at its size
  await removeFont(id, { keepFace: drawsIn });
  workspace.userFonts = loaded.value.filter((font) => font.id !== id);
  if (!drawsIn) workspace.displayFontSizes = without(workspace.displayFontSizes, id);
  if (!drawn.value) workspace.displayFont = DISPLAY_FONTS[0].id; // a drawing keeps its own font: it's the document's
};
</script>

<template>
  <div class="field">
    <div class="label-row">
      <div class="label-group"><label for="displayFont">{{ t('font.label') }}</label><HelpInfo :name="t('font.label')" :text="t('font.help')"/></div>
      <span class="actions">
        <button v-if="drawn" class="text" @click="saveRaw">{{ t('font.saveRaw', { height: pad(drawn) }) }}</button>
        <button v-if="drawn" class="text" @click="savePng">{{ t('font.savePng') }}</button>
        <button v-if="isLoaded" class="text" :title="t('font.removeTitle')" :aria-label="t('font.removeAria')" @click="remove">{{ t('font.remove') }}</button>
        <button class="text" :title="t('font.loadTitle')" :disabled="hostsFont" @click="fileInput.click()">{{ t('font.load') }}</button>
      </span>
      <input ref="file" type="file" accept=".ttf,.otf,.woff,.woff2,.png,.f01,.f02,.f03,.f04,.f05,.f06,.f07,.f08,.f09,.f10,.f11,.f12,.f13,.f14,.f15,.f16,.f17,.f18,.f19,.f20,.f21,.f22,.f23,.f24,.f25,.f26,.f27,.f28,.f29,.f30,.f31,.f32" hidden @change="onFile">
    </div>
    <div class="row-inputs">
      <select id="displayFont" :value="current.id" :disabled="hostsFont" @change="onSelect">
        <optgroup :label="t('font.groupBuiltIn')">
          <option v-for="font in DISPLAY_FONTS" :key="font.id" :value="font.id">{{ font.name }}</option>
        </optgroup>
        <optgroup v-if="drawn" :label="t('font.thisDrawing')">
          <option :value="current.id">{{ current.name }}</option>
        </optgroup>
        <optgroup v-if="yours.length" :label="t('font.groupYours')">
          <option v-for="font in yours" :key="font.id" :value="font.id">{{ font.name }}</option>
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
