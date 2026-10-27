<script setup>
import { computed, ref } from 'vue';
import { useSocialStore } from '@/store/SocialStore';
import { cleanUsername, usernameProblem } from '@/social/names';
import UsernameField from './UsernameField.vue';

// After a first Discord or GitHub sign-in: a username (starting from the name on that account) and the terms.
const social = useSocialStore();
const username = ref(cleanUsername(social.me?.username || social.me?.name));
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
    <button class="link back" @click="social.page = 'lobby'">‹ Back to the lobby</button>
    <h2>Pick your username</h2>
    <form @submit.prevent="ready && finish()">
      <UsernameField v-model="username" help="How everyone sees you. Letters, numbers, - and _." />
      <label class="terms">
        <input v-model="terms" type="checkbox">
        <span>I'm 13 or older and agree to the <a href="/terms" target="_blank">Terms</a> and <a href="/privacy" target="_blank">Privacy Policy</a></span>
      </label>
      <button class="primary" type="submit" :disabled="!ready">Continue</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
  </div>
</template>
