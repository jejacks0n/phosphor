<script setup>
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useDrawingStore } from '@/store/DrawingStore';
import ProjectActions from '@/components/ProjectActions.vue';
import { SAUCE_WIDTHS } from '@/lib/Sauce.js';

const { sauceTitle, sauceAuthor, sauceGroup, sauceUserComments } = storeToRefs(useProjectStore());
const drawing = useDrawingStore();
const { t } = useI18n();
</script>

<template>
  <article class="sauce-editor">
    <div class="editor-container">
      <h3>{{ t('sauce.heading') }}</h3>
      <p>{{ t('sauce.description') }}</p>

      <fieldset :disabled="!!drawing.hostOnly" :title="drawing.hostOnly">
        <div class="field">
          <label for="sauce-title">{{ t('sauce.title') }}</label>
          <input id="sauce-title" v-model="sauceTitle" type="text" :placeholder="t('sauce.titlePlaceholder')" maxlength="35">
        </div>

        <div class="field">
          <label for="sauce-author">{{ t('sauce.author') }}</label>
          <input id="sauce-author" v-model="sauceAuthor" type="text" :placeholder="t('sauce.authorPlaceholder')" maxlength="20">
        </div>

        <div class="field">
          <label for="sauce-group">{{ t('sauce.group') }}</label>
          <input id="sauce-group" v-model="sauceGroup" type="text" :placeholder="t('sauce.groupPlaceholder')" maxlength="20">
        </div>

        <div class="field">
          <label for="sauce-comments">{{ t('sauce.comments') }}</label>
          <textarea id="sauce-comments" v-model="sauceUserComments" :maxlength="SAUCE_WIDTHS.comments" :placeholder="t('sauce.commentsPlaceholder')"></textarea>
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

label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-faint);
}

textarea {
  resize: vertical;
  min-height: 100px;
  font-family: inherit;
}
</style>
