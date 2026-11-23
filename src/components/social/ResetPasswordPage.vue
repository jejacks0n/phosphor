<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSocialStore } from '@/store/SocialStore';
import { PASSWORD_MAX } from '@/social/names';
import FieldCount from '@/components/FieldCount.vue';

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
      <div class="counted">
        <label>{{ t('social.auth.newPasswordLabel') }}
          <input v-model="password" type="password" autocomplete="new-password" minlength="10" :maxlength="PASSWORD_MAX" required aria-describedby="reset-password-count reset-password-help">
        </label>
        <FieldCount id="reset-password-count" :count="password.length" :most="PASSWORD_MAX" />
      </div>
      <p id="reset-password-help" class="help">{{ t('social.auth.resetPasswordHelp') }}</p>
      <button class="primary" type="submit" :disabled="social.busy">{{ t('social.auth.setPassword') }}</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
  </div>
</template>
