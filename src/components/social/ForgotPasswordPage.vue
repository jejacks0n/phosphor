<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useSocialStore } from '@/store/SocialStore';
import { mountTurnstile } from '@/social/turnstile';

const social = useSocialStore();
const email = ref(social.me?.email ?? '');   // from Account's Send a reset link, yours
const error = ref(null);

const widget = ref(null);
let token = () => null;
onMounted(() => mountTurnstile(widget.value, 'forgot').then((get) => { token = get; }, () => {}));
onBeforeUnmount(() => token.remove?.());

// The same notice whether or not the email has an account.
async function send() {
  error.value = null;
  if (!await social.requestReset(email.value.trim(), token())) [error.value, social.notice] = [social.notice, null];
}
</script>

<template>
  <div class="form-page">
    <button class="link back" @click="social.page = 'lobby'">‹ Back to the {{ social.backTo }}</button>
    <h2>Forgot your password?</h2>
    <p class="help">We'll email you a link to set a new one.</p>
    <form @submit.prevent="send">
      <label>Email <input v-model="email" type="email" autocomplete="email" required></label>
      <div ref="widget" class="turnstile"></div>
      <button class="primary" type="submit" :disabled="social.busy">Send link</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
  </div>
</template>
