<script setup>
import { onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSocialStore } from '@/store/SocialStore';
import { mountTurnstile, turnstileSiteKey } from '@/social/turnstile';

const social = useSocialStore();
const { t } = useI18n();

// Sending the mail again needs a Turnstile token, so Resend starts the check and its answer sends the
// mail. The widget shows only if it needs you, compact to fit the sidebar. One that fails or doesn't load
// leaves the token null, and the server says what it thinks of that.
const widget = ref(null);
const checking = ref(false);
let check = null;
const stopCheck = () => {
  check?.remove?.();
  check = null;
  checking.value = false;
};
const send = (token) => {
  stopCheck();
  social.resendConfirmation(token);
};
async function resend() {
  if (!turnstileSiteKey) return send(null);
  checking.value = true;
  try {
    check = await mountTurnstile(widget.value, 'verify', {
      appearance: 'interaction-only', size: 'compact', callback: send, 'error-callback': () => { send(null); return true; },
    });
  } catch {
    send(null);
  }
}
onBeforeUnmount(stopCheck);
</script>

<template>
  <div>
    {{ t('social.lobby.confirmToStart') }}
    <button class="link inline" :disabled="social.busy || checking" @click="resend">{{ t('social.lobby.resend') }}</button>
    <div ref="widget" class="turnstile"></div>
  </div>
</template>
