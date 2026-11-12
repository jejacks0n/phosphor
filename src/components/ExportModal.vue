<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ModalDialog from '@/components/ModalDialog.vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { AnsiFile } from '@/lib/AnsiFile';
import { charRowsOf } from '@/lib/Cells';
import { fileStem, timestamped } from '@/document/projectIO';

// All export formats in one modal: ANS, UTF-8 ANS, PNG (Still), GIF, Animated ANS, Animated UTF-8
// ANS, Cast (Animated). Opened by Cmd/Ctrl+E or the Export button in ProjectActions.
const FORMATS = [
  { id: 'ans',             ext: 'ans',      group: 'still' },
  { id: 'utf8ans',         ext: 'utf8ans',  group: 'still' },
  { id: 'png',             ext: 'png',      group: 'still' },
  { id: 'gif',             ext: 'gif',      group: 'animated', animated: true },
  { id: 'ansimation',      ext: 'ans',      group: 'animated', animated: true },
  { id: 'utf8ansimation',  ext: 'utf8ans',  group: 'animated', animated: true },
  { id: 'cast',            ext: 'cast',     group: 'animated', animated: true },
];

const emit = defineEmits(['close']);
const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();

const selectedId = ref(project.hasFrames && project.animate ? 'gif' : 'ans');
const selected = computed(() => FORMATS.find(f => f.id === selectedId.value));
const name = ref(timestamped(project.filename ?? 'untitled'));
const smooth = ref(workspace.smoothText); // default follows the workspace setting, like SaveDialog
const saving = ref(false);
const problem = ref('');
const stem = computed(() => fileStem(name.value, selected.value.ext));

const tooTall = computed(() => ['ansimation', 'utf8ansimation'].includes(selectedId.value) && (project.cols > 80 || charRowsOf(project.rows) > 25));
// .ans is CP437: the characters it can't keep and what each becomes. An animated .ans lists what every frame holds,
// once they're built (a format picked meanwhile keeps its own list).
const listed = (cells) => [...AnsiFile.unmappable(cells)].map(([char, { count, as }]) => ({ char, count, as }));
const replacements = ref([]);
watch(selectedId, (id) => {
  replacements.value = id === 'ans' ? listed(project.cells) : [];
  if (id !== 'ansimation') return;
  project.animationCells().then((frames) => {
    if (selectedId.value === id) replacements.value = listed((function* all() { for (const cells of frames) yield* cells; })());
  });
}, { immediate: true });

function pickFormat(id) {
  selectedId.value = id;
  problem.value = '';
}

async function doExport() {
  if (!stem.value || saving.value) return;
  saving.value = true;
  problem.value = '';
  try {
    if (selected.value.animated) await project.exportAnimation(selectedId.value, { filename: stem.value });
    else await project.exportFile(selectedId.value, { filename: stem.value, smooth: smooth.value });
    emit('close');
  } catch (error) {
    console.warn('Could not export', error);
    problem.value = error.userMessage ?? t('save.saveFailed');
    saving.value = false;
  }
}

function cancel() {
  if (!saving.value) emit('close');
}
</script>

<template>
  <ModalDialog :title="t('export.modal.title')" :sub="t('export.modal.sub')" wide @cancel="cancel">
    <div class="export-body">

      <nav class="format-list" aria-label="Export format">
        <div class="group-label">{{ t('export.modal.still') }}</div>
        <button
            v-for="f in FORMATS.filter(f => f.group === 'still')"
            :key="f.id"
            class="format-btn"
            :class="{ selected: f.id === selectedId }"
            @click="pickFormat(f.id)"
        >
          <span class="format-name">{{ t(`export.modal.formats.${f.id}.name`) }}</span>
          <span class="format-ext">.{{ f.ext }}</span>
        </button>

        <div class="group-label animated-label">{{ t('export.modal.animated') }}</div>
        <button
            v-for="f in FORMATS.filter(f => f.group === 'animated')"
            :key="f.id"
            class="format-btn"
            :class="{ selected: f.id === selectedId }"
            :disabled="!project.hasFrames || !project.animate"
            @click="pickFormat(f.id)"
        >
          <span class="format-name">{{ t(`export.modal.formats.${f.id}.name`) }}</span>
          <span class="format-ext">.{{ f.ext }}</span>
        </button>
      </nav>

      <div class="format-detail">
        <p class="detail-desc">{{ t(`save.formats.${selectedId}.sub`) }}</p>

        <!-- PNG: smooth text option when smooth text is on -->
        <div v-if="selectedId === 'png' && workspace.smoothText" class="option-block">
          <div class="option-label">{{ t('export.modal.textRendering') }}</div>
          <div class="smooth-choices">
            <button
                class="smooth-btn"
                :class="{ selected: !smooth }"
                @click="smooth = false"
            >
              <b>{{ t('save.png.hardTitle') }}</b>
              <span>{{ t('save.png.hardText') }}</span>
            </button>
            <button
                class="smooth-btn"
                :class="{ selected: smooth }"
                @click="smooth = true"
            >
              <b>{{ t('save.png.smoothTitle') }}</b>
              <span>{{ t('save.png.smoothText') }}</span>
            </button>
          </div>
        </div>

        <!-- Animated ANS: too tall/wide warning -->
        <p v-if="tooTall" class="note warn">{{ t('export.modal.tooTall', { cols: project.cols, rows: charRowsOf(project.rows) }) }}</p>

        <!-- ANS: the characters it replaces -->
        <template v-if="replacements.length">
          <p class="note">{{ t('save.cp437Note', { count: replacements.length }, replacements.length) }}</p>
          <ul class="replacements" :aria-label="t('save.replacementsAria')" tabindex="0">
            <li v-for="r in replacements" :key="r.char">
              <span class="char">{{ r.char }}</span>
              <span class="arrow" :aria-label="t('save.becomesAria')">→</span>
              <span class="char">{{ r.as }}</span>
              <span class="count">{{ t('save.cellCount', { count: r.count }, r.count) }}</span>
            </li>
          </ul>
          <p class="note">{{ t('save.keepHint') }}</p>
        </template>

        <p v-if="problem" class="note problem" role="alert">{{ problem }}</p>

        <div class="foot">
          <div class="filename-row">
            <input
                v-model="name"
                class="filename-input"
                :aria-label="t('save.fileName')"
                autocomplete="off"
                spellcheck="false"
                autofocus
                @focus="$event.target.select()"
            >
            <span class="filename-ext">.{{ selected.ext }}</span>
          </div>
          <div class="actions">
            <button class="cancel" @click="cancel">{{ t('common.cancel') }}</button>
            <button class="primary" :disabled="!stem || saving" @click="doExport">
              {{ saving ? t('common.exporting') : t('export.modal.exportBtn', { name: t(`export.modal.formats.${selectedId}.name`) }) }}
            </button>
          </div>
        </div>
      </div>

    </div>
  </ModalDialog>
</template>

<style scoped>
div.export-body {
  display: grid;
  grid-template-columns: 190px 1fr;
  gap: 0;
  margin-top: 10px;
  min-height: 260px;
}

nav.format-list {
  border-right: 1px solid var(--border);
  padding: 0 8px 0 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

div.group-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-faint);
  padding: 8px 8px 4px;
}
div.animated-label { margin-top: 6px; }

button.format-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 5px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 0.1s;
}
button.format-btn:hover:not(:disabled) { background: var(--surface-3); }
button.format-btn.selected {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  outline: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
}
button.format-btn:disabled { opacity: 0.35; cursor: default; }

span.format-name {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}
button.format-btn.selected span.format-name { color: var(--text); }

span.format-ext {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: var(--text-faint);
  background: var(--surface-3);
  border-radius: 3px;
  padding: 1px 4px;
}
button.format-btn.selected span.format-ext {
  background: color-mix(in srgb, var(--accent) 25%, transparent);
  color: var(--accent);
}

div.format-detail {
  padding: 0 0 0 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

p.detail-desc {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0;
}

div.option-block { display: flex; flex-direction: column; gap: 6px; }

div.option-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-faint);
}

div.smooth-choices { display: flex; gap: 8px; }

button.smooth-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  text-align: left;
  font: inherit;
  line-height: 1.3;
  transition: border-color 0.1s;
}
button.smooth-btn:hover { border-color: var(--accent); }
button.smooth-btn.selected { border-color: var(--accent); }
button.smooth-btn b { font-size: 13px; }
button.smooth-btn span { font-size: 12px; color: var(--text-muted); }

p.note {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
  margin: 0;
}
p.warn { color: var(--warning); }

/* As long as it needs to be, scrolling past a few rows. */
ul.replacements {
  max-height: 120px;
  flex-shrink: 0;
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
ul.replacements li {
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
span.arrow { color: var(--text-faint); }
span.count {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-muted);
}
p.problem { color: var(--danger); }

div.foot {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

div.filename-row {
  display: flex;
  align-items: center;
}

input.filename-input {
  flex: 1;
  border-right: none;
  border-radius: 6px 0 0 6px;
}

span.filename-ext {
  flex-shrink: 0;
  background: var(--surface-3);
  border: 1px solid var(--border-light);
  border-left: none;
  border-radius: 0 6px 6px 0;
  padding: 7px 10px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--text-faint);
  line-height: 1.4;
}

div.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

button.cancel {
  padding: 6px 4px;
  border: 0;
  background: none;
  box-shadow: none;
  color: var(--text-muted);
  font: inherit;
}
</style>
