<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSocialStore, PROVIDERS } from '@/store/SocialStore';
import { mountTurnstile } from '@/social/turnstile';

const social = useSocialStore();
const { t } = useI18n();
const shown = computed(() => PROVIDERS.filter(([id]) => social.providers.includes(id)));
const login = ref('');
const password = ref('');
const error = ref(null);   // the last try's, in words: under the form rather than at the top of the tab

// The server asks for its token only once the account has had too many tries; it shows only if it needs you.
const widget = ref(null);
let token = () => null;
onMounted(() => mountTurnstile(widget.value, 'signin', { appearance: 'interaction-only' }).then((get) => { token = get; }, () => {}));
onBeforeUnmount(() => token.remove?.());

const failed = () => { [error.value, social.notice] = [social.notice, null]; };

async function signIn() {
  error.value = null;
  if (await social.signIn(login.value.trim(), password.value, token())) return;
  password.value = '';
  failed();
}

// Success leaves for the provider's page; a failure is the notice.
async function signInWith(provider) {
  error.value = null;
  await social.signInWith(provider);
  failed();
}
</script>

<template>
  <div class="form-page">
    <h2>{{ t('social.auth.signInHeading') }}</h2>
    <p class="intro">{{ t('social.auth.signInIntro') }}</p>
    <template v-if="shown.length">
      <div class="providers">
        <button v-for="[id, label] in shown" :key="id" :disabled="social.busy" @click="signInWith(id)">{{ t('social.auth.continueWith', { provider: label }) }}</button>
      </div>
      <p class="or">{{ t('common.or') }}</p>
    </template>
    <form @submit.prevent="signIn">
      <label>{{ t('social.auth.emailOrUsername') }} <input v-model="login" autocomplete="username" spellcheck="false" required></label>
      <label>{{ t('social.auth.passwordLabel') }} <input v-model="password" type="password" autocomplete="current-password" required></label>
      <div ref="widget" class="turnstile"></div>
      <button class="primary" type="submit" :disabled="social.busy">{{ t('social.auth.signInSubmit') }}</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
    <hr>
    <p class="foot"><button class="link inline" @click="social.page = 'forgot'">{{ t('social.auth.forgotPassword') }}</button></p>
    <i18n-t keypath="social.lobby.noAccount" tag="p" class="foot">
      <template #create>
        <button class="link inline" @click="social.page = 'create'">{{ t('social.lobby.createOne') }}</button>
      </template>
    </i18n-t>
  </div>
</template>
