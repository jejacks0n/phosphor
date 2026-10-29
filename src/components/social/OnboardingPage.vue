<script setup>
import { computed, ref } from 'vue';
import { useSocialStore } from '@/store/SocialStore';
import { suggestedUsername, usernameProblem } from '@/social/names';
import UsernameField from './UsernameField.vue';

// After a first Discord or GitHub sign-in: a username (starting from the name on that account) and the terms.
// Leaving signs you out: half signed in, there's nothing to go back to.
const social = useSocialStore();
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
    <button class="link back" :disabled="social.busy" @click="social.signOut()">Cancel and sign out</button>
    <h2>Pick your username</h2>
    <p class="intro">One more step before you're in. You can change it once every 30 days.</p>
    <form @submit.prevent="ready && finish()">
      <UsernameField v-model="username" help="How everyone sees you. Letters, numbers, - and _." />
      <label class="terms">
        <input v-model="terms" type="checkbox">
        <span>I'm 13 or older and agree to the <a href="/terms.html" target="_blank">Terms</a> and <a href="/privacy.html" target="_blank">Privacy Policy</a></span>
      </label>
      <button class="primary" type="submit" :disabled="!ready">Continue</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
  </div>
</template>
