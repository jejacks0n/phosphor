<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useSocialStore } from '@/store/SocialStore';
import { usernameProblem } from '@/social/names';
import { mountTurnstile } from '@/social/turnstile';
import UsernameField from './UsernameField.vue';

const social = useSocialStore();
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
    <button class="link back" @click="social.page = 'lobby'">‹ Back to the {{ social.backTo }}</button>
    <h2>Create an account</h2>
    <form @submit.prevent="ready && create()">
      <UsernameField v-model="username" help="How everyone sees you. Letters, numbers, - and _." />
      <label>Email <input v-model="email" type="email" autocomplete="email" required></label>
      <label>Password <input v-model="password" type="password" autocomplete="new-password" minlength="10" required aria-describedby="create-password-help"></label>
      <p id="create-password-help" class="help">At least 10 characters, not a known leaked one.</p>
      <div ref="widget" class="turnstile"></div>
      <label class="terms">
        <input v-model="terms" type="checkbox">
        <span>I'm 13 or older and agree to the <a href="/terms.html" target="_blank">Terms</a> and <a href="/privacy.html" target="_blank">Privacy Policy</a></span>
      </label>
      <button class="primary" type="submit" :disabled="!ready">Create account</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
    <p class="help">Have an account? <button class="link inline" @click="social.page = 'sign-in'">Sign in</button></p>
  </div>
</template>
