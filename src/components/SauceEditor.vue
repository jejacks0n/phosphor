<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useDrawingStore } from '@/store/DrawingStore';
import ProjectActions from '@/components/ProjectActions.vue';
import { MOST_COMMENT_LINES, SAUCE_WIDTHS, charCount, fitField, sauceText } from '@/lib/Sauce.js';
import { formatNumber } from '@/i18n/format.js';

const project = useProjectStore();
const drawing = useDrawingStore();
const { t } = useI18n();

// The short fields: a count by the record's characters (an emoji is one), and a line under the field naming what an
// edit left out. The record's width is the field's: one cut, said where it happens.
const SHORT = [
  { key: 'sauceTitle', id: 'sauce-title', label: 'sauce.title', placeholder: 'sauce.titlePlaceholder', width: SAUCE_WIDTHS.title },
  { key: 'sauceAuthor', id: 'sauce-author', label: 'sauce.author', placeholder: 'sauce.authorPlaceholder', width: SAUCE_WIDTHS.author },
  { key: 'sauceGroup', id: 'sauce-group', label: 'sauce.group', placeholder: 'sauce.groupPlaceholder', width: SAUCE_WIDTHS.group },
];
const COMMENTS = { key: 'sauceUserComments', id: 'sauce-comments', width: SAUCE_WIDTHS.comments, lines: true };

// What an edit left out, by setting, until the field next changes; a change from elsewhere (a file opened, a host's)
// clears it, since nothing typed was cut.
const notes = reactive({});
const fitted = {};
watch(() => [...SHORT, COMMENTS].map(({ key }) => project[key]), () => {
  for (const { key } of [...SHORT, COMMENTS]) if (project[key] !== fitted[key]) notes[key] = '';
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
function fit(event, { key, width, lines = false }) {
  if (event.isComposing) return;
  const input = event.target;
  const { text, caret, left, stripped } = fitField(project[key] ?? '', input.value, input.selectionEnd ?? input.value.length, width, (raw) => sauceText(raw, lines));
  if (text !== input.value) {
    input.value = text;
    input.setSelectionRange(caret, caret);
  }
  fitted[key] = text;
  project[key] = text;
  notes[key] = [left && t('sauce.cut', { width: formatNumber(width), left: quoted(left) }), stripped && t('sauce.controls')].filter(Boolean).join(' ');
}
</script>

<template>
  <article class="sauce-editor">
    <div class="editor-container">
      <h3>{{ t('sauce.heading') }}</h3>
      <p>{{ t('sauce.description') }}</p>

      <fieldset :disabled="!!drawing.hostOnly" :title="drawing.hostOnly">
        <div v-for="f in SHORT" :key="f.key" class="field">
          <div class="label-row">
            <label :for="f.id">{{ t(f.label) }}</label>
            <span
                :id="`${f.id}-count`"
                class="count"
                :class="{ full: charCount(project[f.key] ?? '') >= f.width }"
                :aria-label="t('sauce.countAria', { count: charCount(project[f.key] ?? ''), width: f.width })"
            >{{ charCount(project[f.key] ?? '') }} / {{ f.width }}</span>
          </div>
          <input
              :id="f.id"
              :value="project[f.key]"
              type="text"
              :placeholder="t(f.placeholder)"
              :aria-describedby="`${f.id}-count ${f.id}-note`"
              @input="fit($event, f)"
              @compositionend="fit($event, f)"
          >
          <p :id="`${f.id}-note`" class="cut" aria-live="polite">{{ notes[f.key] }}</p>
        </div>

        <div class="field">
          <label for="sauce-comments">{{ t('sauce.comments') }}</label>
          <textarea
              id="sauce-comments"
              :value="project.sauceUserComments"
              :placeholder="t('sauce.commentsPlaceholder')"
              aria-describedby="sauce-comments-count sauce-comments-note"
              @input="fit($event, COMMENTS)"
              @compositionend="fit($event, COMMENTS)"
          ></textarea>
          <p v-if="linesNote" id="sauce-comments-count" class="lines" :class="{ over: fit255.cut }">{{ linesNote }}</p>
          <span id="sauce-comments-spoken" class="spoken" aria-live="polite">{{ linesSpoken }}</span>
          <p id="sauce-comments-note" class="cut" aria-live="polite">{{ notes.sauceUserComments }}</p>
        </div>
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

label {
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
  color: var(--warning);
}
p.cut:empty { margin-top: -6px; }   /* stays in the page, as a live region must */

p.lines { margin: 0; }
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
