<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useSocialStore } from '@/store/SocialStore';
import { mountTurnstile } from '@/social/turnstile';

const social = useSocialStore();

// Sending the mail again needs a Turnstile token; the widget shows only if it needs you.
const widget = ref(null);
let token = () => null;
onMounted(() => mountTurnstile(widget.value, 'verify', { appearance: 'interaction-only' }).then((get) => { token = get; }, () => {}));
onBeforeUnmount(() => token.remove?.());
</script>

<template>
  <div>
    Confirm your email to start a room
    <button class="link inline" :disabled="social.busy" @click="social.resendConfirmation(token())">Resend</button>
    <div ref="widget" class="turnstile"></div>
  </div>
</template>
