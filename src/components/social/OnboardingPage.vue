<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSocialStore } from '@/store/SocialStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { suggestedUsername, usernameProblem } from '@/social/names';
import UsernameField from './UsernameField.vue';

// After a first Discord or GitHub sign-in: a username (starting from the name on that account) and the terms.
// Leaving signs you out: half signed in, there's nothing to go back to.
const social = useSocialStore();
const workspace = useWorkspaceStore();
const { t } = useI18n();
const username = ref(suggestedUsername(social.me?.username || social.me?.name));
const terms = ref(false);
const error = ref(null);
const ready = computed(() => terms.value && !usernameProblem(username.value) && !social.busy);

async function finish() {
  error.value = null;
  if (!await social.finishOnboarding(username.value)) [error.value, social.notice] = [social.notice, null];
}
</script>

<template>
  <div class="form-page">
    <button class="link back" :disabled="social.busy" @click="social.signOut()">{{ t('social.nav.cancelSignOut') }}</button>
    <h2>{{ t('social.auth.onboardingHeading') }}</h2>
    <p class="intro">{{ t('social.auth.onboardingIntro') }}</p>
    <form @submit.prevent="ready && finish()">
      <UsernameField v-model="username" :help="t('social.auth.usernameHelp')" />
      <label class="terms">
        <input v-model="terms" type="checkbox">
        <i18n-t keypath="social.agreeTerms" tag="span">
          <template #terms>
            <button type="button" class="link inline" @click="workspace.legalPage = 'terms'">{{ t('legal.titles.terms') }}</button>
          </template>
          <template #privacy>
            <button type="button" class="link inline" @click="workspace.legalPage = 'privacy'">{{ t('legal.titles.privacy') }}</button>
          </template>
          <template #guidelines>
            <button type="button" class="link inline" @click="workspace.legalPage = 'guidelines'">{{ t('legal.titles.guidelines') }}</button>
          </template>
        </i18n-t>
      </label>
      <button class="primary" type="submit" :disabled="!ready">{{ t('common.continue') }}</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
  </div>
</template>
