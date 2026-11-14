<script setup>
import { reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useDrawingStore } from '@/store/DrawingStore';
import ProjectActions from '@/components/ProjectActions.vue';
import { SAUCE_WIDTHS, charCount, fitField } from '@/lib/Sauce.js';

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

// What an edit left out, by setting, until the field next changes; a change from elsewhere (a file opened, a host's)
// clears it, since nothing typed was cut.
const notes = reactive({});
const fitted = {};
watch(() => SHORT.map(({ key }) => project[key]), () => {
  for (const { key } of SHORT) if (project[key] !== fitted[key]) notes[key] = '';
});

const quoted = (text) => ([...text].length > 20 ? `${[...text].slice(0, 20).join('')}…` : text);

// Mid-composition (IME) the text isn't the person's yet: it's fitted when committed.
function fit(event, { key, width }) {
  if (event.isComposing) return;
  const input = event.target;
  const { text, caret, left } = fitField(project[key] ?? '', input.value, input.selectionEnd ?? input.value.length, width);
  if (text !== input.value) {
    input.value = text;
    input.setSelectionRange(caret, caret);
  }
  fitted[key] = text;
  project[key] = text;
  notes[key] = left ? t('sauce.cut', { width, left: quoted(left) }) : '';
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
          <textarea id="sauce-comments" v-model="project.sauceUserComments" :maxlength="SAUCE_WIDTHS.comments" :placeholder="t('sauce.commentsPlaceholder')"></textarea>
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

textarea {
  resize: vertical;
  min-height: 100px;
  font-family: inherit;
}
</style>
