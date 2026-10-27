// The SOCIAL server, faked for the end-to-end flows: its API (page.route) and the lobby's socket
// (page.routeWebSocket), with every request and lobby message recorded. The preview build runs on
// localhost, so the app talks to http://localhost:8787.
const API = 'http://localhost:8787';

// A pass as the server makes one: base64url JSON claims, a dot, a signature (the app only reads the claims).
export const makePass = (claims) => Buffer.from(JSON.stringify(claims)).toString('base64url') + '.c2ln';

// /api/me's body for a signed-in member.
export const member = (fields = {}) => ({
  id: 'u_1', username: 'ansi-fan', name: 'ansi-fan', email: 'fan@example.com', emailVerified: true, needsOnboarding: false,
  providers: ['credential'], twoFactorEnabled: false, usernameChangeableAt: null, ...fields,
});

// fakeServer(page, { me, rooms, people, blocked, signal, twoFactor, 'POST /api/...': (body) => [status, reply] }).
// `me` null is signed out (a guest's pass). With `twoFactor`, an email or username sign-in answers the
// challenge, and only verify-totp ('123456') or verify-backup-code ('abcde-fghij') signs in, as a member with
// two-factor on; server.trustDevice is what the last good one was sent. The lobby's state lists `people` and you (from the hello's pass, as
// the real server does), with `signal` as the account's signal; a signal sent sets it. Routes answer [status, body]; server.route(key, answer) changes one
// later. server.requests has every API call ({ method, path, body }); server.lobby.received every
// message the app sent on the lobby socket; server.lobby.send(msg) pushes one, drop() closes it (both
// throw until the app has connected: the SOCIAL tab shown, and again after a drop). With
// server.lobby.refusing set, a hello is answered refused.
export async function fakeServer(page, { me = null, rooms = [], people = [], blocked = [], signal = null, twoFactor = false, ...overrides } = {}) {
  let socket = null;
  const connected = () => {
    if (!socket) throw new Error('The lobby is not connected: show the SOCIAL tab and wait for its hello first');
    return socket;
  };
  const server = {
    me, rooms, people, blocked, signal, trustDevice: null, requests: [],
    lobby: {
      received: [],
      refusing: false,
      send: (msg) => connected().send(JSON.stringify(msg)),
      drop: () => {
        connected().close();
        socket = null;
      },
    },
    route: (key, answer) => { routes[key] = answer; },
    sent: (method, path) => server.requests.filter((r) => r.method === method && r.path === path),
  };
  const signIn = () => {
    if (twoFactor) return [200, { twoFactorRedirect: true, twoFactorMethods: ['totp'] }];
    server.me = member();
    return [200, { redirect: false }];
  };
  const verifyCode = (right, wrong) => ({ code, trustDevice }) => {
    if (code !== right) return [401, { code: wrong }];
    server.me = member({ twoFactorEnabled: true });
    server.trustDevice = trustDevice;
    return [200, { token: 't' }];
  };
  const routes = {
    'GET /api/me': () => (server.me ? [200, server.me] : [401, { code: 'SIGNED_OUT' }]),
    'POST /api/pass': (body) => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const claims = server.me
        ? { sub: server.me.id, name: server.me.username, guest: false, verified: server.me.emailVerified, key: body.key, exp }
        : { sub: 'g_1', name: 'quiet-amber-fox', guest: true, verified: false, key: body.key, exp };
      return [200, { pass: makePass(claims), claims }];
    },
    'GET /api/auth/list-accounts': () => [200, (server.me?.providers ?? []).map((providerId, i) => ({ id: `a_${i}`, providerId }))],
    'GET /api/blocks': () => [200, { blocked: server.blocked }],
    'DELETE /api/blocks/:username': (body, path) => {
      const name = decodeURIComponent(path.split('/').pop());
      server.blocked = server.blocked.filter((b) => b.username !== name);
      return [200, { ok: true }];
    },
    'PATCH /api/me/username': ({ username }) => {
      server.me = { ...server.me, username, name: username };
      return [200, server.me];
    },
    // Linking sends you to the provider; unlinking takes the account's id from list-accounts (a_<index>).
    'POST /api/auth/link-social': ({ provider }) => [200, { url: `https://${provider}.example/link`, redirect: true }],
    'POST /api/auth/unlink-account': ({ accountId }) => {
      const gone = server.me.providers[Number(accountId.slice(2))];
      server.me = { ...server.me, providers: server.me.providers.filter((p) => p !== gone) };
      return [200, { status: true }];
    },
    'POST /api/auth/delete-user': () => { server.me = null; return [200, { success: true }]; },
    // Signing in or up makes you the member (or, with two-factor, asks for the code); Discord and GitHub send you off to the provider.
    'POST /api/auth/sign-in/email': signIn,
    'POST /api/auth/sign-in/username': signIn,
    'POST /api/auth/two-factor/verify-totp': verifyCode('123456', 'INVALID_CODE'),
    'POST /api/auth/two-factor/verify-backup-code': verifyCode('abcde-fghij', 'INVALID_BACKUP_CODE'),
    'POST /api/auth/sign-up/email': ({ username, email }) => {
      server.me = member({ username, name: username, email, emailVerified: false });
      return [200, { token: null }];
    },
    'POST /api/auth/sign-in/social': ({ provider }) => [200, { url: `https://${provider}.example/authorize`, redirect: true }],
    'POST /api/auth/sign-out': () => { server.me = null; return [200, { success: true }]; },
    'POST /api/auth/request-password-reset': () => [200, { status: true }],
    'POST /api/auth/reset-password': () => { server.me = null; return [200, { status: true }]; },
    'POST /api/me/onboarding': ({ username }) => {
      server.me = { ...server.me, username, name: username, needsOnboarding: false };
      return [200, server.me];
    },
    ...overrides,
  };

  await page.route(`${API}/api/**`, async (route) => {
    const request = route.request();
    const cors = {
      'access-control-allow-origin': request.headers().origin ?? '*',
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE',
      'access-control-allow-headers': 'content-type, x-turnstile-token',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const { pathname } = new URL(request.url());
    const body = request.postData() ? request.postDataJSON() : undefined;
    server.requests.push({ method: request.method(), path: pathname, body });
    const key = `${request.method()} ${pathname}`;
    const answer = routes[key] ?? routes[key.replace(/\/[^/]+$/, '/:username')];   // DELETE /api/blocks/<name>
    const [status, reply] = answer ? await answer(body, pathname) : [404, { code: 'NOT_FOUND' }];
    return route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(reply) });
  });

  await page.routeWebSocket(`${API.replace(/^http/, 'ws')}/api/lobby`, (ws) => {
    socket = ws;
    ws.onMessage((message) => {
      if (message === 'ping') return ws.send('pong');   // the server's automatic answer
      const msg = JSON.parse(message);
      server.lobby.received.push(msg);
      if (msg.type === 'signal') server.signal = msg.signal;
      if (msg.type !== 'hello') return;
      if (server.lobby.refusing) return ws.send(JSON.stringify({ type: 'refused', code: 'bad-pass' }));
      const { sub, name, guest } = JSON.parse(Buffer.from(msg.pass.split('.')[0], 'base64url'));
      const you = sub ? [{ sub, name, guest, signal: guest ? null : server.signal }] : [];
      ws.send(JSON.stringify({ type: 'state', rooms: server.rooms, people: [...you, ...server.people] }));
    });
  });

  return server;
}
