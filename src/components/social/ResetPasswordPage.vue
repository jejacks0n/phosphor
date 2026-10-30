<script setup>
import { ref } from 'vue';
import { useSocialStore } from '@/store/SocialStore';

const social = useSocialStore();
const password = ref('');
const error = ref(null);

async function set() {
  error.value = null;
  if (!await social.resetPassword(password.value)) [error.value, social.notice] = [social.notice, null];
}
</script>

<template>
  <div class="form-page">
    <button class="link back" @click="social.page = 'lobby'">‹ Back to the lobby</button>
    <h2>Set a new password</h2>
    <p class="intro">Choose the password you'll sign in with from now on.</p>
    <form @submit.prevent="set">
      <label>New password <input v-model="password" type="password" autocomplete="new-password" minlength="10" required aria-describedby="reset-password-help"></label>
      <p id="reset-password-help" class="help">At least 10 characters, not a known leaked password. Setting it signs you out everywhere else.</p>
      <button class="primary" type="submit" :disabled="social.busy">Set password</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
  </div>
</template>
