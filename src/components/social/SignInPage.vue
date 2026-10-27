<script setup>
import { ref } from 'vue';
import { useSocialStore } from '@/store/SocialStore';

const social = useSocialStore();
const login = ref('');
const password = ref('');
const error = ref(null);   // the last try's, in words: under the form rather than at the top of the tab

const failed = () => { [error.value, social.notice] = [social.notice, null]; };

async function signIn() {
  error.value = null;
  if (await social.signIn(login.value.trim(), password.value)) return;
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
    <button class="link back" @click="social.page = 'lobby'">‹ Back to the lobby</button>
    <h2>Sign in</h2>
    <div class="providers">
      <button :disabled="social.busy" @click="signInWith('discord')">Continue with Discord</button>
      <button :disabled="social.busy" @click="signInWith('github')">Continue with GitHub</button>
    </div>
    <p class="or">or</p>
    <form @submit.prevent="signIn">
      <label>Email or username <input v-model="login" autocomplete="username" spellcheck="false" required></label>
      <label>Password <input v-model="password" type="password" autocomplete="current-password" required></label>
      <button class="primary" type="submit" :disabled="social.busy">Sign in</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
    <p class="help"><button class="link inline" @click="social.page = 'forgot'">Forgot your password?</button></p>
    <p class="help">No account? <button class="link inline" @click="social.page = 'create'">Create one</button></p>
  </div>
</template>
