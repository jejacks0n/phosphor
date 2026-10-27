import { defineStore } from 'pinia';
import { markRaw, shallowRef } from 'vue';
import { api } from '@/social/api';
import { apiOrigin, wsOrigin, appOrigin } from '@/social/config';
import { messageFor } from '@/social/messages';
import { ed25519Supported, loadKey } from '@/social/keys';
import { requestPass, renewAt } from '@/social/pass';
import { emptyLobby, applyLobbyMessage, sortedRooms, sortedPeople, LobbyConnection, Pacer } from '@/social/lobby';

const SIGNAL_EVERY_MS = 2000;
const CONFIRMED = 'Check your email to confirm your address';
const RELINK = 'Sign in again to change how you sign in';

// The query params the server sends people back with (an error comes with verified or social); start()
// reads them and takes them off the URL.
const RETURN_PARAMS = ['verified', 'reset', 'social'];

// The server asks for a recent sign-in before unlinking: SESSION_NOT_FRESH from unlink-account,
// SESSION_EXPIRED from delete-user.
const STALE_SESSION = new Set(['SESSION_EXPIRED', 'SESSION_NOT_FRESH']);

const withToken = (turnstileToken) => (turnstileToken ? { 'x-turnstile-token': turnstileToken } : undefined);

// The SOCIAL tab: you (/api/me), your pass, the lobby and the page shown, and every account action
// against the server. One lobby connection at a time; a new pass (signing in or out, a rename) means a
// new connection, while a renewed pass waits for the next hello and leaves the live one alone.
export const useSocialStore = defineStore('social', {
  state: () => ({
    supported: null,     // null until checked: false when this browser can't do Ed25519 or IndexedDB
    me: null,            // /api/me's body; null signed out
    page: 'lobby',       // 'lobby' | 'sign-in' | 'create' | 'forgot' | 'reset' | 'onboarding' | 'account'
    resetToken: null,
    pass: null,
    claims: null,        // the pass's claims: { sub, name, guest, verified, key, exp }
    lobby: shallowRef(emptyLobby()),
    lobbyStatus: null,   // the connection's: 'connecting' | 'live' | 'reconnecting' | 'refused' | 'closed'
    signal: null,        // 'feedback' | 'chat' | 'heads-down' | null (members only)
    blocked: [],         // [{ username, since }]
    notice: null,        // one line at the top of the tab
    busy: false,
    joining: null,       // the room openRoom was asked for (the rooms plan fills this in)
    started: false,
    _key: null,          // the browser's key (markRaw)
    _connection: null,   // LobbyConnection (markRaw)
    _pacer: null,        // Pacer for the signal (markRaw)
    _renewTimer: null,
    _passRun: 0,         // bumped when the pass is dropped, so a pass asked for before is ignored
  }),

  getters: {
    signedIn: (state) => !!state.me && !state.me.needsOnboarding,
    rooms: (state) => sortedRooms(state.lobby),
    people: (state) => sortedPeople(state.lobby, state.claims?.sub),
    myName: (state) => state.claims?.name ?? null,
    isGuest() {
      return this.claims?.guest ?? !this.signedIn;
    },
  },

  actions: {
    async start(location = window.location) {
      if (this.started) return;
      this.started = true;
      this.readReturn(location);
      this.supported = await ed25519Supported() && await loadKey().then(
        (key) => { this._key = markRaw(key); return true; },
        () => false,   // no IndexedDB (a private window in some browsers): the same plain message
      );
      if (!this.supported) return;
      await this.refreshMe();
      if (this.me?.needsOnboarding) this.page = 'onboarding';
      this.connectLobby();
    },

    // The params an email link or an OAuth return brought, read and then taken off the URL (others stay).
    readReturn(location) {
      const url = new URL(location.href);
      const params = url.searchParams;
      const error = params.get('error');
      if (params.get('verified') === '1') this.notice = error ? messageFor(error) : 'Your email is confirmed';
      if (params.get('reset')) Object.assign(this, { resetToken: params.get('reset'), page: 'reset' });
      if (params.get('social') === 'linked') this.page = 'account';
      if (params.get('social') === 'error') {
        this.notice = error === 'EMAIL_NOT_VERIFIED' ? 'Confirm your email with Discord or GitHub first' : messageFor(error);
      }
      if (!RETURN_PARAMS.some((name) => params.has(name))) return;
      [...RETURN_PARAMS, 'error'].forEach((name) => params.delete(name));
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    },

    // One request: busy meanwhile, and its error as the notice.
    async request(path, opts) {
      this.busy = true;
      try {
        const res = await api(path, opts);
        if (!res.ok) this.notice = messageFor(res.code, res.data ?? {});
        return res;
      } finally {
        this.busy = false;
      }
    },

    async refreshMe() {
      const { ok, status, data, code } = await api('/api/me');
      if (ok) this.me = data;
      else if (status === 401 || code === 'SUSPENDED') this.me = null;
      if (code === 'SUSPENDED') this.notice = messageFor(code, data);
    },

    // You're someone else now (signed in, or out): a new pass and a new lobby connection.
    async becameSomeoneElse({ signedOut = false } = {}) {
      if (signedOut) this.me = null;
      else await this.refreshMe();
      Object.assign(this, { signal: null, blocked: [], page: this.me?.needsOnboarding ? 'onboarding' : 'lobby' });
      this.reconnect();
    },

    async signIn(login, password) {
      const byEmail = login.includes('@');
      const { ok } = await this.request(byEmail ? '/api/auth/sign-in/email' : '/api/auth/sign-in/username', {
        method: 'POST', body: byEmail ? { email: login, password } : { username: login, password },
      });
      if (ok) await this.becameSomeoneElse();
      return ok;
    },

    async signUp({ username, email, password, termsAccepted, turnstileToken }) {
      const { ok } = await this.request('/api/auth/sign-up/email', {
        method: 'POST',
        body: { username, name: username, email, password, termsAccepted, callbackURL: appOrigin() + '/?verified=1' },
        headers: withToken(turnstileToken),
      });
      if (!ok) return false;
      this.notice = CONFIRMED;
      await this.becameSomeoneElse();
      return true;
    },

    async signInWith(provider, location = window.location) {
      const { ok, data } = await this.request('/api/auth/sign-in/social', {
        method: 'POST',
        body: { provider, callbackURL: appOrigin() + '/?social=signed-in', errorCallbackURL: appOrigin() + '/?social=error' },
      });
      if (ok && data?.url) location.assign(data.url);
    },

    async finishOnboarding(username) {
      const { ok, data } = await this.request('/api/me/onboarding', { method: 'POST', body: { username, termsAccepted: true } });
      if (!ok) return false;
      this.me = data;
      this.page = 'lobby';
      this.reconnect();
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
      if (ok) this.notice = 'If that email has an account, a link is on its way';
      return ok;
    },

    async resetPassword(newPassword) {
      const { ok } = await this.request('/api/auth/reset-password', {
        method: 'POST', body: { newPassword, token: this.resetToken },
      });
      if (!ok) return false;
      Object.assign(this, { resetToken: null, page: 'sign-in', notice: 'Your password is changed. Sign in with it' });
      return true;
    },

    async resendConfirmation() {
      const { ok } = await this.request('/api/auth/send-verification-email', {
        method: 'POST', body: { email: this.me?.email, callbackURL: appOrigin() + '/?verified=1' },
      });
      if (ok) this.notice = CONFIRMED;
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
      if (!account) return false;
      const { ok, code } = await this.request('/api/auth/unlink-account', { method: 'POST', body: { accountId: account.id } });
      if (STALE_SESSION.has(code)) Object.assign(this, { notice: RELINK, page: 'sign-in' });
      if (ok) await this.refreshMe();
      return ok;
    },

    async deleteAccount(password) {
      const { ok } = await this.request('/api/auth/delete-user', { method: 'POST', body: password ? { password } : {} });
      if (!ok) return false;
      this.notice = 'Your account is deleted';
      await this.becameSomeoneElse({ signedOut: true });
      return true;
    },

    setSignal(signal) {
      if (!this.signedIn) return;
      this.signal = signal;
      this._pacer?.push(signal);
    },

    // The pass for the next hello: the one held, unless there's none or it's due for renewal.
    async getPass() {
      const now = Date.now();
      if (!this.pass || renewAt(this.claims, now) <= now) await this.renewPass();
      if (!this.pass) throw new Error('No pass');
      return { pass: this.pass, privateKey: this._key.privateKey };
    },

    // A new pass, as a guest with the last one as previous (the same nickname). Renewed again on a
    // timer before it expires; a live connection keeps going, and its next hello uses the new one.
    async renewPass() {
      const run = this._passRun;
      const result = await requestPass(this._key, this.claims?.guest ? this.pass : undefined);
      if (run !== this._passRun) return;
      if (result.error) return this.passRefused(result);
      Object.assign(this, { pass: result.pass, claims: result.claims });
      clearTimeout(this._renewTimer);
      this._renewTimer = setTimeout(() => this.renewPass(), renewAt(result.claims) - Date.now());
    },

    // A pass that won't come by retrying stops the lobby; the others (THROTTLED, NETWORK) retry with it.
    passRefused({ error, until }) {
      if (error === 'NEEDS_ONBOARDING') this.page = 'onboarding';
      else if (error === 'SUSPENDED') Object.assign(this, { me: null, notice: messageFor(error, { until }) });
      else return;
      this._connection?.close();
    },

    dropPass() {
      clearTimeout(this._renewTimer);
      Object.assign(this, { pass: null, claims: null, _renewTimer: null });
      this._passRun++;
    },

    connectLobby() {
      if (!this.supported || this._connection) return;
      this._pacer ??= markRaw(new Pacer(SIGNAL_EVERY_MS, (signal) => this._connection?.send({ type: 'signal', signal }) ?? false));
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
      this._pacer?.reset();
      clearTimeout(this._renewTimer);
      Object.assign(this, { _connection: null, _renewTimer: null });
    },

    lobbyMessage(msg) {
      this.lobby = applyLobbyMessage(this.lobby, msg);
      // The server's answer to a signal sent; one still waiting to go would only flicker back.
      if (msg.type === 'person' && msg.person.sub === this.claims?.sub && !this._pacer?.timer) this.signal = msg.person.signal;
    },

    lobbyStatusChanged(status) {
      this.lobbyStatus = status;
      if (status === 'live') {
        // A new socket's signal starts over: send the current one again.
        this._pacer.reset();
        if (this.signal) this._pacer.push(this.signal);
      }
      if (status === 'refused') this.lobby = emptyLobby();
    },

    openRoom(id) {
      this.joining = id;
    },
  },
});
