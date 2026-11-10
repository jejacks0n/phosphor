<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSocialStore } from '@/store/SocialStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { usernameProblem } from '@/social/names';
import { mountTurnstile } from '@/social/turnstile';
import UsernameField from './UsernameField.vue';

const social = useSocialStore();
const workspace = useWorkspaceStore();
const { t } = useI18n();
const username = ref('');
const email = ref('');
const password = ref('');
const terms = ref(false);
const error = ref(null);
const ready = computed(() => terms.value && !usernameProblem(username.value) && !social.busy);

// A widget that doesn't load leaves the token null, and the server says what it thinks of that.
const widget = ref(null);
let token = () => null;
onMounted(() => mountTurnstile(widget.value, 'signup').then((get) => { token = get; }, () => {}));
onBeforeUnmount(() => token.remove?.());

async function create() {
  error.value = null;
  const ok = await social.signUp({
    username: username.value, email: email.value.trim(), password: password.value, termsAccepted: terms.value, turnstileToken: token(),
  });
  if (!ok) [error.value, social.notice] = [social.notice, null];
}
</script>

<template>
  <div class="form-page">
    <h2>{{ t('social.auth.createHeading') }}</h2>
    <p class="intro">{{ t('social.auth.createIntro') }}</p>
    <form @submit.prevent="ready && create()">
      <UsernameField v-model="username" :help="t('social.auth.usernameHelp')" />
      <label>{{ t('social.auth.emailLabel') }} <input v-model="email" type="email" autocomplete="email" required></label>
      <label>{{ t('social.auth.passwordLabel') }} <input v-model="password" type="password" autocomplete="new-password" minlength="10" required aria-describedby="create-password-help"></label>
      <p id="create-password-help" class="help">{{ t('social.auth.passwordHelp') }}</p>
      <div ref="widget" class="turnstile"></div>
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
      <button class="primary" type="submit" :disabled="!ready">{{ t('social.auth.createSubmit') }}</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
    <hr>
    <i18n-t keypath="social.auth.haveAccount" tag="p" class="foot">
      <template #signIn>
        <button class="link inline" @click="social.page = 'sign-in'">{{ t('social.lobby.signIn') }}</button>
      </template>
    </i18n-t>
  </div>
</template>
