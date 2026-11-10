<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { renderSVG } from 'uqr';
import { useSocialStore, PROVIDERS } from '@/store/SocialStore';
import { usernameProblem } from '@/social/names';
import { messageFor } from '@/social/messages';
import { mountTurnstile } from '@/social/turnstile';
import UsernameField from './UsernameField.vue';
import UserName from './UserName.vue';

// Your username, the ways to sign in, two-factor, a link to who you blocked, and deleting the account. Errors of a form
// show under it; the others are the notice at the top of the tab.
const social = useSocialStore();
const { t } = useI18n();
const me = computed(() => social.me);
// The ones set up on the server, and any you have connected (so it can still be disconnected).
const ways = computed(() => PROVIDERS.filter(([id]) => social.providers.includes(id) || me.value.providers.includes(id)));
const lastWay = computed(() => me.value.providers.length === 1);
const canDisconnect = computed(() => PROVIDERS.some(([id]) => me.value.providers.includes(id)));
const hasPassword = computed(() => me.value.providers.includes('credential'));
const tooSoon = computed(() => {
  const until = me.value.usernameChangeableAt;
  return until && new Date(until) > Date.now() ? messageFor('TOO_SOON', { until }) : null;
});

const renaming = ref(false);
const username = ref('');
const renameError = ref(null);
const password = ref('');
const deleting = ref(false);
const deleteError = ref(null);
const changingEmail = ref(false);
const newEmail = ref('');
const emailPassword = ref('');
const emailError = ref(null);
const emailWidget = useTemplateRef('emailWidget');
let emailToken = () => null;
const changingPassword = ref(false);
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const passwordError = ref(null);

// Two-factor is one of three asks (turn on, turn off, new backup codes), each wanting the password; turning on then
// shows the secret to scan, and the backup codes. Both live here only, so they're gone once you leave the page.
const TWO_FACTOR_ASKS = computed(() => ({
  on: t('common.continue'),
  off: t('social.account.turnOffTwoFactor'),
  codes: t('social.account.makeNewCodes'),
}));
const ask = ref(null);
const twoFactorPassword = ref('');
const twoFactorError = ref(null);
const setup = ref(null);
const setupCode = ref('');
const backupCodes = ref(null);
const twoFactorSection = useTemplateRef('twoFactorSection');

// A panel opening takes focus (its first field, or Cancel when it has none) and closing gives it back
// to the button that opened it.
const changeButton = useTemplateRef('changeButton');
const changeEmailButton = useTemplateRef('changeEmailButton');
const emailForm = useTemplateRef('emailForm');
const changePasswordButton = useTemplateRef('changePasswordButton');
const passwordForm = useTemplateRef('passwordForm');
const deleteButton = useTemplateRef('deleteButton');
const renameForm = useTemplateRef('renameForm');
const deleteForm = useTemplateRef('deleteForm');
const focusIn = async (form) => {
  await nextTick();
  (form.value.querySelector('input') ?? form.value.querySelector('button[type=button]')).focus();
};
const focusOn = async (button) => {
  await nextTick();
  button.value?.focus();
};

const focusAsk = async (name) => {
  await nextTick();
  twoFactorSection.value.querySelector(`[data-ask="${name}"]`)?.focus();
};

const failed = (error) => { [error.value, social.notice] = [social.notice, null]; };

function startRename() {
  renameError.value = null;
  username.value = me.value.username;
  renaming.value = true;
  focusIn(renameForm);
}

function cancelRename() {
  renaming.value = false;
  focusOn(changeButton);
}

// The form's Turnstile check lives as long as the form does.
function startEmail() {
  if (changingPassword.value) endPassword();   // one at a time: each asks for the current password
  emailError.value = null;
  changingEmail.value = true;
  focusIn(emailForm);
  nextTick(() => mountTurnstile(emailWidget.value, 'email').then((get) => { emailToken = get; }, () => {}));
}

function endEmail() {
  emailToken.remove?.();
  emailToken = () => null;
  changingEmail.value = false;
  newEmail.value = emailPassword.value = '';
  emailError.value = null;
  focusOn(changeEmailButton);
}

async function submitEmail() {
  emailError.value = null;
  if (await social.changeEmail(newEmail.value.trim(), emailPassword.value, emailToken())) endEmail();
  else failed(emailError);
}

onBeforeUnmount(() => emailToken.remove?.());

function startPassword() {
  if (changingEmail.value) endEmail();
  changingPassword.value = true;
  focusIn(passwordForm);
}

function endPassword() {
  changingPassword.value = false;
  currentPassword.value = newPassword.value = confirmPassword.value = '';
  passwordError.value = null;
  focusOn(changePasswordButton);
}

async function submitPassword() {
  passwordError.value = null;
  if (newPassword.value !== confirmPassword.value) passwordError.value = t('social.account.passwordsDontMatch');
  else if (await social.changePassword(currentPassword.value, newPassword.value)) endPassword();
  else failed(passwordError);
}

function startDelete() {
  deleting.value = true;
  focusIn(deleteForm);
}

function cancelDelete() {
  deleting.value = false;
  password.value = '';
  deleteError.value = null;
  focusOn(deleteButton);
}

// Folding it away while the panel is open closes the panel, so no password stays behind in it.
function foldDelete(event) {
  if (!event.target.open && deleting.value) cancelDelete();
}

function startAsk(name) {
  twoFactorError.value = null;
  ask.value = name;
  focusIn(twoFactorSection);
}

function endTwoFactor(name) {
  ask.value = setup.value = backupCodes.value = null;
  twoFactorPassword.value = setupCode.value = '';
  twoFactorError.value = null;
  focusAsk(name);
}

async function submitAsk() {
  twoFactorError.value = null;
  const password = hasPassword.value ? twoFactorPassword.value : undefined;
  if (ask.value === 'on') {
    const started = await social.startTwoFactor(password);
    if (started) {
      setup.value = { backupCodes: started.backupCodes, key: new URL(started.totpURI).searchParams.get('secret'), qr: renderSVG(started.totpURI) };
      ask.value = null;
      twoFactorPassword.value = '';
      return focusIn(twoFactorSection);
    }
  } else if (ask.value === 'off') {
    if (await social.turnOffTwoFactor(password)) return endTwoFactor('on');
  } else {
    backupCodes.value = await social.newBackupCodes(password);
    if (backupCodes.value) {
      ask.value = null;
      twoFactorPassword.value = '';
      return focusIn(twoFactorSection);
    }
  }
  twoFactorPassword.value = '';
  if (social.page === 'account') failed(twoFactorError);   // else it sent you to sign in, with its own words
}

async function confirmSetup() {
  twoFactorError.value = null;
  if (await social.confirmTwoFactor(setupCode.value)) {
    backupCodes.value = setup.value.backupCodes;
    setup.value = null;
    setupCode.value = '';
    focusIn(twoFactorSection);
  } else failed(twoFactorError);
}

async function rename() {
  renameError.value = null;
  if (await social.rename(username.value)) cancelRename();
  else failed(renameError);
}

async function deleteAccount() {
  deleteError.value = null;
  if (await social.deleteAccount(hasPassword.value ? password.value : undefined)) return;
  password.value = '';
  if (social.page === 'account') failed(deleteError);   // else it sent you to sign in, with its own words
}
</script>

<template>
  <div class="form-page account">
    <h2>{{ t('social.account.heading') }}</h2>

    <section aria-labelledby="account-username">
      <h3 id="account-username">{{ t('social.account.usernameHeading') }}</h3>
      <form v-if="renaming" ref="renameForm" @submit.prevent="usernameProblem(username) || rename()">
        <UsernameField v-model="username" :help="t('social.account.usernameCooldownHelp')" />
        <div class="actions">
          <button type="button" @click="cancelRename">{{ t('common.cancel') }}</button>
          <button class="primary" type="submit" :disabled="social.busy || !!usernameProblem(username)">{{ t('common.save') }}</button>
        </div>
        <p v-if="renameError" class="error" role="alert">{{ renameError }}</p>
      </form>
      <template v-else>
        <div class="row">
          <UserName class="username" :name="me.username" />
          <button ref="changeButton" :disabled="!!tooSoon" aria-describedby="rename-help" @click="startRename">{{ t('social.account.changeUsernameBtn') }}</button>
        </div>
        <p id="rename-help" class="help">{{ tooSoon ?? t('social.account.usernameCooldownHelp') }}</p>
      </template>
    </section>

    <section aria-labelledby="account-ways">
      <h3 id="account-ways">{{ t('social.account.waysHeading') }}</h3>
      <div v-if="hasPassword" class="row">
        <span class="what">{{ t('social.account.emailAndPassword') }} <span class="detail" :title="me.email">{{ me.email }}</span></span>
        <span class="buttons">
          <button ref="changeEmailButton" :disabled="changingEmail" @click="startEmail">{{ t('social.account.changeEmail') }}</button>
          <button ref="changePasswordButton" :disabled="changingPassword" @click="startPassword">{{ t('social.account.changePassword') }}</button>
        </span>
      </div>
      <form v-if="changingEmail" ref="emailForm" @submit.prevent="submitEmail">
        <label>{{ t('social.account.newEmail') }} <input v-model="newEmail" type="email" autocomplete="email" maxlength="254" required></label>
        <label>{{ t('social.account.currentPassword') }} <input v-model="emailPassword" type="password" autocomplete="current-password" required></label>
        <p class="help">{{ me.emailVerified ? t('social.account.emailHelpVerified', { email: me.email }) : t('social.account.emailHelpUnverified') }}</p>
        <div ref="emailWidget" class="turnstile"></div>
        <div class="actions">
          <button type="button" @click="endEmail">{{ t('common.cancel') }}</button>
          <button class="primary" type="submit" :disabled="social.busy || !newEmail.trim() || !emailPassword">{{ t('social.account.changeEmail') }}</button>
        </div>
        <p v-if="emailError" class="error" role="alert">{{ emailError }}</p>
      </form>
      <form v-if="changingPassword" ref="passwordForm" @submit.prevent="submitPassword">
        <label>{{ t('social.account.currentPassword') }} <input v-model="currentPassword" type="password" autocomplete="current-password" required></label>
        <label>{{ t('social.auth.newPasswordLabel') }} <input v-model="newPassword" type="password" autocomplete="new-password" minlength="10" required aria-describedby="new-password-help"></label>
        <label>{{ t('social.account.confirmNewPassword') }} <input v-model="confirmPassword" type="password" autocomplete="new-password" required></label>
        <p id="new-password-help" class="help">{{ t('social.account.newPasswordHelp') }}</p>
        <div class="actions">
          <button type="button" @click="endPassword">{{ t('common.cancel') }}</button>
          <button class="primary" type="submit" :disabled="social.busy || !currentPassword || !newPassword || !confirmPassword">{{ t('social.account.changePassword') }}</button>
        </div>
        <p v-if="passwordError" class="error" role="alert">{{ passwordError }}</p>
        <p class="forgot"><button type="button" class="link" @click="social.page = 'forgot'">{{ t('social.auth.forgotPassword') }}</button></p>
      </form>
      <div v-for="[id, label] in ways" :key="id" class="row">
        <template v-if="me.providers.includes(id)">
          <span class="what">{{ label }} <span class="detail">{{ t('social.account.connected') }}</span></span>
          <button :disabled="social.busy || lastWay" :aria-label="t('social.account.disconnectAria', { provider: label })" :aria-describedby="lastWay ? 'last-way' : undefined" @click="social.unlink(id)">{{ t('social.account.disconnect') }}</button>
        </template>
        <template v-else>
          <span class="what">{{ label }} <span class="detail">{{ t('social.account.notConnected') }}</span></span>
          <button :disabled="social.busy" :aria-label="t('social.account.connectAria', { provider: label })" @click="social.linkWith(id)">{{ t('social.account.connect') }}</button>
        </template>
      </div>
      <p v-if="lastWay && canDisconnect" id="last-way" class="help">{{ t('social.account.needOneWay') }}</p>
    </section>

    <section ref="twoFactorSection" aria-labelledby="account-two-factor">
      <h3 id="account-two-factor">{{ t('social.account.twoFactorHeading') }}</h3>
      <template v-if="backupCodes">
        <p class="help">{{ t('social.account.backupCodesHelp') }}</p>
        <ul class="codes">
          <li v-for="code in backupCodes" :key="code">{{ code }}</li>
        </ul>
        <div class="actions">
          <button class="primary" type="button" @click="endTwoFactor('codes')">{{ t('common.done') }}</button>
        </div>
      </template>
      <form v-else-if="setup" @submit.prevent="confirmSetup">
        <p class="help">{{ t('social.account.scanQrHelp') }}</p>
        <div class="qr" role="img" :aria-label="t('social.account.qrAria')" v-html="setup.qr"></div>
        <code class="key">{{ setup.key }}</code>
        <label>{{ t('social.account.codeFromApp') }} <input v-model="setupCode" inputmode="numeric" autocomplete="one-time-code" required></label>
        <div class="actions">
          <button type="button" @click="endTwoFactor('on')">{{ t('common.cancel') }}</button>
          <button class="primary" type="submit" :disabled="social.busy || !setupCode.trim()">{{ t('social.account.turnOn') }}</button>
        </div>
        <p v-if="twoFactorError" class="error" role="alert">{{ twoFactorError }}</p>
      </form>
      <form v-else-if="ask" @submit.prevent="submitAsk">
        <label v-if="hasPassword">{{ t('social.auth.passwordLabel') }} <input v-model="twoFactorPassword" type="password" autocomplete="current-password" required></label>
        <p v-else class="help">{{ t('social.account.recentSignInHelp') }}</p>
        <div class="actions">
          <button type="button" @click="endTwoFactor(ask)">{{ t('common.cancel') }}</button>
          <button class="primary" type="submit" :disabled="social.busy || (hasPassword && !twoFactorPassword)">{{ TWO_FACTOR_ASKS[ask] }}</button>
        </div>
        <p v-if="twoFactorError" class="error" role="alert">{{ twoFactorError }}</p>
      </form>
      <div v-else-if="me.twoFactorEnabled" class="row">
        <span class="what">{{ t('social.account.twoFactorOn') }}</span>
        <span class="buttons">
          <button data-ask="codes" @click="startAsk('codes')">{{ t('social.account.newBackupCodes') }}</button>
          <button data-ask="off" @click="startAsk('off')">{{ t('social.account.turnOff') }}</button>
        </span>
      </div>
      <div v-else class="row">
        <span class="what">{{ t('social.account.twoFactorOff') }}</span>
        <button data-ask="on" @click="startAsk('on')">{{ t('social.account.turnOn') }}</button>
      </div>
    </section>

    <section aria-labelledby="account-blocked">
      <h3 id="account-blocked">{{ t('social.account.blockedHeading') }}</h3>
      <p class="help"><button class="link inline" @click="social.page = 'blocked'">{{ t('social.account.seeBlocked') }}</button></p>
    </section>

    <section aria-labelledby="account-delete">
      <details @toggle="foldDelete">
        <summary>
          <h3 id="account-delete">{{ t('social.account.deleteHeading') }}</h3>
          <svg class="chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true"><path d="M201.4 342.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 274.7 86.6 137.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>
        </summary>
        <button v-if="!deleting" ref="deleteButton" class="danger" @click="startDelete">{{ t('social.account.deleteHeading') }}</button>
        <form v-else ref="deleteForm" @submit.prevent="deleteAccount">
          <p class="help">{{ t('social.account.deleteHelp') }}</p>
          <label v-if="hasPassword">{{ t('social.auth.passwordLabel') }} <input v-model="password" type="password" autocomplete="current-password" required></label>
          <p v-else class="help">{{ t('social.account.deleteRecentSignInHelp') }}</p>
          <div class="actions">
            <button type="button" @click="cancelDelete">{{ t('common.cancel') }}</button>
            <button class="danger" type="submit" :disabled="social.busy || (hasPassword && !password)">{{ t('social.account.deleteForGood') }}</button>
          </div>
          <p v-if="deleteError" class="error" role="alert">{{ deleteError }}</p>
        </form>
      </details>
    </section>
  </div>
</template>

<style scoped>
section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}
div.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
div.row > button,
div.row > span.buttons {
  margin-left: auto;
}
span.buttons {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}
div.actions {
  display: flex;
  gap: 8px;
}
span.what {
  display: flex;
  flex-direction: column;
  min-width: 0;
  color: var(--text);
}
span.detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--text-muted);
}
span.username {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text);
}
p.help, p.forgot {
  margin: 0;
}
p.forgot button.link {
  padding: 0;
  font-size: inherit;
  letter-spacing: normal;
  color: var(--accent);
}
div.qr {
  width: 160px;
  background: #fff;
}
code.key, ul.codes {
  font-family: 'JetBrains Mono', monospace;
  color: var(--text);
}
ul.codes {
  margin: 0;
  padding: 0;
  list-style: none;
}
summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}
details[open] > summary {
  margin-bottom: 8px;
}
details > button.danger {
  width: 100%;
}
svg.chevron {   /* as the charset field's: down while folded, up once open */
  flex: none;
  width: 11px;
  height: 11px;
  fill: currentColor;
  transition: transform 0.15s ease;
}
details[open] svg.chevron {
  transform: rotate(180deg);
}
@media (prefers-reduced-motion: reduce) {
  svg.chevron {
    transition: none;
  }
}
</style>
