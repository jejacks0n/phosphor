<script setup>
import { computed, nextTick, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore } from '@/store/RoomStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { goingBackReplacesWords } from '@/social/messages';
import ModalDialog from '@/components/ModalDialog.vue';
import ConsentDialog from './ConsentDialog.vue';
import SignInPage from './SignInPage.vue';
import CreateAccountPage from './CreateAccountPage.vue';
import ForgotPasswordPage from './ForgotPasswordPage.vue';
import ResetPasswordPage from './ResetPasswordPage.vue';
import OnboardingPage from './OnboardingPage.vue';
import AccountPage from './AccountPage.vue';
import TwoFactorPage from './TwoFactorPage.vue';
import StartRoomPage from './StartRoomPage.vue';

// SOCIAL's layer over everything, on a wide screen: its first question, the page open (social.page: signing in, the
// account, starting a room) and a room's link asking whether to join. The question comes up once something of SOCIAL
// is wanted (the lobby showing, a page, a link) and nothing of it runs until it's answered (SocialStore.boot).
const social = useSocialStore(), room = useRoomStore(), workspace = useWorkspaceStore();
const { t } = useI18n();

// Each page, with the words its dialog is named by (its heading), where Escape and its close button go, and whether
// it's two columns wide. A page with nowhere to go has no close button.
const PAGES = {
  'sign-in': [SignInPage, 'social.auth.signInHeading', 'lobby'],
  create: [CreateAccountPage, 'social.auth.createHeading', 'lobby'],
  forgot: [ForgotPasswordPage, 'social.auth.forgotHeading', 'lobby'],
  reset: [ResetPasswordPage, 'social.auth.resetHeading', 'lobby'],
  onboarding: [OnboardingPage, 'social.auth.onboardingHeading', null],   // no way back but its Cancel and sign out
  account: [AccountPage, 'social.account.heading', 'lobby'],
  'two-factor': [TwoFactorPage, 'social.auth.twoFactorHeading', 'sign-in'],
  'start-room': [StartRoomPage, 'social.start.heading', 'lobby', true],
};

const lobbyShown = computed(() => !room.inRoom && !workspace.sidePanelFolded && workspace.sidePanelTab === 'social');
const wanted = computed(() => lobbyShown.value || social.page !== 'lobby' || social._roomLink !== null);

// Account is only for someone signed in: until /api/me has answered nothing shows (a link back from connecting a
// provider asks for Account first), and once it has, someone signed out gets none.
const page = computed(() => {
  if (!social.allowed || social.supported !== true) return null;
  if (social.page === 'account' && !social.signedIn) return null;
  return PAGES[social.page] ? social.page : null;
});
const cancel = () => {
  const to = PAGES[page.value][2];
  if (to) social.page = to;
};

// A page takes focus at its heading (not left behind on the button that opened it), unless it put focus in itself
// on mounting.
const body = useTemplateRef('body');
watch(page, async () => {
  await nextTick();
  const heading = body.value?.querySelector('h2');
  if (!heading || body.value.contains(document.activeElement)) return;
  heading.tabIndex = -1;
  heading.focus();
}, { immediate: true });

const linkIsYours = computed(() => room.reclaimable.some((r) => r.id === social.roomInvite));
</script>

<template>
  <ConsentDialog v-if="!social.allowed && wanted"/>
  <ModalDialog v-else-if="page" long :wide="!!PAGES[page][3]" :focus="false" :label="t(PAGES[page][1])" :closable="!!PAGES[page][2]" @cancel="cancel">
    <div ref="body" class="people-forms" :data-page="page">
      <p v-if="social.notice" class="notice" role="status">
        <span>{{ social.notice }}</span>
        <button class="link" :aria-label="t('common.dismiss')" @click="social.notice = null">✕</button>
      </p>
      <component :is="PAGES[page][0]" />
    </div>
  </ModalDialog>
  <ModalDialog v-if="social.allowed && social.roomInvite" closable :title="t('social.joinDialog.title')" :sub="t('social.joinDialog.sub')" @cancel="social.answerRoomInvite(false)">
    <p v-if="linkIsYours && room.goingBackReplaces" class="replaces">{{ goingBackReplacesWords() }}</p>
    <div class="actions">
      <button @click="social.answerRoomInvite(false)">{{ t('common.notNow') }}</button>
      <button @click="social.answerRoomInvite(true)">{{ t('social.joinDialog.join') }}</button>
      <button v-if="linkIsYours" class="primary" @click="room.goBackToRoom(social.roomInvite)">{{ t('social.joinDialog.backToYourRoom') }}</button>
    </div>
  </ModalDialog>
</template>

<style scoped>
p.replaces {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--text-muted);
}
div.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

<!-- The forms' look, shared by the pages here and the host's Settings and stats (unscoped: it reaches into them). -->
<style>
/* A button's words stay on one line; whatever is beside it wraps instead. */
div.people-forms button {
  flex-shrink: 0;
  white-space: nowrap;
}
div.people-forms p.notice {   /* clear of the dialog's close button, over its top right corner */
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin: 0 30px 12px 0;
  padding: 8px 10px;
  border-radius: 4px;
  background: var(--surface-2);
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-muted);
}
div.people-forms p.notice button.link {
  padding: 0 4px;
}
/* The forms look as the SAUCE tab does: an accent title, a muted line under it, small uppercase labels over
   full-width fields, and a rule before what comes after the form. */
div.people-forms div.form-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-size: 12px;
  color: var(--text-dim);
}
div.people-forms div.form-page button.back {
  align-self: flex-start;
  margin: -8px 0 -8px -8px;
}
div.people-forms :is(div.form-page, div.start-room, div.host-room) h2 {   /* as SAUCE's title */
  margin: 0;
  font-size: 14px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent);
}
div.people-forms div.form-page p.intro {
  margin: -6px 0 0;
  line-height: 1.5;
  color: var(--text-muted);
}
div.people-forms div.form-page div.providers,
div.people-forms div.form-page form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
div.people-forms div.form-page div.providers {
  gap: 10px;
}
div.people-forms div.form-page p.or {   /* a rule with "or" in it */
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-faint);
}
div.people-forms div.form-page p.or::before,
div.people-forms div.form-page p.or::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--border-subtle);
}
div.people-forms :is(div.form-page, div.start-room, section.settings) label:not(.terms, .choice) {   /* as SAUCE's labels */
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-faint);
}
div.people-forms div.form-page label.terms {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  line-height: 1.5;
}
div.people-forms div.form-page label.terms input {
  flex-shrink: 0;
  margin-top: 2px;
}
div.people-forms div.form-page a {
  color: var(--accent);
}
div.people-forms div.form-page p.help,
div.people-forms div.form-page p.error {
  margin: -10px 0 0;   /* 6px under its field, as a label is over it */
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-muted);
}
div.people-forms div.form-page p.error {
  color: var(--danger);
}
div.people-forms div.form-page form p.error[role=alert] {
  margin: 0;
  font-size: 12px;
}
div.people-forms div.form-page hr {
  margin: 0;
}
div.people-forms div.form-page p.foot {   /* the links after the form, past its rule */
  margin: -8px 0 0;
  color: var(--text-muted);
}
div.people-forms div.form-page hr + p.foot {
  margin: 0;
}
div.people-forms div.form-page div.turnstile:empty {
  display: none;
}
div.people-forms div.form-page button.link.inline {
  padding: 0;
  font-size: inherit;
  letter-spacing: normal;
  color: var(--accent);
}
</style>
