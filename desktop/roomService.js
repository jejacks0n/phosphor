// The room service: on the desktop build there is no server, so the machine that hosts serves the room API
// itself, as RoomStore speaks it. /info says what room is here; /room takes one greeting (a self-signed pass
// and a proof over room:<id>:<ts>), then a `host` from this machine's own window (loopback, with the secret
// made at launch) or a `join` from anyone. The host approves every join: someone it let in stays approved
// for the room's life, until removed. Close codes follow the room API: 1008 after refused, 1000 after
// removed, ended and replaced.
//
// /channel stands in for a WebRTC data channel: a guest's socket (with the token `joined` gave it) and the host's
// for that guest (loopback, with the secret) are piped together, frames kept as they came, and a guest that falls
// behind stops the service reading the host's side, so the host's own bufferedAmount grows. /probe says whose
// service this is; an artist's addresses are probed so the host knows where they could host next. A hand-over
// names the new host with those addresses and ends the room here: the service goes back to standby, where it
// answers only /probe and /info.
import http from 'node:http';
import { Buffer } from 'node:buffer';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { verifySelfPass, verifyProof } from './selfPass.js';

export const PROTOCOL = 1;
const PROOF_WITHIN_MS = 60_000;
const MOST_WAITING = 5;           // asks waiting for the host's answer at once
const MAX_WATCHERS = 30;          // RoomStore's MAX_WATCHERS
const MAX_PAYLOAD = 16 * 1024;
const MAX_CHANNEL_PAYLOAD = 128 * 1024;
const BACKED_UP_BYTES = 1024 * 1024;   // a channel's other side further behind than this stops its reading
const BACKED_UP_EVERY_MS = 20;
const MOST_UNGREETED = 32;        // /room sockets open without a greeting yet
const MOST_ADDRESSES = 8;
const PROBE_WITHIN_MS = 3000;
const PROBE_EVERY_MS = 10_000;     // a person's addresses are probed at most this often
// An IPv4 address and port, as reachableAddresses gives them: no names for the host to look up.
const isAddress = (a) => {
  const m = typeof a === 'string' && /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/.exec(a);
  return !!m && m.slice(1, 5).every((n) => Number(n) <= 255) && Number(m[5]) >= 1 && Number(m[5]) <= 65535;
};
const FINAL = { refused: 1008, removed: 1000, ended: 1000, replaced: 1000 };   // messages after which the socket is closed

export const isLoopback = (address) => /^(::ffff:)?127\.|^::1$/.test(address ?? '');
const maxOf = (n) => (Number.isInteger(n) && n >= 1 && n <= MAX_WATCHERS ? n : null);
const refused = (reason) => ({ type: 'refused', reason });
const same = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
};

// Whose room service is at this address (`host:port`): the sub its probe answers with this nonce, or null. It never
// rejects.
export function probeAddress(address, withinMs = PROBE_WITHIN_MS) {
  const nonce = randomBytes(12).toString('base64url');
  return new Promise((resolve) => {
    let ws;
    try {
      ws = new WebSocket(`ws://${address}/probe?nonce=${nonce}`, { maxPayload: 1024, handshakeTimeout: withinMs });
    } catch {
      return resolve(null);   // not an address a socket can open
    }
    const timer = setTimeout(() => done(null), withinMs);
    const done = (sub) => {
      clearTimeout(timer);
      ws.terminate();
      resolve(sub);
    };
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch { /* not a probe's answer */ }
      done(msg?.type === 'probe' && msg.nonce === nonce && typeof msg.sub === 'string' ? msg.sub : null);
    });
    ws.on('error', () => done(null));
    ws.on('close', () => done(null));
  });
}

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

export async function createRoomService({
  port = 31337, tries = 20, host = '0.0.0.0', mode = 'host', owner = {}, secret, now = Date.now, probe = probeAddress,
  greetWithinMs = 10_000, pairWithinMs = 20_000, probeEveryMs = PROBE_EVERY_MS,
} = {}) {
  let room = null;              // { id, name, welcome, password, max, approved: Set, hostSub, hostName }
  const sockets = new Map();    // 'host', a peer or an ask -> its socket
  const watchers = new Map();   // peer -> { sub, name, pass, token }
  const waiting = new Map();    // ask -> { sub, name, pass }
  let artists = [];             // the subs the host holds as artists
  const hostable = new Map();   // sub -> the addresses their own service answered at
  const probedAt = new Map();   // sub -> when its addresses were last probed
  const channels = new Map();   // peer -> { host, guest }: its channel's sockets, one side maybe still to come
  let made = 0;                 // peers and asks so far, for their ids
  let ungreeted = 0;            // /room sockets with no greeting yet

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
    const w = watchers.get(peer);
    if (!w) return;
    watchers.delete(peer);
    hostable.delete(w.sub);
    dropChannel(peer);
    send('host', { type: 'peer-gone', peer });
    const ws = sockets.get(peer);
    if (ws) close(ws, 1000, 'gone');
  };
  const withdraw = (ask) => {
    if (waiting.delete(ask)) send('host', { type: 'ask-gone', ask });
  };

  // A channel's sockets close, and it goes.
  const shut = (ws, code, reason) => {
    ws.resume();   // a paused socket couldn't hear the close's answer
    ws.close(code, reason);
  };
  const dropChannel = (peer, code = 1000, reason = 'gone') => {
    const pair = channels.get(peer);
    if (!pair) return;
    channels.delete(peer);
    clearTimeout(pair.timer);
    for (const ws of [pair.host, pair.guest]) if (ws) shut(ws, code, reason);
  };

  const artistsNow = (tag) => ({ type: 'artists-now', subs: artists, hostable: Object.fromEntries(hostable), ...(tag === undefined ? {} : { tag }) });

  // In, as a watcher: an older socket of the same sub is replaced.
  const admit = (ws, { sub, name, pass }) => {
    if (full(sub)) return reply(ws, refused('full'));
    const where = hostable.get(sub);   // the same person on a new socket hasn't left
    for (const [peer, w] of watchers) {
      if (w.sub !== sub) continue;
      send(peer, { type: 'replaced' });
      gone(peer);
    }
    if (where) hostable.set(sub, where);
    const peer = `p_${++made}`, token = randomBytes(16).toString('base64url');
    watchers.set(peer, { sub, name, pass, token });
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
    if (hosting && !(loopback && same(msg.secret, secret))) return reply(ws, refused('not-host'));
    const id = hosting ? room?.id ?? msg.room?.id : msg.room;
    const claims = await checked(msg, id);
    if (ws.readyState !== ws.OPEN) return;
    if (mode !== 'host') return reply(ws, refused('unavailable'));   // handed over, or set to standby, meanwhile
    if (!hosting && (!room || room.id !== id)) return reply(ws, refused('unavailable'));
    if (!claims || (room && room.id !== id)) return reply(ws, refused('bad-pass'));

    if (hosting) {
      if (!room) {   // made here; one handed over from another computer brings its artists, the old host among them
        room = roomFrom(msg.room);
        artists = Array.isArray(msg.room?.artists) ? msg.room.artists.filter((sub) => typeof sub === 'string' && sub !== claims.sub) : [];
        hostable.clear();
      }
      Object.assign(room, { hostSub: claims.sub, hostName: claims.name });
      const older = sockets.get('host');
      if (older) close(older, 1000, 'replaced');
      sockets.set('host', ws);
      reply(ws, { type: 'hosting', room: info(), peers: [...watchers].map(([peer, w]) => ({ peer, pass: w.pass })) });
      for (const [ask, { pass }] of waiting) reply(ws, { type: 'asking', ask, pass });
      if (artists.length) reply(ws, artistsNow());
      return;
    }

    const { sub } = claims, who = { sub, name: String(claims.name ?? ''), pass: msg.pass };
    if (room.approved.has(sub)) return admit(ws, who);
    if (room.password !== null && msg.password !== room.password) return reply(ws, refused('wrong-password'));
    if (full(sub)) return reply(ws, refused('full'));
    const older = [...waiting].filter(([, a]) => a.sub === sub).map(([ask]) => ask);   // the same person asking again
    if (waiting.size - older.length >= MOST_WAITING) return reply(ws, refused('busy'));
    for (const ask of older) {
      send(ask, { type: 'replaced' });
      withdraw(ask);
    }
    const ask = `a_${++made}`;
    waiting.set(ask, who);
    sockets.set(ask, ws);
    reply(ws, { type: 'waiting' });
    send('host', { type: 'asking', ask, pass: msg.pass });
  };

  const clear = () => {
    room = null;
    watchers.clear();
    waiting.clear();
    artists = [];
    hostable.clear();
    for (const peer of [...channels.keys()]) dropChannel(peer, 1000, 'ended');
  };

  const end = () => {
    const everyone = [...sockets.keys()];
    clear();
    for (const to of everyone) send(to, { type: 'ended' });
  };

  // The room moves to an artist who's here and whose own service answered: everyone hears who and where, those
  // still asking hear it moved, every socket closes, and this service goes back to standby.
  const handOver = (to) => {
    const w = [...watchers.values()].find((watcher) => watcher.sub === to);
    if (!w || !artists.includes(to) || !hostable.get(to)?.length) return;
    const said = JSON.stringify({ type: 'new-host', name: w.name, sub: to, planned: true, addresses: hostable.get(to) });
    for (const ask of [...waiting.keys()]) send(ask, refused('moved'));
    const everyone = [...sockets.values()];
    sockets.clear();
    clear();
    mode = 'standby';
    for (const ws of everyone) {
      ws.send(said);
      ws.close(1000, 'new-host');
    }
  };

  // An artist's addresses, kept if their own service answers there as them. The host hears it unasked.
  const probeFor = async (sub, list) => {
    if (!Array.isArray(list) || Date.now() - (probedAt.get(sub) ?? -Infinity) < probeEveryMs) return;   // a list sent sooner is dropped
    const tried = list.slice(0, MOST_ADDRESSES).filter(isAddress);
    const at = room;
    probedAt.set(sub, Date.now());
    const answers = await Promise.all(tried.map((a) => probe(a).catch(() => null)));
    if (room !== at) return;
    const kept = tried.filter((a, i) => answers[i] === sub);
    if (kept.length) hostable.set(sub, kept);
    else hostable.delete(sub);
    send('host', artistsNow());
  };

  // A message from a socket past its greeting. An ask's are ignored until it's let in.
  const heard = (who, msg) => {
    if (who !== 'host') {
      const w = watchers.get(who);
      if (msg.type === 'signal-to' && w) send('host', { type: 'signal-from', from: who, data: msg.data });
      if (msg.type === 'addresses' && w) void probeFor(w.sub, msg.list);
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
        return admit(ws, asked);
      }
      case 'left':
        return gone(msg.peer);
      case 'remove': {   // the watcher is told and goes, and isn't approved any more; the host isn't told it's gone
        const w = watchers.get(msg.peer);
        if (!w) return;
        watchers.delete(msg.peer);
        hostable.delete(w.sub);
        dropChannel(msg.peer);
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
      case 'hand-over':
        return handOver(msg.to);
      case 'artists':
        if (!Array.isArray(msg.subs)) return;
        artists = msg.subs.filter((sub) => typeof sub === 'string');
        return send('host', artistsNow(msg.tag));
      case 'signal-to':
        if (watchers.has(msg.to)) send(msg.to, { type: 'signal-from', from: 'host', data: msg.data });
    }
  };

  // /room: the first host or join is the greeting, and everything after waits for it to be checked.
  // A socket that hasn't greeted within greetWithinMs is closed.
  const connected = (ws, req) => {
    const loopback = isLoopback(req.socket.remoteAddress);
    let queue = null, counted = true;
    ungreeted++;
    const timer = setTimeout(() => {
      greetedOrGone();
      ws.close(1008, 'greeting');
    }, greetWithinMs);
    const greetedOrGone = () => {
      if (!counted) return;
      counted = false;
      ungreeted--;
      clearTimeout(timer);
    };
    ws.on('message', (data, isBinary) => {
      if (isBinary || ws.readyState !== WebSocket.OPEN) return;
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
        if (msg.type !== 'host' && msg.type !== 'join') return;
        greetedOrGone();
        queue = greeted(ws, msg, loopback);
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
      greetedOrGone();
      const who = whoIs(ws);
      if (!who) return;
      sockets.delete(who);
      if (watchers.has(who)) gone(who);
      else withdraw(who);
    });
  };

  // /channel: the host's side (loopback, with the secret) or the guest's (with its token), for a peer who's here.
  // A newer host side takes the channel's place; a second guest side is turned away. Until both sides are in,
  // the one there isn't read (what it sends waits), and is closed if the other doesn't come within pairWithinMs.
  const channelOpened = (ws, req, query) => {
    const peer = query.get('peer'), w = watchers.get(peer);
    const side = query.has('secret') ? 'host' : 'guest', other = side === 'host' ? 'guest' : 'host';
    const allowed = side === 'host' ? isLoopback(req.socket.remoteAddress) && same(query.get('secret'), secret) : same(query.get('token'), w?.token);
    if (!w || !allowed) return ws.close(1008, 'refused');
    let pair = channels.get(peer);
    if (pair?.[side]) {
      if (side === 'guest') return ws.close(1008, 'taken');
      dropChannel(peer, 1000, 'replaced');
      pair = null;
    }
    if (!pair) channels.set(peer, pair = { host: null, guest: null, timer: null });
    pair[side] = ws;
    if (pair[other]) {
      clearTimeout(pair.timer);
      pair[other].resume();
    } else {
      ws.pause();
      pair.timer = setTimeout(() => {
        if (channels.get(peer) === pair && !pair[other]) dropChannel(peer, 1008, 'unpaired');
      }, pairWithinMs);
    }

    ws.on('message', (data, isBinary) => {
      const to = channels.get(peer) === pair ? pair[other] : null;
      if (to?.readyState !== WebSocket.OPEN) return;
      to.send(data, { binary: isBinary });
      if (to.bufferedAmount <= BACKED_UP_BYTES || ws.isPaused) return;
      ws.pause();
      const backedUp = setInterval(() => {
        if (to.readyState === WebSocket.OPEN && to.bufferedAmount > BACKED_UP_BYTES) return;
        clearInterval(backedUp);
        ws.resume();
      }, BACKED_UP_EVERY_MS);
    });
    ws.on('close', () => {
      if (channels.get(peer) === pair && pair[side] === ws) dropChannel(peer);
    });
  };

  const sayProbe = (ws, nonce) => {
    ws.send(JSON.stringify({ type: 'probe', nonce, sub: owner.sub ?? null }));
    ws.close(1000);
  };

  const sayInfo = (ws) => {
    ws.send(JSON.stringify({ type: 'info', protocol: PROTOCOL, id: room?.id ?? null, name: room?.name ?? null, password: !!room?.password }));
    ws.close(1000);
  };

  const server = http.createServer((req, res) => res.writeHead(404).end());
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
  const channelWss = new WebSocketServer({ noServer: true, maxPayload: MAX_CHANNEL_PAYLOAD });
  server.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return socket.destroy();   // an address that isn't one: anyone can send it, and it mustn't stop the service
    }
    const { pathname, searchParams } = url, nonce = searchParams.get('nonce');
    const served = pathname === '/info' || (pathname === '/probe' && nonce)
      || (mode === 'host' && (pathname === '/channel' || (pathname === '/room' && ungreeted < MOST_UNGREETED)));
    if (!served) return socket.destroy();
    (pathname === '/channel' ? channelWss : wss).handleUpgrade(req, socket, head, (ws) => {
      ws.on('error', () => {});   // a bad frame (or one too big) closes the socket: nothing more to do
      if (pathname === '/info') sayInfo(ws);
      else if (pathname === '/probe') sayProbe(ws, nonce);
      else if (pathname === '/channel') channelOpened(ws, req, searchParams);
      else connected(ws, req);
    });
  });

  return {
    port: await listen(server, port, tries, host),
    mode: () => mode,
    // Standby (from hosting) ends the room here.
    set: (changes) => {
      if (changes.owner) owner = changes.owner;
      if (changes.mode !== 'host' && changes.mode !== 'standby') return;
      if (changes.mode === 'standby' && room) end();
      mode = changes.mode;
    },
    room: () => room && {
      id: room.id, name: room.name, welcome: room.welcome, password: room.password, max: room.max,
      approved: [...room.approved], count: watchers.size,
    },
    close: async () => {
      for (const ws of [...wss.clients, ...channelWss.clients]) ws.terminate();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
