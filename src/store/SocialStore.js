import { defineStore } from 'pinia';
import { markRaw, shallowRef } from 'vue';
import { api } from '@/social/api';
import { apiOrigin, wsOrigin, appOrigin, desktopQuery } from '@/social/config';
import { messageFor } from '@/social/messages';
import { ed25519Supported, loadKey } from '@/social/keys';
import { requestPass, renewAt } from '@/social/pass';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useRoomStore, hasReportedRoom, keepRoomReport, keptRoomReports } from '@/store/RoomStore';
import { REASONS } from '@/social/chat';
import { emptyLobby, applyLobbyMessage, sortedRooms, sortedPeople, LobbyConnection } from '@/social/lobby';

const RENEW_RETRY_MS = 30_000;   // after a renewal that failed for a passing reason (NETWORK, THROTTLED)
const CONFIRMED = 'Check your email to confirm your address';
const RELINK = 'Sign in again to change how you sign in';

// The query params the server sends people back with (an error, and an error_description, come
// with verified or social), and a room's link; start() reads them and takes them off the URL, on a desktop
// (elsewhere there's no SOCIAL tab, so the link is left to be opened on a computer).
const RETURN_PARAMS = ['verified', 'reset', 'social', 'room'];
const ERROR_PARAMS = ['error', 'error_description'];

// The server asks for a recent sign-in before unlinking: SESSION_NOT_FRESH from unlink-account,
// SESSION_EXPIRED from delete-user.
const STALE_SESSION = new Set(['SESSION_EXPIRED', 'SESSION_NOT_FRESH']);
const NEW_CHALLENGE = new Set(['INVALID_TWO_FACTOR_COOKIE', 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE', 'ACCOUNT_TEMPORARILY_LOCKED']);   // the code can't be tried again: sign in again

// The room you were watching when you left the page to sign in: its id only (never its password), in
// sessionStorage, good for that one trip back: a page load other than a two-factor return, or a sign-in on
// the page, forgets it.
const REJOIN = 'phosphor-rejoin';
const keepRoom = (id) => {
  try {
    if (id) sessionStorage.setItem(REJOIN, id);
    else sessionStorage.removeItem(REJOIN);
  } catch { /* no storage: you come back to the lobby */ }
};
const keptRoom = () => {
  try {
    return sessionStorage.getItem(REJOIN);
  } catch {
    return null;
  }
};

// The sign-in providers the app knows, in the order shown; the server says which are set up (GET /api/providers).
export const PROVIDERS = [['discord', 'Discord'], ['github', 'GitHub']];

// The last guest pass this browser had, in localStorage, so a reload (or signing out) comes back as the same
// guest: it's sent as the previous pass, with a proof only this browser's key can make, so a copy of it is
// no use anywhere else. The server keeps a guest for a while after their last pass ends; past that, a new one.
const GUEST_PASS = 'phosphor-guest-pass';
const keepGuestPass = (pass) => {
  try {
    localStorage.setItem(GUEST_PASS, pass);
  } catch { /* no storage: a reload is a new guest */ }
};
const keptGuestPass = () => {
  try {
    return localStorage.getItem(GUEST_PASS) ?? undefined;
  } catch {
    return undefined;
  }
};

const withToken = (turnstileToken) => (turnstileToken ? { 'x-turnstile-token': turnstileToken } : undefined);

// The SOCIAL tab: you (/api/me), your pass, the lobby and the page shown, and every account action
// against the server. One lobby connection at a time; a new pass (signing in or out, a rename) means a
// new connection, while a renewed pass waits for the next hello and leaves the live one alone. Nothing
// runs (no key, no request) until the tab is first shown (showLobby) or a link back from the server
// opens it, so a visitor who never uses SOCIAL costs nothing and isn't in the lobby.
export const useSocialStore = defineStore('social', {
  state: () => ({
    supported: null,     // null until checked: false when this browser can't do Ed25519 or IndexedDB
    me: null,            // /api/me's body; null signed out
    page: 'lobby',       // 'lobby' | 'sign-in' | 'create' | 'forgot' | 'reset' | 'onboarding' | 'account' | 'two-factor' | 'start-room'
    resetToken: null,
    pass: null,
    claims: null,        // the pass's claims: { sub, name, guest, verified, key, exp }
    lobby: shallowRef(emptyLobby()),
    lobbyStatus: null,   // the connection's: 'connecting' | 'live' | 'reconnecting' | 'refused' | 'closed'
    blocked: [],         // [{ id, username, since }]
    roomReports: keptRoomReports(),   // the rooms reported in this browser, by account: [{ room, by }] (reportedRooms is yours)
    providers: [],       // the provider ids the server has set up: only those get a button
    notice: null,        // one line at the top of the tab
    busy: false,
    started: false,
    lobbyWanted: false,  // the SOCIAL tab has been shown
    _boot: null,         // boot()'s promise, once asked for
    _codePending: false, // a two-factor code is waited for (signIn's challenge, or the return from the server): its address is an arrival only then
    _roomLink: null,     // the room to go to once you're known: a ?room= link's (it asks first) or the one you signed in from
    _roomLinkAsks: false,
    roomInvite: null,    // a ?room= link's room, while it asks whether to join
    _key: null,          // the browser's key (markRaw)
    _connection: null,   // LobbyConnection (markRaw)
    _renewTimer: null,
    _passRun: 0,         // bumped when the pass is dropped, so a pass asked for before is ignored
    _refusedOnce: false, // the lobby refused a pass since it was last live: the next refusal stands
  }),

  getters: {
    signedIn: (state) => !!state.me && !state.me.needsOnboarding,
    rooms: (state) => sortedRooms(state.lobby),
    people: (state) => sortedPeople(state.lobby, state.claims?.sub),
    myName: (state) => state.claims?.name ?? null,
    // The ids of the rooms you reported (their cards have no Report room).
    reportedRooms: (state) => (state.claims ? state.roomReports.filter((r) => r.by === state.claims.sub).map((r) => r.room) : []),
    // The word for the sign-in pages' back link.
    backTo: () => (useRoomStore().role === 'watch' ? 'room' : 'lobby'),
    isGuest() {
      return this.claims?.guest ?? !this.signedIn;
    },
  },

  actions: {
    // At page load: a link back from the server is read, and starts SOCIAL; nothing else does.
    async start(location = window.location) {
      if (this.started) return;
      this.started = true;
      const toCode = new URL(location.href).searchParams.get('social') === 'two-factor';
      const returned = this.readReturn(location);
      if (!toCode) keepRoom(null);   // (readReturn has taken it for a signed-in return)
      if (!returned) return;
      await this.boot();
      this.joinLink();
    },

    // The SOCIAL tab is showing: once you're known, the lobby connects, and stays connected. A link back
    // left in the URL by a narrow window, since widened, is read now.
    async showLobby() {
      this.lobbyWanted = true;
      this.readReturn(window.location);
      await this.boot();
      this.joinLink();
      this.connectLobby();
    },

    // The room a ?room= link named, once, when you're done with onboarding (finishOnboarding comes back to it).
    joinLink() {
      if (this.me?.needsOnboarding) return;
      const id = this._roomLink;
      this._roomLink = null;
      if (id === null || !this.supported) return;
      if (this._roomLinkAsks) this.roomInvite = id;
      else useRoomStore().join(id);
    },

    // A link can come from anyone, and joining shows the host your IP address: it's your yes that joins.
    answerRoomInvite(yes) {
      const id = this.roomInvite;
      this.roomInvite = null;
      if (yes && id !== null) useRoomStore().join(id);
    },

    // This browser's key, then who you are; once, however often it's asked for.
    boot() {
      this._boot ??= (async () => {
        const supported = await ed25519Supported() && await loadKey().then(
          (key) => { this._key = markRaw(key); return true; },
          () => false,   // no IndexedDB (a private window in some browsers): the same plain message
        );
        if (supported) {
          await Promise.all([this.refreshMe(), this.loadProviders()]);
          if (this.me?.needsOnboarding) this.page = 'onboarding';
        }
        this.supported = supported;
      })();
      return this._boot;
    },

    // The params an email link or an OAuth return brought, read and then taken off the URL (others stay).
    // True if there were any, on a desktop.
    readReturn(location) {
      if (!matchMedia(desktopQuery).matches) return false;
      const url = new URL(location.href);
      const params = url.searchParams;
      const error = params.get('error');
      if (params.get('verified') === '1') this.notice = error ? messageFor(error) : 'Your email is confirmed';
      if (params.get('reset')) Object.assign(this, { resetToken: params.get('reset'), page: 'reset' });
      if (params.get('social') === 'linked') this.page = 'account';
      if (params.get('social') === 'email-changed') this.notice = error ? messageFor(error) : 'Your email is changed';
      if (params.get('social') === 'email-approved') this.notice = 'Approved. Now open the link sent to your new address';
      if (params.get('social') === 'two-factor') Object.assign(this, { page: 'two-factor', _codePending: true });   // (the room stays kept until the code)
      if (params.get('social') === 'signed-in') this._roomLink = keptRoom();
      if (params.has('room')) Object.assign(this, { _roomLink: params.get('room'), _roomLinkAsks: true });
      if (['signed-in', 'error'].includes(params.get('social'))) keepRoom(null);
      if (params.get('social') === 'error') {
        this.notice = error === 'EMAIL_NOT_VERIFIED' ? 'Confirm your email with Discord or GitHub first' : messageFor(error);
      }
      if (!RETURN_PARAMS.some((name) => params.has(name))) return false;
      useWorkspaceStore().editorTab = 'social';   // back to where you were
      [...RETURN_PARAMS, ...ERROR_PARAMS].forEach((name) => params.delete(name));
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      return true;
    },

    // One request: busy meanwhile (unless it's part of a longer action that is), and its error as the notice.
    async request(path, opts) {
      return this.whileBusy(async () => {
        const res = await api(path, opts);
        if (!res.ok) this.notice = messageFor(res.code, res.data ?? {});
        return res;
      });
    },

    // Busy until work is done; work run while already busy leaves it to the action that started it.
    async whileBusy(work) {
      if (this.busy) return work();
      this.busy = true;
      try {
        return await work();
      } finally {
        this.busy = false;
      }
    },

    async loadProviders() {
      const { ok, data } = await api('/api/providers');
      if (ok) this.providers = data.providers;
    },

    async refreshMe() {
      const { ok, status, data, code } = await api('/api/me');
      if (ok) this.me = data;
      else if (status === 401 || code === 'SUSPENDED') this.me = null;
      if (code === 'SUSPENDED') this.notice = messageFor(code, data);
    },

    // You're someone else now (signed in, or out): a room you host is ended, or one you watch left, then a
    // new pass and a new lobby connection. Signing in (not out) while watching goes back into the same room,
    // with the same password, as the new you.
    async becameSomeoneElse({ signedOut = false } = {}) {
      const rooms = useRoomStore();
      const back = signedOut ? null : rooms.rejoinInfo();
      keepRoom(null);
      rooms.close();
      if (signedOut) this.me = null;
      else await this.refreshMe();
      Object.assign(this, { blocked: [], _codePending: false, page: this.me?.needsOnboarding ? 'onboarding' : 'lobby' });
      this.reconnect();
      if (back) rooms.join(back.id, { password: back.password });
    },

    // Signing in or up stays busy until you're known, so the form can't be sent a second time meanwhile.
    // With two-factor on, the answer is only the challenge: the code comes next, and you're no one until then
    // (the server has ended a session you had).
    signIn(login, password, turnstileToken) {
      keepRoom(null);   // a sign-in here is not the trip back
      return this.whileBusy(async () => {
        const byEmail = login.includes('@');
        const { ok, data } = await this.request(byEmail ? '/api/auth/sign-in/email' : '/api/auth/sign-in/username', {
          method: 'POST', body: byEmail ? { email: login, password } : { username: login, password },
          headers: withToken(turnstileToken),   // needed only once the account has had too many tries
        });
        if (ok && data?.twoFactorRedirect) {
          if (this.me) await this.becameSomeoneElse({ signedOut: true });
          Object.assign(this, { page: 'two-factor', _codePending: true });
        } else if (ok) await this.becameSomeoneElse();
        return ok;
      });
    },

    // The code from the authenticator app (or a backup code), spaces and all: a challenge that expired, or that
    // had too many wrong codes, starts over. Nothing is sent for a code that's only spaces.
    verifyTwoFactor(code, { backup = false, trustDevice = false } = {}) {
      if (!code.trim()) return false;
      return this.whileBusy(async () => {
        const { ok, code: failure } = await this.request(`/api/auth/two-factor/${backup ? 'verify-backup-code' : 'verify-totp'}`, {
          method: 'POST', body: { code: code.replace(/\s/g, ''), trustDevice },
        });
        if (NEW_CHALLENGE.has(failure)) Object.assign(this, { page: 'sign-in', _codePending: false });
        if (ok) {
          // Back from Discord or GitHub and then the code: the room kept before leaving, unless it's already rejoined.
          const id = keptRoom();
          await this.becameSomeoneElse();
          if (id && !useRoomStore().role) useRoomStore().join(id);
        }
        return ok;
      });
    },

    // Turning two-factor on, off, or making new backup codes: an account with a password gives it, one without needs
    // a recent sign-in. Two-factor stays off until startTwoFactor's secret is confirmed with a code from the app.
    async twoFactor(action, password, body = {}) {
      const res = await this.request(`/api/auth/two-factor/${action}`, { method: 'POST', body: password ? { password, ...body } : body });
      this.staleSession(res.code);
      return res;
    },

    async startTwoFactor(password) {
      const { ok, data } = await this.twoFactor('enable', password);
      return ok ? data : null;
    },

    async confirmTwoFactor(code) {
      if (!code.trim()) return false;
      const { ok } = await this.twoFactor('verify-totp', undefined, { code: code.replace(/\s/g, '') });
      if (ok) await this.refreshMe();
      return ok;
    },

    async turnOffTwoFactor(password) {
      const { ok } = await this.twoFactor('disable', password);
      if (ok) await this.refreshMe();
      return ok;
    },

    async newBackupCodes(password) {
      const { ok, data } = await this.twoFactor('generate-backup-codes', password);
      return ok ? data.backupCodes : null;
    },

    signUp({ username, email, password, termsAccepted, turnstileToken }) {
      return this.whileBusy(async () => {
        const { ok } = await this.request('/api/auth/sign-up/email', {
          method: 'POST',
          body: { username, name: username, email, password, termsAccepted, callbackURL: appOrigin() + '/?verified=1' },
          headers: withToken(turnstileToken),
        });
        if (!ok) return false;
        this.notice = CONFIRMED;
        await this.becameSomeoneElse();
        return true;
      });
    },

    // Off to Discord or GitHub: busy until the page goes, or comes back from the back/forward cache.
    async signInWith(provider, location = window.location) {
      this.busy = true;
      const { ok, data } = await this.request('/api/auth/sign-in/social', {
        method: 'POST',
        body: { provider, callbackURL: appOrigin() + '/?social=signed-in', errorCallbackURL: appOrigin() + '/?social=error' },
      });
      if (!ok || !data?.url) {
        this.busy = false;
        return;
      }
      const rooms = useRoomStore();
      keepRoom(rooms.role === 'watch' ? rooms.id : null);   // so signing in takes you back to it
      addEventListener('pageshow', () => { this.busy = false; }, { once: true });
      location.assign(data.url);
    },

    async finishOnboarding(username) {
      const { ok, data } = await this.request('/api/me/onboarding', { method: 'POST', body: { username, termsAccepted: true } });
      if (!ok) return false;
      this.me = data;
      this.page = 'lobby';
      this.reconnect();
      this.joinLink();
      return true;
    },

    async signOut() {
      const { ok } = await this.request('/api/auth/sign-out', { method: 'POST', body: {} });
      if (ok) await this.becameSomeoneElse({ signedOut: true });
      return ok;
    },

    async requestReset(email, turnstileToken) {
      const { ok } = await this.request('/api/auth/request-password-reset', {
        method: 'POST', body: { email }, headers: withToken(turnstileToken),
      });
      // Your own address you know has an account; any other gets the same words whether or not it has one.
      const yours = email.toLowerCase() === this.me?.email?.toLowerCase();
      if (ok) this.notice = yours ? `A link is on its way to ${email}` : 'If that email has an account, a link is on its way';
      return ok;
    },

    async resetPassword(newPassword) {
      const { ok } = await this.request('/api/auth/reset-password', {
        method: 'POST', body: { newPassword, token: this.resetToken },
      });
      if (!ok) return false;
      Object.assign(this, { resetToken: null, page: 'sign-in', notice: 'Your password is changed. Sign in with it' });
      await this.refreshMe();   // a reset ends every session
      return true;
    },

    async resendConfirmation(turnstileToken) {
      const { ok } = await this.request('/api/auth/send-verification-email', {
        method: 'POST', body: { email: this.me?.email, callbackURL: appOrigin() + '/?verified=1' }, headers: withToken(turnstileToken),
      });
      if (ok) this.notice = CONFIRMED;
      return ok;
    },

    // Nothing changes until the links are opened. A confirmed address approves first; an address another account
    // uses gets the same words as any other.
    async changeEmail(newEmail, password, turnstileToken) {
      const { ok, code } = await this.request('/api/auth/change-email', {
        method: 'POST', body: { newEmail, password, callbackURL: appOrigin() + '/?social=email-changed' }, headers: withToken(turnstileToken),
      });
      this.staleSession(code);
      if (ok) this.notice = this.me.emailVerified ? `Check ${this.me.email} to approve the change` : `Check ${newEmail} to confirm it`;
      return ok;
    },

    async rename(username) {
      const { ok, data } = await this.request('/api/me/username', { method: 'PATCH', body: { username } });
      if (!ok) return false;
      this.me = data;
      this.reconnect();   // the pass carries the name
      return true;
    },

    async loadBlocked() {
      const { ok, data } = await this.request('/api/blocks');
      if (ok) this.blocked = data.blocked;
    },

    // Block someone from your rooms (the host's Block): true if the server took it.
    async block(username) {
      const { ok } = await this.request('/api/blocks', { method: 'POST', body: { username } });
      return ok;
    },

    async unblock(username) {
      const { ok } = await this.request(`/api/blocks/${encodeURIComponent(username)}`, { method: 'DELETE' });
      if (ok) this.blocked = this.blocked.filter((b) => b.username !== username);
      return ok;
    },

    async linkWith(provider, location = window.location) {
      const { ok, data } = await this.request('/api/auth/link-social', {
        method: 'POST',
        body: { provider, callbackURL: appOrigin() + '/?social=linked', errorCallbackURL: appOrigin() + '/?social=error' },
      });
      if (ok && data?.url) location.assign(data.url);
    },

    // The server unlinks by its own account id, which list-accounts has for each provider.
    async unlink(providerId) {
      const accounts = await this.request('/api/auth/list-accounts');
      if (!accounts.ok) return false;
      const account = Array.isArray(accounts.data) && accounts.data.find((a) => a.providerId === providerId);
      if (!account) {
        this.notice = messageFor('ACCOUNT_NOT_FOUND');
        return false;
      }
      const { ok, code } = await this.request('/api/auth/unlink-account', { method: 'POST', body: { accountId: account.id } });
      this.staleSession(code);
      if (ok) await this.refreshMe();
      return ok;
    },

    // Unlinking, or deleting without a password, needs a sign-in in the last 5 minutes.
    staleSession(code) {
      if (STALE_SESSION.has(code)) Object.assign(this, { notice: RELINK, page: 'sign-in' });
    },

    async deleteAccount(password) {
      const { ok, code } = await this.request('/api/auth/delete-user', { method: 'POST', body: password ? { password } : {} });
      this.staleSession(code);
      if (!ok) return false;
      this.notice = 'Your account is deleted';
      await this.becameSomeoneElse({ signedOut: true });
      return true;
    },

    // The pass for the next hello: the one held, unless there's none or it's due for renewal. A held
    // pass whose renewal timer was cleared (a disconnect) gets it back.
    async getPass() {
      const now = Date.now();
      if (!this.pass || renewAt(this.claims, now) <= now) await this.renewPass();
      else if (!this._renewTimer) this.renewIn(renewAt(this.claims, now) - now);
      if (!this.pass) throw new Error('No pass');
      return { pass: this.pass, privateKey: this._key.privateKey };
    },

    // A new pass: a guest's with the last one as previous (the same nickname), or with none held yet, the last
    // guest pass this browser kept; a member asks with none, and a member's pass is never anyone's previous. Renewed again on a timer before
    // it expires; a live connection keeps going, and its next hello uses the new one.
    async renewPass() {
      const run = this._passRun;
      const previous = this.claims ? (this.claims.guest ? this.pass : undefined) : (this.me ? undefined : keptGuestPass());
      const result = await requestPass(this._key, previous);
      if (run !== this._passRun) return;
      if (result.error) return this.passRefused(result);
      // A member's session ended (expired, revoked): the server answered with a guest's pass.
      if (this.claims && !this.claims.guest && result.claims.guest) return this.becameSomeoneElse({ signedOut: true });
      Object.assign(this, { pass: result.pass, claims: result.claims });
      if (result.claims.guest) keepGuestPass(result.pass);
      this.renewIn(renewAt(result.claims) - Date.now());
    },

    renewIn(ms) {
      clearTimeout(this._renewTimer);
      this._renewTimer = setTimeout(() => {
        this._renewTimer = null;
        this.renewPass();
      }, ms);
    },

    // A pass that won't come by retrying stops the lobby, and the room you're in. The others (THROTTLED,
    // NETWORK) are tried again: a hello by the connection's retry, a renewal (the held pass still good)
    // 30 s later.
    passRefused({ error, until }) {
      if (error === 'NEEDS_ONBOARDING') this.page = 'onboarding';
      else if (error === 'SUSPENDED') Object.assign(this, { me: null, notice: messageFor(error, { until }) });
      else {
        if (this.pass) this.renewIn(RENEW_RETRY_MS);
        return;
      }
      this._connection?.close();
      useRoomStore().close();   // a room's socket can't go on without one either; the page stays as set here
    },

    dropPass() {
      this.stopRenewing();
      Object.assign(this, { pass: null, claims: null });
    },

    // No renewal timer, and a renewal on its way is ignored when it comes back.
    stopRenewing() {
      clearTimeout(this._renewTimer);
      this._renewTimer = null;
      this._passRun++;
    },

    connectLobby() {
      if (!this.supported || !this.lobbyWanted || this._connection) return;
      this._connection = markRaw(new LobbyConnection({
        url: wsOrigin(apiOrigin()) + '/api/lobby',
        getPass: () => this.getPass(),
        onMessage: (msg) => this.lobbyMessage(msg),
        onStatus: (status) => this.lobbyStatusChanged(status),
      }));
      this._connection.open();
    },

    // A new pass and a new socket (open() closes the old one, so its visitor leaves the lobby).
    reconnect() {
      this.dropPass();
      if (this._connection) this._connection.open();
      else this.connectLobby();
    },

    disconnectLobby() {
      this._connection?.close();
      this.stopRenewing();
      this._connection = null;
    },

    lobbyMessage(msg) {
      this.lobby = applyLobbyMessage(this.lobby, msg);
    },

    // A report of a room from the lobby. False, sending nothing, if you can't report (a guest or an unconfirmed
    // member), the reason isn't one, you reported the room already or the lobby isn't open.
    reportRoom(id, reason) {
      if (!useRoomStore().canReport || !REASONS.some((r) => r.id === reason) || hasReportedRoom(id)) return false;
      if (!this._connection?.send({ type: 'report-room', id, reason })) return false;
      keepRoomReport(id);
      return true;
    },

    // A refused pass is tried once more with a fresh one; refused again, the lobby is unavailable (and
    // says the computer's clock may be why: proofs are timed).
    lobbyStatusChanged(status) {
      if (status === 'refused' && !this._refusedOnce) {
        this._refusedOnce = true;
        this.reconnect();
        return;
      }
      this.lobbyStatus = status;
      if (status === 'live') this._refusedOnce = false;
      if (status === 'refused') this.lobby = emptyLobby();
    },
  },
});
