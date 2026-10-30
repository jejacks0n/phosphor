<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useSocialStore, PROVIDERS } from '@/store/SocialStore';
import { mountTurnstile } from '@/social/turnstile';

const social = useSocialStore();
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
    <button class="link back" @click="social.page = 'lobby'">‹ Back to the {{ social.backTo }}</button>
    <h2>Sign in</h2>
    <p class="intro">Sign in to chat and start rooms.</p>
    <template v-if="shown.length">
      <div class="providers">
        <button v-for="[id, label] in shown" :key="id" :disabled="social.busy" @click="signInWith(id)">Continue with {{ label }}</button>
      </div>
      <p class="or">or</p>
    </template>
    <form @submit.prevent="signIn">
      <label>Email or username <input v-model="login" autocomplete="username" spellcheck="false" required></label>
      <label>Password <input v-model="password" type="password" autocomplete="current-password" required></label>
      <div ref="widget" class="turnstile"></div>
      <button class="primary" type="submit" :disabled="social.busy">Sign in</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
    <hr>
    <p class="foot"><button class="link inline" @click="social.page = 'forgot'">Forgot your password?</button></p>
    <p class="foot">No account? <button class="link inline" @click="social.page = 'create'">Create one</button></p>
  </div>
</template>
