<script setup>
import { onMounted, ref, useTemplateRef } from 'vue';
import { useSocialStore } from '@/store/SocialStore';

const social = useSocialStore();
const code = ref('');
const backup = ref(false);
const trust = ref(false);
const error = ref(null);   // the last try's, in words: under the form rather than at the top of the tab
const input = useTemplateRef('input');

onMounted(() => input.value.focus());

async function verify() {
  error.value = null;
  if (await social.verifyTwoFactor(code.value, { backup: backup.value, trustDevice: trust.value })) return;
  code.value = '';
  if (social.page === 'two-factor') [error.value, social.notice] = [social.notice, null];   // an expired challenge's words stay on Sign in
}

function toggle() {
  backup.value = !backup.value;
  code.value = '';
  error.value = null;
  input.value.focus();
}
</script>

<template>
  <div class="form-page">
    <button class="link back" @click="social.page = 'sign-in'">‹ Cancel</button>
    <h2>Two-factor code</h2>
    <p class="intro">This account asks for a code each time you sign in.</p>
    <form @submit.prevent="verify">
      <label>{{ backup ? 'Backup code' : 'Code from your authenticator app' }}
        <input ref="input" v-model="code" autocomplete="one-time-code" :inputmode="backup ? undefined : 'numeric'" spellcheck="false" required>
      </label>
      <label class="terms">
        <input v-model="trust" type="checkbox">
        <span>Trust this computer for 30 days</span>
      </label>
      <button class="primary" type="submit" :disabled="social.busy">Verify</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
    <hr>
    <p class="foot">
      <button class="link inline" @click="toggle">{{ backup ? 'Use your authenticator app' : 'Use a backup code instead' }}</button>
    </p>
  </div>
</template>
