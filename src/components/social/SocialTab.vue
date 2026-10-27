<script setup>
import { computed, onMounted } from 'vue';
import { useSocialStore } from '@/store/SocialStore';
import LobbyPage from './LobbyPage.vue';
import SignInPage from './SignInPage.vue';
import CreateAccountPage from './CreateAccountPage.vue';
import ForgotPasswordPage from './ForgotPasswordPage.vue';
import ResetPasswordPage from './ResetPasswordPage.vue';
import OnboardingPage from './OnboardingPage.vue';
import AccountPage from './AccountPage.vue';
import TwoFactorPage from './TwoFactorPage.vue';

const social = useSocialStore();
const PAGES = {
  lobby: LobbyPage, 'sign-in': SignInPage, create: CreateAccountPage, forgot: ForgotPasswordPage,
  reset: ResetPasswordPage, onboarding: OnboardingPage, account: AccountPage,
  'two-factor': TwoFactorPage,
};
onMounted(() => social.showLobby());

// Account is only for someone signed in: until /api/me has answered nothing shows (a link back from
// connecting a provider asks for Account first), and once it has, someone signed out gets the lobby.
const shownPage = computed(() => {
  if (social.page !== 'account' || social.signedIn) return social.page;
  return social.supported === null ? null : 'lobby';
});
</script>

<template>
  <article class="social-tab" @dragover.prevent @drop.prevent> <!-- a dropped file isn't opened by the browser -->
    <p v-if="social.supported === false" class="unsupported">This browser can't sign you in to SOCIAL yet</p>
    <template v-else>
      <p v-if="social.notice" class="notice" role="status">
        <span>{{ social.notice }}</span>
        <button class="link" aria-label="Dismiss" @click="social.notice = null">✕</button>
      </p>
      <div class="page" :data-page="shownPage">
        <component :is="PAGES[shownPage]" v-if="PAGES[shownPage]" />
      </div>
    </template>
  </article>
</template>

<style scoped>
article.social-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

p.notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
}

p.notice button.link {
  padding: 0 4px;
}

p.unsupported {
  margin: 0;
  padding: 32px 16px;
  font-size: 14px;
  color: var(--text-muted);
}

div.page {
  flex: 1;
  min-height: 0;
}
</style>

<!-- The sign-in and account forms' look, shared by their pages (unscoped: it reaches into them). -->
<style>
article.social-tab div.form-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 340px;
  margin: 0 auto;
  padding: 16px 16px 32px;
  font-size: 12px;
  color: var(--text-dim);
}
article.social-tab div.form-page button.back {
  align-self: flex-start;
  margin-left: -8px;
}
article.social-tab div.form-page h2 {
  margin: 8px 0 4px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
article.social-tab div.form-page div.providers,
article.social-tab div.form-page form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
article.social-tab div.form-page p.or {
  margin: 0;
  text-align: center;
  color: var(--text-faint);
}
article.social-tab div.form-page label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-weight: 500;
}
article.social-tab div.form-page label.terms {
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  font-weight: 400;
  line-height: 1.5;
}
article.social-tab div.form-page label.terms input {
  flex-shrink: 0;
  margin-top: 2px;
}
article.social-tab div.form-page a {
  color: var(--accent);
}
article.social-tab div.form-page p.help,
article.social-tab div.form-page p.error {
  margin: -4px 0 0;
  font-size: 11px;
  color: var(--text-muted);
}
article.social-tab div.form-page p.error {
  color: var(--danger);
}
article.social-tab div.form-page form p.error[role=alert] {
  margin: 0;
  font-size: 12px;
}
article.social-tab div.form-page div.turnstile:empty {
  display: none;
}
article.social-tab div.form-page button.link.inline {
  padding: 0;
  font-size: inherit;
  letter-spacing: normal;
  color: var(--accent);
}
</style>
