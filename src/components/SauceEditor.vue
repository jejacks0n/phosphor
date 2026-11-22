<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useDrawingStore } from '@/store/DrawingStore';
import ProjectActions from '@/components/ProjectActions.vue';
import ToggleGroup from '@/components/ToggleGroup.vue';
import { MOST_COMMENT_LINES, SAUCE_WIDTHS, charCount, fitField, keptFields, letterSpacingOf, sauceText } from '@/lib/Sauce.js';
import { formatNumber } from '@/i18n/format.js';

const project = useProjectStore();
const drawing = useDrawingStore();
const { t } = useI18n();

// The fields in the record's order of who, when and what, then what other viewers read. Each has a line under it naming
// what an edit left out, the record's width being the field's: one cut, said where it happens. The short text fields
// count their characters as the record does (an emoji is one); Date takes digits; Comments count in record lines.
// An opened file's empty Date or Font name stays empty; a new drawing's is filled in on export.
const kept = computed(() => !!keptFields(project.sauceRecord, 0, 0));
const FIELDS = [
  { key: 'sauceTitle', id: 'sauce-title', label: 'sauce.title', placeholder: () => t('sauce.titlePlaceholder'), width: SAUCE_WIDTHS.title, counted: true },
  { key: 'sauceAuthor', id: 'sauce-author', label: 'sauce.author', placeholder: () => t('sauce.authorPlaceholder'), width: SAUCE_WIDTHS.author, counted: true },
  { key: 'sauceGroup', id: 'sauce-group', label: 'sauce.group', placeholder: () => t('sauce.groupPlaceholder'), width: SAUCE_WIDTHS.group, counted: true },
  { key: 'sauceDate', id: 'sauce-date', label: 'sauce.dateLabel', placeholder: () => t(kept.value ? 'sauce.emptyInFile' : 'sauce.datePlaceholder'), width: SAUCE_WIDTHS.date, digits: true },
  { key: 'sauceUserComments', id: 'sauce-comments', label: 'sauce.comments', placeholder: () => t('sauce.commentsPlaceholder'), width: SAUCE_WIDTHS.comments, lines: true },
  { key: 'sauceFontName', id: 'sauce-font', label: 'sauce.fontName', placeholder: () => (kept.value ? t('sauce.emptyInFile') : 'IBM VGA'), width: SAUCE_WIDTHS.fontName, counted: true, viewers: true },
];
const cleanOf = ({ lines = false, digits = false }) => (digits ? (raw) => raw.replace(/\D/g, '') : (raw) => sauceText(raw, lines));
const describedBy = (f) => [f.counted && `${f.id}-count`, f.lines && 'sauce-comments-count', f.digits && 'sauce-date-format', `${f.id}-note`].filter(Boolean).join(' ');

// What an edit left out, by setting, until the field next changes; a change from elsewhere (a file opened, a host's)
// clears it, since nothing typed was cut.
const notes = reactive({});
const fitted = {};
watch(() => FIELDS.map(({ key }) => project[key]), () => {
  for (const { key } of FIELDS) if (project[key] !== fitted[key]) notes[key] = '';
});

// A date that isn't eight digits of a real day: written as typed, with a quiet word on what SAUCE expects.
const dateOff = computed(() => {
  const date = project.sauceDate;
  if (!date) return false;
  const [y, m, d] = [date.slice(0, 4), date.slice(4, 6), date.slice(6)].map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  return !/^\d{8}$/.test(date) || day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d;
});

// Letter spacing as the record will say it: an opened file's flags, or Phosphor's own, until one is chosen.
const SPACINGS = computed(() => [['none', t('sauce.spacingNone')], ['8', '8px'], ['9', '9px']].map(([key, label]) => ({ key, label })));
// 8px and 9px are the drawing's width when it has a bitmap font (setDrawingFontWidth), so a narrow drawing shows neither
// lit (it exports 8px, but it's drawn at its own width) and either one a click away.
const narrow = computed(() => (project.drawingFont?.cellWidth ?? 8) < 8);
const spacing = computed({
  get: () => Object.fromEntries(['none', '8', '9'].map((key) => [key, !narrow.value && letterSpacingOf(project.sauceFields().flags) === key])),
  set: (picked) => {
    const key = Object.keys(picked).find((k) => picked[k]);
    if (key !== 'none' && project.drawingFont) project.setDrawingFontWidth(Number(key));
    else project.sauceLetterSpacing = key;
  },
});

const quoted = (text, most = 20) => ([...text].length > most ? `${[...text].slice(0, most).join('')}…` : text);

// Comments in record lines, counted as the export writes them, once there's text: past 255, from which line of the
// field they won't be in the file. Said aloud only as it crosses 255, either way, not on every key.
const fit255 = computed(() => (project.sauceUserComments ? project.sauceCommentFit() : null));
const linesNote = computed(() => {
  if (!fit255.value) return '';
  const { count, own, cut } = fit255.value, most = MOST_COMMENT_LINES;
  if (cut) return t('sauce.commentLinesOver', { count, most, line: cut.line, text: quoted(cut.text, 30) });
  return own ? t('sauce.commentLinesOwn', { count, most, own }) : t('sauce.commentLines', { count, most }, count);
});
const linesSpoken = ref('');
watch(() => !!fit255.value?.cut, () => { linesSpoken.value = linesNote.value; });

// Mid-composition (IME) the text isn't the person's yet: it's fitted when committed. Control characters are left out
// (a comment's line breaks stay) and said to be, though no one types them on purpose: a paste can bring them.
function fit(event, f) {
  if (event.isComposing) return;
  const { key, width } = f, input = event.target;
  const { text, caret, left, stripped } = fitField(project[key] ?? '', input.value, input.selectionEnd ?? input.value.length, width, cleanOf(f));
  if (text !== input.value) {
    input.value = text;
    input.setSelectionRange(caret, caret);
  }
  fitted[key] = text;
  project[key] = text;
  notes[key] = [left && t('sauce.cut', { width: formatNumber(width) }), stripped && !f.digits && t('sauce.controls')].filter(Boolean).join('\n'); // one line each
}
</script>

<template>
  <article class="sauce-editor">
    <div class="editor-container">
      <h3>{{ t('sauce.heading') }}</h3>
      <p>{{ t('sauce.description') }}</p>

      <fieldset :disabled="!!drawing.hostOnly" :title="drawing.hostOnly">
        <template v-for="f in FIELDS" :key="f.key">
          <h4 v-if="f.viewers">{{ t('sauce.viewers') }}</h4>
          <div class="field">
            <div class="label-row">
              <label :for="f.id">{{ t(f.label) }}</label>
              <span
                  v-if="f.counted"
                  :id="`${f.id}-count`"
                  class="count"
                  :class="{ full: charCount(project[f.key] ?? '') >= f.width }"
                  :aria-label="t('sauce.countAria', { count: charCount(project[f.key] ?? ''), width: f.width })"
              >{{ charCount(project[f.key] ?? '') }} / {{ f.width }}</span>
            </div>
            <textarea
                v-if="f.lines"
                :id="f.id"
                :value="project[f.key]"
                :placeholder="f.placeholder()"
                :aria-describedby="describedBy(f)"
                @input="fit($event, f)"
                @compositionend="fit($event, f)"
            ></textarea>
            <input
                v-else
                :id="f.id"
                :value="project[f.key]"
                type="text"
                :inputmode="f.digits ? 'numeric' : null"
                :placeholder="f.placeholder()"
                :aria-describedby="describedBy(f)"
                @input="fit($event, f)"
                @compositionend="fit($event, f)"
            >
            <template v-if="f.lines">
              <p v-if="linesNote" id="sauce-comments-count" class="lines" :class="{ over: fit255.cut }">{{ linesNote }}</p>
              <span id="sauce-comments-spoken" class="spoken" aria-live="polite">{{ linesSpoken }}</span>
            </template>
            <p v-if="f.digits && dateOff" id="sauce-date-format" class="lines">{{ t('sauce.dateFormat') }}</p>
            <p :id="`${f.id}-note`" class="cut" aria-live="polite">{{ notes[f.key] }}</p>
          </div>
        </template>

        <div class="field">
          <span id="sauce-spacing" class="label">{{ t('sauce.spacing') }}</span>
          <ToggleGroup v-model="spacing" class="spacing" single :options="SPACINGS" :label="t('sauce.spacing')" aria-describedby="sauce-viewers-help"/>
        </div>
        <p id="sauce-viewers-help">{{ t('sauce.viewersHelp') }}</p>
      </fieldset>

      <hr/>

      <ProjectActions/>
    </div>
  </article>
</template>

<style scoped>
article.sauce-editor {
  width: 100%;
  height: 100%;
  overflow: auto;
  display: flex;
  align-items: center;
}

div.editor-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 240px;
  max-width: 450px;
  margin: auto;
  padding: 40px;
  box-sizing: border-box;
}

p {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}

fieldset {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

div.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

div.label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

label,
span.label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-faint);
}

span.count {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-faint);
}
span.count.full { color: var(--warning); }

/* Under the field, pushing the next one down; empty, it takes no room. */
p.cut {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-line; /* a cut and stripped control characters, each on its own line */
  color: var(--warning);
}
p.cut:empty { margin-top: -6px; }   /* stays in the page, as a live region must */

p.lines { margin: 0; }

h4 {
  margin: 8px 0 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* Three parts across the field, each a comfortable tap. */
div.spacing { display: flex; }
div.spacing :deep(button) {
  flex: 1;
  min-height: 32px;
}
p.lines.over { color: var(--warning); }

/* Heard, not seen: the comments' count as it crosses 255. */
span.spoken {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

textarea {
  resize: vertical;
  min-height: 100px;
  font-family: inherit;
}
</style>
