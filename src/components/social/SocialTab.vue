<script setup>
import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore } from '@/store/RoomStore';
import LobbyPage from './LobbyPage.vue';
import SignInPage from './SignInPage.vue';
import CreateAccountPage from './CreateAccountPage.vue';
import ForgotPasswordPage from './ForgotPasswordPage.vue';
import ResetPasswordPage from './ResetPasswordPage.vue';
import OnboardingPage from './OnboardingPage.vue';
import AccountPage from './AccountPage.vue';
import TwoFactorPage from './TwoFactorPage.vue';
import HostRoomPage from './HostRoomPage.vue';
import WatchRoomPage from './WatchRoomPage.vue';

const social = useSocialStore();
const room = useRoomStore();
const PAGES = {
  lobby: LobbyPage, 'sign-in': SignInPage, create: CreateAccountPage, forgot: ForgotPasswordPage,
  reset: ResetPasswordPage, onboarding: OnboardingPage, account: AccountPage,
  'two-factor': TwoFactorPage, 'start-room': LobbyPage, 'host-room': HostRoomPage, 'watch-room': WatchRoomPage,
};
const SIGN_IN_PAGES = new Set(['sign-in', 'create', 'forgot', 'two-factor', 'onboarding']);
onMounted(() => social.showLobby());

// The room you host or watch, while you do (a guest watching still gets the sign-in pages, to sign in to chat). Account is only for someone signed in: until /api/me has answered
// nothing shows (a link back from connecting a provider asks for Account first), and once it has,
// someone signed out gets the lobby.
const shownPage = computed(() => {
  if (room.role === 'host') return 'host-room';
  if (room.role === 'watch' && !SIGN_IN_PAGES.has(social.page)) return 'watch-room';
  if (social.page !== 'account' || social.signedIn) return social.page;
  return social.supported === null ? null : 'lobby';
});

// A new page takes focus at its heading (not left on the body when the button that opened it goes),
// unless it put focus in itself on mounting.
const pageRef = useTemplateRef('page');
watch(shownPage, async () => {
  await nextTick();
  const page = pageRef.value, heading = page?.querySelector('h2');
  if (!heading || page.contains(document.activeElement)) return;
  heading.tabIndex = -1;
  heading.focus();
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
      <div ref="page" class="page" :data-page="shownPage">
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
div.page :deep(h2:focus) {
  outline: none;
}
</style>

<!-- The sign-in and account forms' look, shared by their pages (unscoped: it reaches into them). -->
<style>
/* A button's words stay on one line; whatever is beside it wraps instead. */
article.social-tab button {
  flex-shrink: 0;
  white-space: nowrap;
}
/* The SOCIAL forms look as the SAUCE tab does: a column up to 450px wide, in the middle (across, and down
   while it's shorter than the tab), with an accent title, a muted line under it, small uppercase labels
   over full-width fields, and a rule before what comes after the form. */
article.social-tab div.form-page {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 16px;
  box-sizing: border-box;
  min-height: 100%;
  max-width: 450px;
  margin: 0 auto;
  padding: 40px;
  font-size: 12px;
  color: var(--text-dim);
}
article.social-tab div.form-page button.back {
  align-self: flex-start;
  margin: -8px 0 -8px -8px;
}
article.social-tab div.form-page h2 {
  margin: 0;
}
article.social-tab :is(div.form-page, div.lobby, div.start-room) h2 {   /* as SAUCE's title */
  font-size: 14px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent);
}
article.social-tab div.form-page p.intro {
  margin: -6px 0 0;
  line-height: 1.5;
  color: var(--text-muted);
}
article.social-tab div.form-page div.providers,
article.social-tab div.form-page form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
article.social-tab div.form-page div.providers {
  gap: 10px;
}
article.social-tab div.form-page p.or {   /* a rule with "or" in it */
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-faint);
}
article.social-tab div.form-page p.or::before,
article.social-tab div.form-page p.or::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--border-subtle);
}
article.social-tab :is(div.form-page, div.start-room, section.settings) label:not(.terms, .choice) {   /* as SAUCE's labels */
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-faint);
}
article.social-tab div.form-page label.terms {
  display: flex;
  align-items: flex-start;
  gap: 8px;
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
  margin: -10px 0 0;   /* 6px under its field, as a label is over it */
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-muted);
}
article.social-tab div.form-page p.error {
  color: var(--danger);
}
article.social-tab div.form-page form p.error[role=alert] {
  margin: 0;
  font-size: 12px;
}
article.social-tab div.form-page hr {
  margin: 0;
}
article.social-tab div.form-page p.foot {   /* the links after the form, past its rule */
  margin: -8px 0 0;
  color: var(--text-muted);
}
article.social-tab div.form-page hr + p.foot {
  margin: 0;
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
