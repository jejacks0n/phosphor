<script setup>
import { onMounted, ref, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSocialStore } from '@/store/SocialStore';

const social = useSocialStore();
const { t } = useI18n();
const code = ref('');
const backup = ref(false);
const trust = ref(false);
const error = ref(null);   // the last try's, in words: under the form rather than at the top of the tab
const input = useTemplateRef('input');

onMounted(() => input.value.focus());

async function verify() {
  error.value = null;
  if (await social.verifyTwoFactor(code.value, { backup: backup.value, trustDevice: trust.value })) return;
  code.value = '';
  if (social.page === 'two-factor') [error.value, social.notice] = [social.notice, null];   // an expired challenge's words stay on Sign in
}

function toggle() {
  backup.value = !backup.value;
  code.value = '';
  error.value = null;
  input.value.focus();
}
</script>

<template>
  <div class="form-page">
    <button class="link back" @click="social.page = 'sign-in'">{{ t('social.nav.cancel') }}</button>
    <h2>{{ t('social.auth.twoFactorHeading') }}</h2>
    <p class="intro">{{ t('social.auth.twoFactorIntro') }}</p>
    <form @submit.prevent="verify">
      <label>{{ backup ? t('social.auth.backupCodeLabel') : t('social.auth.totpCodeLabel') }}
        <input ref="input" v-model="code" autocomplete="one-time-code" :inputmode="backup ? undefined : 'numeric'" spellcheck="false" required>
      </label>
      <label class="terms">
        <input v-model="trust" type="checkbox">
        <span>{{ t('social.auth.trustComputer') }}</span>
      </label>
      <button class="primary" type="submit" :disabled="social.busy">{{ t('social.auth.verify') }}</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
    <hr>
    <p class="foot">
      <button class="link inline" @click="toggle">{{ backup ? t('social.auth.useAuthenticator') : t('social.auth.useBackupCode') }}</button>
    </p>
  </div>
</template>
