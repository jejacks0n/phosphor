<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ModalDialog from '@/components/ModalDialog.vue';
import { useProjectStore } from '@/store/ProjectStore';
import { AnsiFile } from '@/lib/AnsiFile';
import { charRowsOf } from '@/lib/Cells';
import { fileStem, timestamped } from '@/document/projectIO';

// Save Project and the two exports: the filename (it renames the document; every browser downloads
// with it, Safari included), and for .ans the characters CP437 can't hold, with what's written instead.
const props = defineProps({
  ext: { type: String, required: true }, // 'phosphor' | 'ans' | 'utf8ans' | 'ansimation' | 'utf8ansimation' | 'cast' | 'gif'
});
const emit = defineEmits(['close']);
const { t } = useI18n();
const project = useProjectStore();

const FORMAT_META = {
  phosphor: { action: 'save', busy: 'saving' },
  ans: { action: 'export', busy: 'exporting' },
  ansimation: { action: 'export', busy: 'exporting', ext: 'ans', animated: true },
  utf8ansimation: { action: 'export', busy: 'exporting', ext: 'utf8ans', animated: true },
  cast: { action: 'export', busy: 'exporting', animated: true },
  gif: { action: 'export', busy: 'exporting', animated: true },
  utf8ans: { action: 'export', busy: 'exporting' },
};

const meta = computed(() => FORMAT_META[props.ext]);
const title = computed(() => t(`save.formats.${props.ext}.title`));
const sub = computed(() => t(`save.formats.${props.ext}.sub`));
const actionLabel = computed(() => t(`common.${meta.value.action}`));
const busyLabel = computed(() => t(`common.${meta.value.busy}`));
const extension = computed(() => meta.value.ext ?? props.ext);
const animated = computed(() => !!meta.value.animated);
// A terminal shows the rows it has: an animation moves its cursor, so it can't scroll down to the rest.
const tooTall = computed(() => ['ansimation', 'utf8ansimation'].includes(props.ext) && (project.cols > 80 || charRowsOf(project.rows) > 25));

const name = ref(timestamped(project.filename ?? 'untitled'));
const saving = ref(false);
const problem = ref('');
const stem = computed(() => fileStem(name.value, extension.value));
const listed = (cells) => [...AnsiFile.unmappable(cells)].map(([char, { count, as }]) => ({ char, count, as }));
const replacements = ref(props.ext === 'ans' ? listed(project.cells) : []);
// An animated .ans: what every frame holds, once they're built.
if (props.ext === 'ansimation') {
  project.animationCells().then((frames) => { replacements.value = listed((function* all() { for (const cells of frames) yield* cells; })()); });
}

async function save() {
  if (!stem.value || saving.value) return;
  saving.value = true;
  problem.value = '';
  try {
    if (props.ext === 'phosphor') await project.saveProject(stem.value);
    else if (animated.value) await project.exportAnimation(props.ext, { filename: stem.value });
    else await project.exportFile(props.ext, { filename: stem.value });
    emit('close');
  } catch (error) {
    console.warn('Could not save the file', error);
    problem.value = error.userMessage ?? t('save.saveFailed');
    saving.value = false;
  }
}

// Not while a save is under way: if it fails, this is where that's said.
function cancel() {
  if (!saving.value) emit('close');
}
</script>

<template>
  <ModalDialog :title="title" :sub="sub" @cancel="cancel">
    <form @submit.prevent="save">
      <label for="save-filename">{{ t('save.fileName') }}</label>
      <div class="name">
        <input id="save-filename" v-model="name" autofocus autocomplete="off" spellcheck="false" @focus="$event.target.select()">
        <span class="ext">.{{ extension }}</span>
      </div>

      <p v-if="tooTall" class="note">{{ t('save.tooTall', { cols: project.cols, rows: charRowsOf(project.rows) }) }}</p>

      <template v-if="replacements.length">
        <p class="note">
          {{ t('save.cp437Note', { count: replacements.length }, replacements.length) }}
        </p>
        <ul class="replacements" :aria-label="t('save.replacementsAria')" tabindex="0">
          <li v-for="r in replacements" :key="r.char">
            <span class="char">{{ r.char }}</span>
            <span class="arrow" :aria-label="t('save.becomesAria')">→</span>
            <span class="char">{{ r.as }}</span>
            <span class="count">{{ t('save.cellCount', { count: r.count }, r.count) }}</span>
          </li>
        </ul>
        <p class="hint">{{ t('save.keepHint') }}</p>
      </template>

      <p v-if="problem" class="problem" role="alert">{{ problem }}</p>

      <div class="actions">
        <button type="button" class="cancel" :aria-disabled="saving" @click="cancel">{{ t('common.cancel') }}</button>
        <button type="submit" class="primary" :disabled="!stem">{{ saving ? busyLabel : actionLabel }}</button>
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

p.problem {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--danger);
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

button.cancel[aria-disabled="true"] {
  opacity: 0.5;
  cursor: default;
}

button.primary {
  min-width: 90px;
}
</style>
