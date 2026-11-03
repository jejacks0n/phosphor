<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSocialStore } from '@/store/SocialStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import ModalDialog from '@/components/ModalDialog.vue';

// SOCIAL's first question, the short version of the policies: it stands in for the tab until it's answered
// (EditWorkspace), and nothing from SOCIAL runs before that (SocialStore.boot). The legal pages open over it.
const social = useSocialStore(), workspace = useWorkspaceStore();
const agreed = ref(false);
const { t } = useI18n();

// A legal page closing gives focus back to its link, here, where Tab and Escape are the dialog's.
let opener = null;
function read(page, event) {
  opener = event.currentTarget;
  workspace.legalPage = page;
}
watch(() => workspace.legalPage, (page) => { if (!page) opener?.focus(); });

// Answered, focus goes on from the tab that's showing (with nothing open, the tab list's one stop), unless what's showing took it.
onBeforeUnmount(() => nextTick(() => {
  if (document.activeElement === document.body) document.querySelector('[role="tab"][tabindex="0"]')?.focus();
}));
</script>

<template>
  <ModalDialog long :title="t('social.consent.title')" @cancel="social.declineConsent()">
    <div class="reading" autofocus tabindex="0" role="region" :aria-label="t('social.consent.regionAria')">
      <p>{{ t('social.consent.intro') }}</p>

      <h4>{{ t('social.consent.lobbyHeading') }}</h4>
      <p>{{ t('social.consent.lobbyBody') }}</p>

      <h4>{{ t('social.consent.joiningHeading') }}</h4>
      <p>{{ t('social.consent.joiningBody') }}</p>

      <h4>{{ t('social.consent.startingHeading') }}</h4>
      <p>{{ t('social.consent.startingBody') }}</p>

      <h4>{{ t('social.consent.beKindHeading') }}</h4>
      <p>{{ t('social.consent.beKindBody') }}</p>
    </div>
    <div class="answer">
      <label class="agree">
        <input v-model="agreed" type="checkbox">
        <i18n-t keypath="social.agreeTerms" tag="span">
          <template #terms>
            <button type="button" class="link inline" @click="read('terms', $event)">{{ t('legal.titles.terms') }}</button>
          </template>
          <template #privacy>
            <button type="button" class="link inline" @click="read('privacy', $event)">{{ t('legal.titles.privacy') }}</button>
          </template>
          <template #guidelines>
            <button type="button" class="link inline" @click="read('guidelines', $event)">{{ t('legal.titles.guidelines') }}</button>
          </template>
        </i18n-t>
      </label>
      <div class="actions">
        <button @click="social.declineConsent()">{{ t('common.notNow') }}</button>
        <button class="primary" :disabled="!agreed" @click="social.acceptConsent()">{{ t('common.accept') }}</button>
      </div>
    </div>
  </ModalDialog>
</template>

<style scoped>
div.reading {
  flex: 1 1 auto;
  min-height: 96px;
  margin: 8px -18px 0;
  padding: 0 18px 12px;
  overflow: auto;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-dim);
  outline: none;
}

div.reading:focus-visible {
  border-bottom-color: var(--accent);
}

h4 {
  margin: 14px 0 4px;
  font-size: 13px;
  color: var(--text);
}

p {
  margin: 0;
}

div.answer {   /* the agreement beside the answers, and over them where it doesn't fit */
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12px 16px;
  margin-top: 12px;
}

label.agree {
  flex: 1 1 280px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-dim);
}

label.agree input {
  flex-shrink: 0;
  margin-top: 2px;
}

button.link.inline {
  padding: 0;
  font-size: inherit;
  letter-spacing: normal;
  color: var(--accent);
  text-decoration: underline;
}

div.actions {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
}

div.actions button {   /* Accept no taller than Not now */
  padding: 10px 12px;
  font-size: 12px;
}
</style>
