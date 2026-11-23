<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSocialStore } from '@/store/SocialStore';
import { PASSWORD_MAX } from '@/social/names';
import FieldCount from '@/components/FieldCount.vue';

const social = useSocialStore();
const { t } = useI18n();
const password = ref('');
const error = ref(null);
// A password past the most is kept as typed, said beside the field, and not sent.
const tooLong = computed(() => password.value.length > PASSWORD_MAX);

async function set() {
  error.value = null;
  if (!await social.resetPassword(password.value)) [error.value, social.notice] = [social.notice, null];
}
</script>

<template>
  <div class="form-page">
    <h2>{{ t('social.auth.resetHeading') }}</h2>
    <p class="intro">{{ t('social.auth.resetIntro') }}</p>
    <form @submit.prevent="tooLong || set()">
      <div class="counted">
        <label>{{ t('social.auth.newPasswordLabel') }}
          <input v-model="password" type="password" autocomplete="new-password" minlength="10" required :aria-invalid="tooLong" aria-describedby="reset-password-count reset-password-help reset-password-long">
        </label>
        <FieldCount id="reset-password-count" :count="password.length" :most="PASSWORD_MAX" uncapped />
      </div>
      <p id="reset-password-help" class="help">{{ t('social.auth.resetPasswordHelp') }}</p>
      <p v-if="tooLong" id="reset-password-long" class="error">{{ t('social.auth.passwordTooLong', { most: PASSWORD_MAX }) }}</p>
      <button class="primary" type="submit" :disabled="social.busy || tooLong">{{ t('social.auth.setPassword') }}</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
  </div>
</template>
