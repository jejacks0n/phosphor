<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ModalDialog from '@/components/ModalDialog.vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useLayerName } from '@/composables/useLayerName';
import { formatList } from '@/i18n/format';
import { arrowsBetween } from '@/lib/focus';
import { AnsiFile } from '@/lib/AnsiFile';
import { charRowsOf } from '@/lib/Cells';
import { MOST_COMMENT_LINES, sauceUnmappable } from '@/lib/Sauce';
import { fileStem, timestamped } from '@/document/projectIO';
import { canExportVideo } from '@/lib/VideoFile';

// All export formats in one modal: ANS, UTF-8 ANS, XBin, PNG (Still), GIF, Video (where the browser encodes video), Animated
// ANS, Animated UTF-8 ANS, Cast (Animated). Opened by Cmd/Ctrl+E or the Export button in ProjectActions.
const FORMATS = [
  { id: 'ans',             ext: 'ans',      group: 'still' },
  { id: 'utf8ans',         ext: 'utf8ans',  group: 'still' },
  { id: 'xb',              ext: 'xb',       group: 'still' },
  { id: 'png',             ext: 'png',      group: 'still' },
  { id: 'gif',             ext: 'gif',      group: 'animated', animated: true },
  { id: 'mp4',             ext: 'mp4',      group: 'animated', animated: true },
  { id: 'ansimation',      ext: 'ans',      group: 'animated', animated: true },
  { id: 'utf8ansimation',  ext: 'utf8ans',  group: 'animated', animated: true },
  { id: 'cast',            ext: 'cast',     group: 'animated', animated: true },
];

const emit = defineEmits(['close']);
const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();

const formats = FORMATS.filter((f) => f.id !== 'mp4' || canExportVideo());
const selectedId = ref(project.hasFrames && project.animate ? 'gif' : 'ans');
const selected = computed(() => FORMATS.find(f => f.id === selectedId.value));
const name = ref(timestamped(project.filename ?? 'untitled'));
const smooth = ref(workspace.smoothText); // default follows the workspace setting, like SaveDialog
const saving = ref(false);
const progress = ref(null); // a GIF's or video's share of frames written while it exports
const problem = ref('');
const noXbin = computed(() => selectedId.value === 'xb' && !project.xbinPalette);
const stem = computed(() => fileStem(name.value, selected.value.ext));

// The layers that show By shape in place of the plugin solver they chose (their params' standIn), bottom first: what's
// exported is what shows.
const layerName = useLayerName();
const standIns = computed(() => project.layers.filter(({ id }) => project.layerParams.get(id)?.standIn).map(({ id }) => layerName(id)));
// The plugin filters the drawing sets that aren't running (not installed, off, failed), by the names saved with them: the
// export is the picture without them.
const filtersLeftOut = computed(() => project.filterGroups.filter(({ ref, state }) => ref in project.filterOptions && !['on', 'idle'].includes(state)).map(({ name }) => name));

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

// Every ANSI format writes a SAUCE record unless Include SAUCE is unchecked (checked each time the dialog opens), in
// CP437 whatever the art is in: the characters of it CP437 lacks, as the export writes it, and the fields each is in.
const SAUCE_FORMATS = ['ans', 'utf8ans', 'xb', 'ansimation', 'utf8ansimation'];
const carriesSauce = computed(() => SAUCE_FORMATS.includes(selectedId.value));
const withSauce = ref(true);
const sauceReplacements = computed(() => (carriesSauce.value && withSauce.value ? sauceUnmappable(project.sauceFields()) : []));
// Comments past 255 record lines, as the SAUCE tab counts them: from which line of the field they won't be in the file.
const commentsCut = computed(() => (carriesSauce.value && withSauce.value && project.sauceUserComments ? project.sauceCommentFit().cut : null));
const quoted = (text) => ([...text].length > 30 ? `${[...text].slice(0, 30).join('')}…` : text);

function pickFormat(id) {
  selectedId.value = id;
  problem.value = '';
}

// Share (PNG, GIF and video, where the browser's share sheet takes the file: phones, Safari, Chrome): the file goes to the
// share sheet in place of a download. The browser opens it only straight after a tap, so a file that took longer to
// write (a long GIF) is kept ready, and Share now opens the sheet with the next tap. A new name or format drops it.
const SHARE_TYPES = { png: 'image/png', gif: 'image/gif', mp4: 'video/mp4' };
const shareable = computed(() => import.meta.env.VITE_DESKTOP !== '1' && !!SHARE_TYPES[selectedId.value]
  && !!navigator.canShare?.({ files: [new File([], `art.${selected.value.ext}`, { type: SHARE_TYPES[selectedId.value] })] }));
const ready = ref(null);
watch([selectedId, name, smooth], () => { ready.value = null; });

async function send(file) {
  try {
    await navigator.share({ files: [file] });
    emit('close');
  } catch (error) {
    if (error.name === 'AbortError') return; // the share sheet put away: the dialog stays
    if (error.name === 'NotAllowedError') return void (ready.value = file); // too long after the tap
    console.warn('Could not share', error);
    problem.value = t('export.modal.shareFailed');
  }
}

async function doExport(share = false) {
  if (!stem.value || saving.value) return;
  if (share && ready.value) return send(ready.value);
  saving.value = true;
  problem.value = '';
  if (['gif', 'mp4'].includes(selectedId.value)) progress.value = 0;
  let file = null;
  const deliver = share ? (blob, filename) => { file = new File([blob], filename, { type: blob.type }); } : undefined;
  try {
    if (selected.value.animated) await project.exportAnimation(selectedId.value, { filename: stem.value, progress: (part) => { progress.value = part; }, deliver, sauce: withSauce.value });
    else await project.exportFile(selectedId.value, { filename: stem.value, smooth: smooth.value, deliver, sauce: withSauce.value });
    if (!share) return emit('close');
  } catch (error) {
    console.warn('Could not export', error);
    problem.value = error.userMessage ?? t('save.saveFailed');
    return;
  } finally {
    saving.value = false;
    progress.value = null;
  }
  await send(file);
}

function cancel() {
  if (!saving.value) emit('close');
}
</script>

<template>
  <ModalDialog :title="t('export.modal.title')" :sub="t('export.modal.sub')" wide @cancel="cancel">
    <div class="export-body">

      <!-- Up and Down move between the formats; Enter or Space picks the one focused. -->
      <nav class="format-list" aria-label="Export format" @keydown="arrowsBetween($event, $event.currentTarget.querySelectorAll('button'))">
        <div class="group-label">{{ t('export.modal.still') }}</div>
        <button
            v-for="f in formats.filter(f => f.group === 'still')"
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
            v-for="f in formats.filter(f => f.group === 'animated')"
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

        <p v-if="standIns.length" class="note warn stand-ins">{{ t('export.standIns', { names: formatList(standIns) }, standIns.length) }}</p>
        <p v-if="filtersLeftOut.length" class="note warn filters-left-out">{{ t('export.filtersLeftOut', { names: formatList(filtersLeftOut) }, filtersLeftOut.length) }}</p>

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

        <!-- Every ANSI format: with or without SAUCE, and what of it won't reach the file as it is on the SAUCE tab -->
        <template v-if="carriesSauce">
          <div class="option-label">{{ t('tabs.sauce') }}</div>
          <label class="sauce-choice"><input v-model="withSauce" type="checkbox"> {{ t('export.modal.includeSauce') }}</label>
          <p v-if="!withSauce" class="note">{{ t('export.modal.noSauceNote') }}</p>
        </template>
        <p v-if="commentsCut" class="note warn">{{ t('save.sauceCommentsOver', { most: MOST_COMMENT_LINES, line: commentsCut.line, text: quoted(commentsCut.text) }) }}</p>
        <template v-if="sauceReplacements.length">
          <p class="note">{{ t('save.sauceNote', { count: sauceReplacements.length }, sauceReplacements.length) }}</p>
          <ul class="replacements" :aria-label="t('save.sauceReplacementsAria')" tabindex="0">
            <li v-for="r in sauceReplacements" :key="r.char">
              <span class="char">{{ r.char }}</span>
              <span class="arrow" :aria-label="t('save.becomesAria')">→</span>
              <span class="char">{{ r.as }}</span>
              <span class="count">{{ r.fields.map((field) => t(`sauce.${field}`)).join(', ') }}</span>
            </li>
          </ul>
          <p class="note">{{ t('save.sauceHint') }}</p>
        </template>

        <p v-if="noXbin" class="note warn">{{ t('export.errors.xbinPalette') }}</p>
        <p v-if="problem" class="note problem" role="alert">{{ problem }}</p>
        <p v-if="ready" class="note" role="status">{{ t('export.modal.shareReady') }}</p>

        <form class="foot" @submit.prevent="doExport()">
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
            <progress v-if="progress !== null" :value="progress" :aria-label="t('common.exporting')"/>
            <button type="button" class="cancel" @click="cancel">{{ t('common.cancel') }}</button>
            <button v-if="shareable" type="button" :class="{ primary: ready }" :disabled="!stem || saving" @click="doExport(true)">{{ ready ? t('export.modal.shareNow') : t('export.modal.share') }}</button>
            <button type="submit" :class="{ primary: !ready }" :disabled="!stem || saving || noXbin">
              {{ saving ? t('common.exporting') : t('export.modal.exportBtn', { name: t(`export.modal.formats.${selectedId}.name`) }) }}
            </button>
          </div>
        </form>
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

label.sauce-choice {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
}

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
  flex-wrap: wrap;   /* SAUCE's field names go under the row before they push it wider */
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

form.foot {
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
  min-width: 0;
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
  align-items: center;
  gap: 8px;
}

/* Beside the buttons, so nothing moves when it shows. */
progress {
  flex: 1;
  min-width: 0;
  height: 6px;
  appearance: none;
  border: 0;
  border-radius: 3px;
  overflow: hidden;
  background: var(--surface-3);
}
progress::-webkit-progress-bar { background: var(--surface-3); }
progress::-webkit-progress-value { background: var(--accent-hot); }
progress::-moz-progress-bar { background: var(--accent-hot); }

button.cancel {
  padding: 6px 4px;
  border: 0;
  background: none;
  box-shadow: none;
  color: var(--text-muted);
  font: inherit;
}

/* A phone: the list above the format it picks, so neither runs off the screen. */
@media (max-width: 768px) {
  div.export-body { grid-template-columns: minmax(0, 1fr); }
  nav.format-list {
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding: 0 0 8px;
  }
  div.format-detail { padding: 14px 0 0; }
}
</style>
