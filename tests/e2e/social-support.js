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

// fakeServer(page, { me, rooms, people, 'POST /api/...': (body) => [status, reply] }). `me` null is
// signed out (a guest's pass). Routes answer [status, body]; server.route(key, answer) changes one
// later. server.requests has every API call ({ method, path, body }); server.lobby.received every
// message the app sent on the lobby socket; server.lobby.send(msg) pushes one, drop() closes it (both
// throw until the app has connected: the SOCIAL tab shown, and again after a drop).
export async function fakeServer(page, { me = null, rooms = [], people = [], ...overrides } = {}) {
  let socket = null;
  const connected = () => {
    if (!socket) throw new Error('The lobby is not connected: show the SOCIAL tab and wait for its hello first');
    return socket;
  };
  const server = {
    me, rooms, people, requests: [],
    lobby: {
      received: [],
      send: (msg) => connected().send(JSON.stringify(msg)),
      drop: () => {
        connected().close();
        socket = null;
      },
    },
    route: (key, answer) => { routes[key] = answer; },
    sent: (method, path) => server.requests.filter((r) => r.method === method && r.path === path),
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
    'GET /api/blocks': () => [200, { blocked: [] }],
    // Signing in or up makes you the member; Discord and GitHub send you off to the provider.
    'POST /api/auth/sign-in/email': () => { server.me = member(); return [200, { redirect: false }]; },
    'POST /api/auth/sign-in/username': () => { server.me = member(); return [200, { redirect: false }]; },
    'POST /api/auth/sign-up/email': ({ username, email }) => {
      server.me = member({ username, name: username, email, emailVerified: false });
      return [200, { token: null }];
    },
    'POST /api/auth/sign-in/social': ({ provider }) => [200, { url: `https://${provider}.example/authorize`, redirect: true }],
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
    const answer = routes[`${request.method()} ${pathname}`];
    const [status, reply] = answer ? await answer(body) : [404, { code: 'NOT_FOUND' }];
    return route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(reply) });
  });

  await page.routeWebSocket(`${API.replace(/^http/, 'ws')}/api/lobby`, (ws) => {
    socket = ws;
    ws.onMessage((message) => {
      const msg = JSON.parse(message);
      server.lobby.received.push(msg);
      if (msg.type === 'hello') ws.send(JSON.stringify({ type: 'state', rooms: server.rooms, people: server.people }));
    });
  });

  return server;
}
