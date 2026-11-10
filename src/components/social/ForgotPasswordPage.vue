<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSocialStore } from '@/store/SocialStore';
import { mountTurnstile } from '@/social/turnstile';

const social = useSocialStore();
const { t } = useI18n();
const email = ref(social.me?.email ?? '');   // from Account's Forgot your password?, yours
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
    <h2>{{ t('social.auth.forgotHeading') }}</h2>
    <p class="intro">{{ t('social.auth.forgotIntro') }}</p>
    <form @submit.prevent="send">
      <label>{{ t('social.auth.emailLabel') }} <input v-model="email" type="email" autocomplete="email" required></label>
      <div ref="widget" class="turnstile"></div>
      <button class="primary" type="submit" :disabled="social.busy">{{ t('social.auth.sendLink') }}</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
    <template v-if="!social.me">
      <hr>
      <i18n-t keypath="social.auth.rememberedIt" tag="p" class="foot">
        <template #signIn>
          <button class="link inline" @click="social.page = 'sign-in'">{{ t('social.lobby.signIn') }}</button>
        </template>
      </i18n-t>
    </template>
  </div>
</template>
