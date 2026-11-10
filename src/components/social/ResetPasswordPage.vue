<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSocialStore } from '@/store/SocialStore';

const social = useSocialStore();
const { t } = useI18n();
const password = ref('');
const error = ref(null);

async function set() {
  error.value = null;
  if (!await social.resetPassword(password.value)) [error.value, social.notice] = [social.notice, null];
}
</script>

<template>
  <div class="form-page">
    <h2>{{ t('social.auth.resetHeading') }}</h2>
    <p class="intro">{{ t('social.auth.resetIntro') }}</p>
    <form @submit.prevent="set">
      <label>{{ t('social.auth.newPasswordLabel') }} <input v-model="password" type="password" autocomplete="new-password" minlength="10" required aria-describedby="reset-password-help"></label>
      <p id="reset-password-help" class="help">{{ t('social.auth.resetPasswordHelp') }}</p>
      <button class="primary" type="submit" :disabled="social.busy">{{ t('social.auth.setPassword') }}</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
  </div>
</template>
