// The room service: on the desktop build there is no server, so the machine that hosts serves the room API
// itself, as RoomStore speaks it. /info says what room is here; /room takes one greeting (a self-signed pass
// and a proof over room:<id>:<ts>), then a `host` from this machine's own window (loopback, with the secret
// made at launch) or a `join` from anyone. The host approves every join: someone it let in stays approved
// for the room's life, until removed. Close codes follow the room API: 1008 after refused, 1000 after
// removed, ended and replaced.
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { verifySelfPass, verifyProof } from './selfPass.js';

export const PROTOCOL = 1;
const PROOF_WITHIN_MS = 60_000;
const MOST_WAITING = 5;           // asks waiting for the host's answer at once
const MAX_WATCHERS = 30;          // RoomStore's MAX_WATCHERS
const MAX_PAYLOAD = 16 * 1024;
const FINAL = { refused: 1008, removed: 1000, ended: 1000, replaced: 1000 };   // messages after which the socket is closed

export const isLoopback = (address) => /^(::ffff:)?127\.|^::1$/.test(address ?? '');
const maxOf = (n) => (Number.isInteger(n) && n >= 1 && n <= MAX_WATCHERS ? n : null);
const refused = (reason) => ({ type: 'refused', reason });

// The room as the host's greeting describes it.
const roomFrom = (r) => ({
  id: r.id,
  name: String(r.name ?? ''),
  welcome: String(r.welcome ?? ''),
  password: typeof r.password === 'string' && r.password ? r.password : null,
  max: maxOf(r.max) ?? 12,
  approved: new Set(Array.isArray(r.approved) ? r.approved.filter((sub) => typeof sub === 'string') : []),
});

// Binds the first free port from `port` up, `tries` of them.
async function listen(server, port, tries, host) {
  for (let i = 0; i < tries; i++) {
    try {
      await new Promise((resolve, reject) => {
        const done = (error) => {
          server.off('error', done).off('listening', done);
          if (error) reject(error);
          else resolve();
        };
        server.on('error', done).on('listening', done).listen(port + i, host);
      });
      return server.address().port;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }
  throw Object.assign(new Error(`No free port from ${port} to ${port + tries - 1}`), { code: 'NO_PORT' });
}

export async function createRoomService({ port = 31337, tries = 20, host = '0.0.0.0', secret, now = Date.now } = {}) {
  let room = null;              // { id, name, welcome, password, max, approved: Set, hostSub, hostName }
  const sockets = new Map();    // 'host', a peer or an ask -> its socket
  const watchers = new Map();   // peer -> { sub, pass, token }
  const waiting = new Map();    // ask -> { sub, pass }
  let artists = [];             // the subs the host holds as artists
  let made = 0;                 // peers and asks so far, for their ids

  const whoIs = (ws) => {
    for (const [who, s] of sockets) if (s === ws) return who;
    return null;
  };
  const close = (ws, code, reason) => {
    const who = whoIs(ws);
    if (who) sockets.delete(who);
    ws.close(code, reason);
  };
  const reply = (ws, msg) => {
    ws.send(JSON.stringify(msg));
    if (Object.hasOwn(FINAL, msg.type)) close(ws, FINAL[msg.type], msg.type);
  };
  const send = (to, msg) => {
    const ws = sockets.get(to);
    if (ws) reply(ws, msg);
  };
  const info = () => ({ id: room.id, name: room.name, welcome: room.welcome, max: room.max, count: watchers.size });
  const full = (sub) => watchers.size - [...watchers.values()].filter((w) => w.sub === sub).length >= room.max;

  const gone = (peer) => {
    if (!watchers.delete(peer)) return;
    send('host', { type: 'peer-gone', peer });
    const ws = sockets.get(peer);
    if (ws) close(ws, 1000, 'gone');
  };
  const withdraw = (ask) => {
    if (waiting.delete(ask)) send('host', { type: 'ask-gone', ask });
  };

  // In, as a watcher: an older socket of the same sub is replaced.
  const admit = (ws, sub, pass) => {
    if (full(sub)) return reply(ws, refused('full'));
    for (const [peer, w] of watchers) {
      if (w.sub !== sub) continue;
      send(peer, { type: 'replaced' });
      gone(peer);
    }
    const peer = `p_${++made}`, token = randomBytes(16).toString('base64url');
    watchers.set(peer, { sub, pass, token });
    sockets.set(peer, ws);
    reply(ws, { type: 'joined', id: room.id, peer, token, hostName: room.hostName, hostSub: room.hostSub, artists });
    send('host', { type: 'peer', peer, pass });
  };

  // The pass's claims, if the pass is good and the proof is its key's over room:<id>:<ts>, within a minute.
  const checked = async ({ pass, ts, proof }, id) => {
    if (typeof pass !== 'string' || typeof proof !== 'string' || typeof id !== 'string' || !id) return null;
    if (!Number.isFinite(ts) || Math.abs(now() - ts) > PROOF_WITHIN_MS) return null;
    const claims = await verifySelfPass(pass, now());
    return claims && await verifyProof(claims.key, `room:${id}:${ts}`, proof) ? claims : null;
  };

  const greeted = async (ws, msg, loopback) => {
    if (msg.protocol !== PROTOCOL) return reply(ws, { ...refused('version'), protocol: PROTOCOL });
    const hosting = msg.type === 'host';
    if (hosting && !(loopback && typeof secret === 'string' && msg.secret === secret)) return reply(ws, refused('not-host'));
    const id = hosting ? room?.id ?? msg.room?.id : msg.room;
    const claims = await checked(msg, id);
    if (ws.readyState !== ws.OPEN) return;
    if (!hosting && (!room || room.id !== id)) return reply(ws, refused('unavailable'));
    if (!claims || (room && room.id !== id)) return reply(ws, refused('bad-pass'));

    if (hosting) {
      if (!room) {
        room = roomFrom(msg.room);
        artists = [];
      }
      Object.assign(room, { hostSub: claims.sub, hostName: claims.name });
      const older = sockets.get('host');
      if (older) close(older, 1000, 'replaced');
      sockets.set('host', ws);
      reply(ws, { type: 'hosting', room: info(), peers: [...watchers].map(([peer, w]) => ({ peer, pass: w.pass })) });
      for (const [ask, { pass }] of waiting) reply(ws, { type: 'asking', ask, pass });
      if (artists.length) reply(ws, { type: 'artists-now', subs: artists });
      return;
    }

    const { sub } = claims;
    if (room.approved.has(sub)) return admit(ws, sub, msg.pass);
    if (room.password !== null && msg.password !== room.password) return reply(ws, refused('wrong-password'));
    if (full(sub)) return reply(ws, refused('full'));
    const older = [...waiting].filter(([, a]) => a.sub === sub).map(([ask]) => ask);   // the same person asking again
    if (waiting.size - older.length >= MOST_WAITING) return reply(ws, refused('busy'));
    for (const ask of older) {
      send(ask, { type: 'replaced' });
      withdraw(ask);
    }
    const ask = `a_${++made}`;
    waiting.set(ask, { sub, pass: msg.pass });
    sockets.set(ask, ws);
    reply(ws, { type: 'waiting' });
    send('host', { type: 'asking', ask, pass: msg.pass });
  };

  const end = () => {
    const everyone = [...sockets.keys()];
    room = null;
    watchers.clear();
    waiting.clear();
    artists = [];
    for (const to of everyone) send(to, { type: 'ended' });
  };

  // A message from a socket past its greeting. An ask's are ignored until it's let in.
  const heard = (who, msg) => {
    if (who !== 'host') {
      if (msg.type === 'signal-to' && watchers.has(who)) send('host', { type: 'signal-from', from: who, data: msg.data });
      return;
    }
    switch (msg.type) {
      case 'answer': {
        const asked = waiting.get(msg.ask);
        if (!asked) return;
        const ws = sockets.get(msg.ask);
        waiting.delete(msg.ask);
        sockets.delete(msg.ask);
        if (msg.yes !== true) return reply(ws, refused('turned-away'));
        room.approved.add(asked.sub);
        return admit(ws, asked.sub, asked.pass);
      }
      case 'left':
        return gone(msg.peer);
      case 'remove': {   // the watcher is told and goes, and isn't approved any more; the host isn't told it's gone
        const w = watchers.get(msg.peer);
        if (!w) return;
        watchers.delete(msg.peer);
        room.approved.delete(w.sub);
        return send(msg.peer, { type: 'removed' });
      }
      case 'settings': {
        const max = maxOf(msg.max);
        if (max) room.max = max;
        return;
      }
      case 'end':
        return end();
      case 'artists':
        if (!Array.isArray(msg.subs)) return;
        artists = msg.subs.filter((sub) => typeof sub === 'string');
        return send('host', { type: 'artists-now', subs: artists, ...(msg.tag === undefined ? {} : { tag: msg.tag }) });
      case 'signal-to':
        if (watchers.has(msg.to)) send(msg.to, { type: 'signal-from', from: 'host', data: msg.data });
    }
  };

  // /room: the first host or join is the greeting, and everything after waits for it to be checked.
  const connected = (ws, req) => {
    const loopback = isLoopback(req.socket.remoteAddress);
    let queue = null;
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const text = data.toString();
      if (text === 'ping') return ws.send('pong');
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }
      if (typeof msg?.type !== 'string') return;
      if (!queue) {
        if (msg.type === 'host' || msg.type === 'join') queue = greeted(ws, msg, loopback);
      } else {
        queue = queue.then(() => {
          const who = whoIs(ws);
          if (who) heard(who, msg);
        });
      }
      queue?.catch((error) => {
        console.error('Room service: a message failed', error);
        ws.terminate();
      });
    });
    ws.on('close', () => {
      const who = whoIs(ws);
      if (!who) return;
      sockets.delete(who);
      if (watchers.has(who)) gone(who);
      else withdraw(who);
    });
  };

  const sayInfo = (ws) => {
    ws.send(JSON.stringify({ type: 'info', protocol: PROTOCOL, id: room?.id ?? null, name: room?.name ?? null, password: !!room?.password }));
    ws.close(1000);
  };

  const server = http.createServer((req, res) => res.writeHead(404).end());
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
  server.on('upgrade', (req, socket, head) => {
    let pathname;
    try {
      ({ pathname } = new URL(req.url, 'http://localhost'));
    } catch {
      return socket.destroy();   // an address that isn't one: anyone can send it, and it mustn't stop the service
    }
    if (pathname !== '/room' && pathname !== '/info') return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('error', () => {});   // a bad frame (or one too big) closes the socket: nothing more to do
      if (pathname === '/info') sayInfo(ws);
      else connected(ws, req);
    });
  });

  return {
    port: await listen(server, port, tries, host),
    room: () => room && {
      id: room.id, name: room.name, welcome: room.welcome, password: room.password, max: room.max,
      approved: [...room.approved], count: watchers.size,
    },
    close: async () => {
      for (const ws of wss.clients) ws.terminate();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
