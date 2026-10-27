// The SOCIAL server, faked for the end-to-end flows: its API (page.route), the lobby's socket
// (page.routeWebSocket) and a room's (fakeRoom), with every request and message recorded. The preview
// build runs on localhost, so the app talks to http://localhost:8787.
import { generateKeyPairSync, sign } from 'node:crypto';

const API = 'http://localhost:8787';
export const ROOM_ID = 'abcdefghij';

// A pass as the server makes one: base64url JSON claims, a dot, base64url Ed25519 signature over the
// first part, by a key made once here (GET /api/pass-key answers its public half, so hosts can check).
const PASS_KEY = generateKeyPairSync('ed25519');
export const passKey = PASS_KEY.publicKey.export({ format: 'jwk' }).x;
export const makePass = (claims) => {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${sign(null, Buffer.from(body), PASS_KEY.privateKey).toString('base64url')}`;
};
const claimsOf = (pass) => JSON.parse(Buffer.from(pass.split('.')[0], 'base64url'));

// /api/me's body for a signed-in member.
export const member = (fields = {}) => ({
  id: 'u_1', username: 'ansi-fan', name: 'ansi-fan', email: 'fan@example.com', emailVerified: true, needsOnboarding: false,
  providers: ['credential'], twoFactorEnabled: false, usernameChangeableAt: null, ...fields,
});

const totpURI = (n) => `otpauth://totp/Phosphor:ansi-fan?secret=JBSWY3DPEHPK3PX${'PQRSTUVW'[n]}&issuer=Phosphor`;
const codes = (word) => Array.from({ length: 10 }, (_, i) => `${word}-code${i}`);

// fakeServer(page, { me, rooms, people, blocked, signal, twoFactor, room, 'POST /api/...': (body) => [status, reply] }).
// `me` null is signed out (a guest's pass). With `twoFactor`, an email or username sign-in answers the
// challenge, and only verify-totp ('123456') or verify-backup-code ('abcde-fghij') signs in, as a member with
// two-factor on; server.trustDevice is what the last good one was sent. Signed in, verify-totp ('123456') confirms two-factor
// instead, and enable, disable and generate-backup-codes answer 10 codes, and enable a secret (`JBSWY3DPEHPK3PXP`, then `...PXQ` and so on: a new one each time). The lobby's state lists `people` and you (from the hello's pass, as
// the real server does), with `signal` as the account's signal; a signal sent sets it. Routes answer [status, body]; server.route(key, answer) changes one
// later. server.requests has every API call ({ method, path, body }); server.lobby.received every
// message the app sent on the lobby socket; server.lobby.send(msg) pushes one, drop() closes it (both
// throw until the app has connected: the SOCIAL tab shown, and again after a drop). With
// server.lobby.refusing set, a hello is answered refused. POST /api/rooms makes room ROOM_ID; given a
// fakeRoom as `room`, the page's room sockets go to it, and the room is the one the POST describes.
export async function fakeServer(page, { me = null, rooms = [], people = [], blocked = [], signal = null, twoFactor = false, room, ...overrides } = {}) {
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
  let enabled = 0;   // how many secrets enable has made
  const signIn = () => {
    if (twoFactor) return [200, { twoFactorRedirect: true, twoFactorMethods: ['totp'] }];
    server.me = member();
    return [200, { redirect: false }];
  };
  const verifyCode = (right, wrong) => ({ code, trustDevice }) => {
    if (code !== right) return [401, { code: wrong }];
    if (server.me) {   // signed in already: this confirms setting two-factor up
      server.me = { ...server.me, twoFactorEnabled: true };
      return [200, { token: 't' }];
    }
    server.me = member({ twoFactorEnabled: true });
    server.trustDevice = trustDevice;
    return [200, { token: 't' }];
  };
  const routes = {
    'GET /api/me': () => (server.me ? [200, server.me] : [401, { code: 'SIGNED_OUT' }]),
    'GET /api/pass-key': () => [200, { key: passKey }],
    'POST /api/rooms': (body, path, request) => {
      room?.made(body);
      return [200, { id: ROOM_ID, link: `${request.headers().origin}/?room=${ROOM_ID}` }];
    },
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
    // Turning it on: enable answers the secret and 10 codes, and '123456' confirms it; disable clears it.
    'POST /api/auth/two-factor/enable': () => [200, { totpURI: totpURI(enabled++), backupCodes: codes('first') }],
    'POST /api/auth/two-factor/disable': () => {
      server.me = { ...server.me, twoFactorEnabled: false };
      return [200, { status: true }];
    },
    'POST /api/auth/two-factor/generate-backup-codes': () => [200, { backupCodes: codes('fresh') }],
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
    const [status, reply] = answer ? await answer(body, pathname, request) : [404, { code: 'NOT_FOUND' }];
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
      const { sub, name, guest } = claimsOf(msg.pass);
      const you = sub ? [{ sub, name, guest, signal: guest ? null : server.signal }] : [];
      ws.send(JSON.stringify({ type: 'state', rooms: server.rooms, people: [...you, ...server.people] }));
    });
  });

  await room?.attach(page);
  return server;
}

// A Room (as the server's API describes it), one for every page attached to it, so a host's page and its watchers'
// meet in it: fakeRoom({ password, allowGuests, max, full }). The host's `host` is answered `hosting`
// (and makes it the host's room; an earlier host socket is closed), a `join` `joined`, or its refusal:
// wrong-password for a private room (one with a password), signed-in-only for a guest when allowGuests
// is false, full at max watchers or with `full`. Signals are relayed between the host and its watchers;
// the host hears of each watcher (peer, peer-gone). Settings change the room as the Room's checks allow,
// at most once a second per host socket: a sooner one is answered `settings-now`. End sends ended to
// everyone. Sockets are closed where the Room closes them: after refused (1008), ended or removed (1000),
// and a watcher's once the host hears it's gone. room.received has every message as { from: 'host' |
// <peer> | null, msg }, room.from(who) the messages of one; room.send(who, msg) pushes one, room.info()
// is the room as the host is told it, and room.drop(who) closes a socket.
const SETTINGS_EVERY_MS = 1000;
const SIGNALS = ['feedback', 'chat', 'heads-down', null];
const FINAL = { refused: 1008, removed: 1000, ended: 1000 };   // messages after which the socket is closed

export function fakeRoom({ password = null, allowGuests = true, max = 12, full = false } = {}) {
  const sockets = new Map();    // 'host' or a peer id -> its socket
  const watchers = new Map();   // peer -> { sub, guest, pass }
  let peers = 0, ended = false, settingsAt = null;   // settingsAt: the host socket's last settings taken
  const close = (ws, code, reason) => {
    for (const [who, s] of sockets) if (s === ws) sockets.delete(who);
    ws.close({ code, reason });
  };
  const reply = (ws, msg) => {
    ws.send(JSON.stringify(msg));
    if (Object.hasOwn(FINAL, msg.type)) close(ws, FINAL[msg.type], msg.type);
  };
  const send = (to, msg) => {
    const ws = sockets.get(to);
    if (ws) reply(ws, msg);
  };
  const info = () => ({ ...room.setup, password: undefined, count: watchers.size });   // undefined isn't sent
  const gone = (peer) => {
    if (!watchers.delete(peer)) return;
    send('host', { type: 'peer-gone', peer });
    const ws = sockets.get(peer);
    if (ws) close(ws, 1000, 'gone');
  };
  const settings = (msg) => {
    if (settingsAt !== null && Date.now() - settingsAt < SETTINGS_EVERY_MS) return send('host', { type: 'settings-now', room: info() });
    settingsAt = Date.now();
    if (typeof msg.allowGuests === 'boolean') room.setup.allowGuests = msg.allowGuests;
    if (Number.isInteger(msg.max) && msg.max >= 1 && msg.max <= 24) room.setup.max = msg.max;
    if (SIGNALS.includes(msg.signal)) room.setup.signal = msg.signal;
  };

  // A message from a socket that is `who` so far: what it is after it.
  const heard = (ws, who, msg) => {
    if (msg.type === 'host' && !who) {
      const claims = claimsOf(msg.pass);
      if (ended || (room.setup.hostSub && claims.sub !== room.setup.hostSub)) return reply(ws, { type: 'refused', reason: ended ? 'unavailable' : 'bad-pass' });
      Object.assign(room.setup, { hostSub: claims.sub, hostName: claims.name });
      const older = sockets.get('host');
      if (older) close(older, 1000, 'replaced');
      sockets.set('host', ws);
      settingsAt = null;
      reply(ws, { type: 'hosting', room: info(), peers: [...watchers].map(([peer, w]) => ({ peer, pass: w.pass })) });
      return 'host';
    }
    if (msg.type === 'join' && !who) {
      const claims = claimsOf(msg.pass);
      const reason = ended ? 'unavailable'
        : claims.guest && !room.setup.allowGuests ? 'signed-in-only'
          : room.setup.password !== null && msg.password !== room.setup.password ? 'wrong-password'
            : full || watchers.size >= room.setup.max ? 'full' : null;
      if (reason) return reply(ws, { type: 'refused', reason });
      const peer = `p_${++peers}`;
      watchers.set(peer, { sub: claims.sub, guest: claims.guest, pass: msg.pass });
      sockets.set(peer, ws);
      reply(ws, { type: 'joined', peer, hostName: room.setup.hostName });
      send('host', { type: 'peer', peer, pass: msg.pass });
      return peer;
    }
    if (msg.type === 'signal-to' && who === 'host') send(msg.to, { type: 'signal-from', from: 'host', data: msg.data });
    else if (msg.type === 'signal-to' && who) send('host', { type: 'signal-from', from: who, data: msg.data });
    else if (msg.type === 'left' && who === 'host') gone(msg.peer);
    else if (msg.type === 'settings' && who === 'host') settings(msg);
    else if (msg.type === 'end' && who === 'host') {
      ended = true;
      const everyone = ['host', ...watchers.keys()];
      watchers.clear();
      for (const to of everyone) send(to, { type: 'ended' });
    }
    return who;
  };

  const room = {
    setup: { id: ROOM_ID, name: 'a room', hostSub: null, hostName: null, public: password === null, password, allowGuests, max, signal: null, liveSince: Date.now() },
    received: [],
    from: (who) => room.received.filter((r) => r.from === who).map((r) => r.msg),
    info,
    send: (who, msg) => {
      if (!sockets.has(who)) throw new Error(`No socket for ${who} in the room`);
      send(who, msg);
    },
    // POST /api/rooms: the room as the host described it.
    made: ({ name, public: isPublic, allowGuests, max, signal, password }) => {
      Object.assign(room.setup, { name, public: isPublic, allowGuests, max, signal, password: password ?? null, liveSince: Date.now() });
    },
    drop: (who) => {
      const ws = sockets.get(who);
      if (!ws) throw new Error(`No socket for ${who} in the room`);
      close(ws);
      if (who !== 'host') gone(who);
    },
    attach: (page) => page.routeWebSocket(`${API.replace(/^http/, 'ws')}/api/rooms/*/ws`, (ws) => {
      let who = null;
      ws.onMessage((message) => {
        if (message === 'ping') return ws.send('pong');   // the Room's automatic answer
        const msg = JSON.parse(message);
        const before = who;
        who = heard(ws, who, msg);
        room.received.push({ from: who ?? before, msg });
      });
      ws.onClose((code, reason) => {
        ws.close({ code, reason });   // with a handler, the closing is ours to finish
        if (sockets.get(who) !== ws) return;
        sockets.delete(who);
        if (who !== 'host') gone(who);
      });
    }),
  };
  return room;
}
