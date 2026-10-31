// The SOCIAL server, faked for the store tests: fetch is routed to a small fake API (by method and path,
// every request recorded), and WebSocket is a fake class the test answers for the server.
import { vi, expect } from 'vitest';
import { toBase64url, fromBase64url } from '@/social/base64url';

export const verify = async (publicKey, message, signature) => {
  const key = await crypto.subtle.importKey('raw', fromBase64url(publicKey), { name: 'Ed25519' }, false, ['verify']);
  return crypto.subtle.verify('Ed25519', key, fromBase64url(signature), new TextEncoder().encode(message));
};

export const makePass = (claims) => toBase64url(new TextEncoder().encode(JSON.stringify(claims))) + '.c2ln';
export const claimsOf = (pass) => JSON.parse(new TextDecoder().decode(fromBase64url(pass.split('.')[0])));

export const member = (fields = {}) => ({
  id: 'u_1', username: 'ansi-fan', email: 'fan@example.com', emailVerified: true, needsOnboarding: false,
  providers: ['credential'], twoFactorEnabled: false, usernameChangeableAt: null, ...fields,
});

// The server's side: `session` is who the cookie says you are; passes are minted for it (a guest renewing
// with a previous pass keeps its id and name). Routes answer [status, body].
export function fakeServer() {
  const server = { session: null, suspended: null, passTtlMs: 3_600_000, silencedUntil: null, guests: 0, requests: [] };
  const routes = {
    'GET /api/me': () => (server.suspended ? [403, { code: 'SUSPENDED', until: server.suspended.until }]
      : server.session ? [200, server.session] : [401, { code: 'SIGNED_OUT' }]),
    'GET /api/blocks': () => [200, { blocked: [] }],
    'GET /api/providers': () => [200, { providers: ['discord', 'github'] }],
    'POST /api/pass': (body) => {
      if (server.suspended) return [403, { code: 'SUSPENDED', until: server.suspended.until }];
      if (server.session?.needsOnboarding) return [409, { code: 'NEEDS_ONBOARDING' }];
      const exp = (Date.now() + server.passTtlMs) / 1000;
      const kept = body.previous ? claimsOf(body.previous) : null;
      const claims = server.session
        ? { sub: server.session.id, name: server.session.username, guest: false, verified: true, key: body.key, exp, ...(server.silencedUntil ? { silencedUntil: server.silencedUntil } : {}) }
        : { sub: kept?.sub ?? `g_${++server.guests}`, name: kept?.name ?? `quiet-amber-fox-${server.guests}`, guest: true, verified: false, key: body.key, exp };
      return [200, { pass: makePass(claims), claims }];
    },
    'POST /api/auth/sign-in/username': (body) => (body.password === 'right-password'
      ? ((server.session = member({ username: body.username })), [200, { token: 't' }])
      : [401, { code: 'INVALID_USERNAME_OR_PASSWORD' }]),
    'POST /api/auth/sign-in/email': () => ((server.session = member()), [200, { token: 't' }]),
    'POST /api/auth/sign-out': () => ((server.session = null), [200, { success: true }]),
  };
  vi.stubGlobal('fetch', async (url, init = {}) => {
    const { pathname } = new URL(url);
    const method = init.method ?? 'GET';
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    server.requests.push({ method, path: pathname, body, headers: init.headers ?? {} });
    const route = routes[`${method} ${pathname}`];
    const [status, reply] = route ? await route(body) : [404, { code: 'NOT_FOUND' }];
    return new Response(JSON.stringify(reply), { status });
  });
  server.route = (key, answer) => { routes[key] = answer; };
  server.routeOf = (key) => routes[key];
  server.sent = (method, path) => server.requests.filter((r) => r.method === method && r.path === path);
  return server;
}

// The sockets the stores made, in order, once useFakeSockets() has put the fake in WebSocket's place.
// `heard`, when a test sets it, is called with each message sent.
export const sockets = [];
class FakeSocket {
  constructor(url) {
    Object.assign(this, { url, sent: [], closed: false });
    sockets.push(this);
  }
  send(text) {
    if (text === 'ping') return this.receive('pong');   // as the server's automatic answer does
    const msg = JSON.parse(text);
    this.sent.push(msg);
    this.heard?.(msg);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.({ code: 1000 });
  }
  // The server closing it, with a reason and no message.
  serverClose(reason) {
    this.closed = true;
    this.onclose?.({ code: 1000, reason });
  }
  accept() { this.onopen?.({}); }
  receive(msg) { this.onmessage?.({ data: msg === 'pong' ? msg : JSON.stringify(msg) }); }
}

export function useFakeSockets() {
  sockets.length = 0;
  vi.stubGlobal('WebSocket', FakeSocket);
}

// Accepts the socket, waits for its hello, answers with a state: the lobby is live. Returns the hello.
export async function goLive(socket, state = { rooms: [], people: [] }) {
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('hello'));
  socket.receive({ type: 'state', ...state });
  return socket.sent[0];
}

// A dropped socket is replaced after the connection's first backoff, 1 s.
export const lastSocket = async (count) => {
  await vi.waitFor(() => expect(sockets).toHaveLength(count), { timeout: 3000 });
  return sockets[count - 1];
};

// The page's location, with the test's query: start() reads it; replaceState is spied (not run, so the
// test page's own URL stays) to see what it would leave.
export const at = (query) => new URL(`${window.location.origin}${window.location.pathname}${query}`);
