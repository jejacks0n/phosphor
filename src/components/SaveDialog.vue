<script setup>
import { ref, computed } from 'vue';
import ModalDialog from '@/components/ModalDialog.vue';
import { useProjectStore } from '@/store/ProjectStore';
import { AnsiFile } from '@/lib/AnsiFile';
import { fileStem } from '@/document/projectIO';

// Save Project and the two exports: the filename (it renames the document; every browser downloads
// with it, Safari included), and for .ans the characters CP437 can't hold, with what's written instead.
const props = defineProps({
  ext: { type: String, required: true }, // 'phosphor' | 'ans' | 'utf8ans'
});
const emit = defineEmits(['close']);
const project = useProjectStore();

const FORMATS = {
  phosphor: { title: 'Save project', sub: 'Everything, to open again in Phosphor: the image, both layers and the settings.', action: 'Save' },
  ans: { title: 'Export .ans', sub: 'Classic ANSI art: CP437 characters with ANSI colours, for art viewers and BBS-era tools.', action: 'Export' },
  utf8ans: { title: 'Export .utf8ans', sub: 'ANSI art as UTF-8 text with ANSI colours, for modern terminals. Every character is kept.', action: 'Export' },
};
const format = computed(() => FORMATS[props.ext]);

const name = ref(project.filename ?? 'untitled');
const stem = computed(() => fileStem(name.value, props.ext));
const replacements = computed(() => (props.ext === 'ans'
  ? [...AnsiFile.unmappable(project.cells)].map(([char, { count, as }]) => ({ char, count, as }))
  : []));

async function save() {
  if (!stem.value) return;
  emit('close');
  if (props.ext === 'phosphor') await project.saveProject(stem.value);
  else await project.exportFile(props.ext, { filename: stem.value });
}
</script>

<template>
  <ModalDialog :title="format.title" :sub="format.sub" @cancel="emit('close')">
    <form @submit.prevent="save">
      <label for="save-filename">File name</label>
      <div class="name">
        <input id="save-filename" v-model="name" autofocus autocomplete="off" spellcheck="false" @focus="$event.target.select()">
        <span class="ext">.{{ ext }}</span>
      </div>

      <template v-if="replacements.length">
        <p class="note">
          {{ replacements.length === 1 ? 'One character isn\'t' : `${replacements.length} characters aren't` }} in CP437, the
          character set .ans uses, so {{ replacements.length === 1 ? 'it\'s' : 'they\'re' }} written as:
        </p>
        <ul class="replacements" aria-label="Replacements" tabindex="0">
          <li v-for="r in replacements" :key="r.char">
            <span class="char">{{ r.char }}</span>
            <span class="arrow" aria-label="becomes">→</span>
            <span class="char">{{ r.as }}</span>
            <span class="count">{{ r.count }} {{ r.count === 1 ? 'cell' : 'cells' }}</span>
          </li>
        </ul>
        <p class="hint">Export as .utf8ans to keep them.</p>
      </template>

      <div class="actions">
        <button type="button" class="cancel" @click="emit('close')">Cancel</button>
        <button type="submit" class="primary" :disabled="!stem">{{ format.action }}</button>
      </div>
    </form>
  </ModalDialog>
</template>

<style scoped>
label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--accent-hot);
}

div.name {
  display: flex;
  align-items: center;
  gap: 6px;
}

div.name input {
  flex: 1;
  min-width: 0;
}

span.ext {
  flex-shrink: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: var(--text-muted);
}

p.note {
  margin: 14px 0 6px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-muted);
}

/* As long as it needs to be, scrolling past a few rows. */
ul.replacements {
  max-height: 180px;
  margin: 0;
  padding: 4px 0;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-1);
}

ul.replacements:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 3px 12px;
}

span.char {
  width: 1.4em;
  font-family: 'JetBrains Mono', monospace;
  font-size: 17px;
  text-align: center;
  color: var(--text);
}

span.arrow {
  color: var(--text-faint);
}

span.count {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-muted);
}

p.hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

div.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

button.cancel {
  padding: 6px 4px;
  border: 0;
  background: none;
  box-shadow: none;
  color: var(--text-muted);
  font: inherit;
}

button.primary {
  min-width: 90px;
}
</style>
