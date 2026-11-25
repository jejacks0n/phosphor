// The room moving between computers in the desktop build, and quitting: an artist's own room service on standby
// (so the host knows where it could host next), the room's settings carried to the new host, everyone else joining
// again at the new host's addresses, and a quitting host handing the room over or ending it. A fake desktop bridge
// stands in for the main process, and the room's sockets are the fake the test answers (tests/support/socialServer.js).
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore } from '@/store/RoomStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { useFakeDesktop, resetDesktop } from '@/social/desktop';
import { Host } from '@/social/hosting';
import { Watch } from '@/social/watching';
import { forgetKey } from '@/social/keys';
import { makeSelfPass } from '@/social/selfPass';
import { toBase64url } from '@/social/base64url';
import { t } from '@/i18n/index.js';
import { createTestApp, settle } from '../support/app.js';
import { ownSocialDatabase } from '../support/socialDatabase.js';
import { sockets, useFakeSockets, lastSocket } from '../support/socialServer.js';

const ID = 'abcdefgh23';
const ADDRESS = '192.168.1.20:4000';
const SECRET = 'launch-secret';
const PORT = 31337;
const MINE = ['192.168.1.30:31337', '100.70.0.4:31337'];   // this computer's, as its service lists them
const EXTRA = { password: 'sesame', max: 6, welcome: 'Hi all', name: 'Night shift', approved: ['u_ann', 'u_cy'] };
const gradient = await (await fetch('/tests/fixtures/images/gradient.png')).blob();   // before fetch is stubbed

async function someone(name) {
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const publicKey = toBase64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  return makeSelfPass({ privateKey: pair.privateKey, publicKey }, name);
}

let deleteDatabase, social, room, project, pinia, drawing, desktop, fetched;
beforeEach(async () => {
  deleteDatabase = ownSocialDatabase('desktop-room-handover');
  sessionStorage.clear();
  localStorage.removeItem('phosphor-desktop-port');
  forgetKey();
  await deleteDatabase();
  useFakeSockets();
  ({ project, pinia } = await createTestApp());
  await project.setImageFromFile(new File([gradient], 'gradient.png', { type: gradient.type }), { withLayer: true });
  Object.assign(project, { aspectLock: false, cols: 8, rows: 8 });
  project.render();
  await settle(project);
  fetched = vi.fn(() => Promise.reject(new Error('no server on desktop')));
  vi.stubGlobal('fetch', fetched);
  desktop = {
    startService: vi.fn(async () => ({ port: PORT, addresses: MINE, secret: SECRET })),
    serviceInfo: vi.fn(async () => null),
    stopService: vi.fn(async () => {}),
    onQuit: vi.fn(),
    quitReady: vi.fn(),
  };
  useFakeDesktop(desktop);
  social = useSocialStore(pinia);
  room = useRoomStore(pinia);
  drawing = useDrawingStore(pinia);
  await social.boot();
  social.setDesktopName('bo');
});
afterEach(() => {
  vi.useRealTimers();
  room.leave();
  social.dropPass();
  resetDesktop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  expect(fetched).not.toHaveBeenCalled();
});

// Joined at ADDRESS as a watcher, in ann's room. Returns the room's socket.
async function joined() {
  const made = sockets.length;
  const joining = room.joinAddress(ADDRESS);
  const info = await lastSocket(made + 1);
  info.accept();
  info.receive({ type: 'info', protocol: 1, id: ID, name: 'Night shift', password: false });
  expect(await joining).toBe(true);
  const socket = await lastSocket(made + 2);
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('join'));
  socket.receive({ type: 'joined', id: ID, peer: 'p_1', token: 'tok', hostName: 'ann', hostSub: 'u_ann', artists: [] });
  return socket;
}

// Drawing in the room (what accepting an invitation ends with).
const drawingNow = () => project.startSharing({ send: () => {}, role: 'artist', me: social.claims.sub });

// Hosting a room on this computer, live. Returns the room's socket.
async function hosting() {
  desktop.startService.mockResolvedValueOnce({ port: PORT, addresses: ['192.168.1.20:31337'], secret: SECRET });
  const made = sockets.length;
  expect(await room.startRoom({ name: 'Night shift', welcome: 'Hi', password: 'sesame', max: 5, port: PORT })).toBe(true);
  const socket = await lastSocket(made + 1);
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('host'));
  socket.receive({ type: 'hosting', room: { id: room.id, name: 'Night shift', welcome: 'Hi', max: 5, count: 0 }, peers: [] });
  desktop.startService.mockClear();
  return socket;
}

// Above the 20 ports hosts take from the remembered one, so a window drawing in a room never takes the port someone
// reaches this computer by with no port typed.
test('standby starts 20 above the remembered port, or 40 below it near the last port', async () => {
  localStorage.setItem('phosphor-desktop-port', '31401');
  await joined();
  drawingNow();
  await vi.waitFor(() => expect(desktop.startService).toHaveBeenCalledWith({ port: 31421, mode: 'standby', sub: social.claims.sub }));
  room.leave();

  localStorage.removeItem('phosphor-desktop-port');   // none kept: above the default
  desktop.startService.mockClear();
  await joined();
  drawingNow();
  await vi.waitFor(() => expect(desktop.startService).toHaveBeenCalledWith({ port: 31357, mode: 'standby', sub: social.claims.sub }));
  room.leave();

  localStorage.setItem('phosphor-desktop-port', '65496');   // the last that leaves standby its 20 ports above: 65516 to 65535
  desktop.startService.mockClear();
  await joined();
  drawingNow();
  await vi.waitFor(() => expect(desktop.startService).toHaveBeenCalledWith({ port: 65516, mode: 'standby', sub: social.claims.sub }));
  room.leave();

  localStorage.setItem('phosphor-desktop-port', '65497');   // too near the last port: 40 below, clear of a host's 20
  desktop.startService.mockClear();
  await joined();
  drawingNow();
  await vi.waitFor(() => expect(desktop.startService).toHaveBeenCalledWith({ port: 65457, mode: 'standby', sub: social.claims.sub }));
});

test('becoming an artist starts standby and sends addresses', async () => {
  localStorage.setItem('phosphor-desktop-port', '4100');   // the port last hosted on
  const socket = await joined();
  expect(desktop.startService).not.toHaveBeenCalled();   // watching needs no service
  drawingNow();
  await vi.waitFor(() => expect(desktop.startService).toHaveBeenCalledWith({ port: 4120, mode: 'standby', sub: social.claims.sub }));
  await vi.waitFor(() => expect(socket.sent.at(-1)).toEqual({ type: 'addresses', list: MINE }));

  // Put back to watching: the service stops.
  project.stopSharing();
  await vi.waitFor(() => expect(desktop.stopService).toHaveBeenCalledTimes(1));

  // Drawing again, then leaving: it stops then too.
  drawingNow();
  await vi.waitFor(() => expect(desktop.startService).toHaveBeenCalledTimes(2));
  room.leave();
  expect(desktop.stopService).toHaveBeenCalledTimes(2);

  // Starting a room of your own while drawing in someone else's: the standby service stops before the room's starts,
  // so the room's isn't the one stopped.
  await joined();
  drawingNow();
  await vi.waitFor(() => expect(desktop.startService).toHaveBeenCalledTimes(3));
  desktop.stopService.mockClear();
  expect(await room.startRoom({ name: 'Mine', welcome: '', password: '', max: 5, port: 4200 })).toBe(true);
  expect(desktop.stopService).toHaveBeenCalledTimes(1);
  expect(desktop.stopService.mock.invocationCallOrder[0]).toBeLessThan(desktop.startService.mock.invocationCallOrder.at(-1));
  expect(desktop.startService).toHaveBeenLastCalledWith({ port: 4200, mode: 'host', sub: social.claims.sub });
  expect(room.role).toBe('host');
  await Promise.resolve();
  expect(desktop.stopService).toHaveBeenCalledTimes(1);   // hosting now: nothing stops it
});

test('hand-over carries the room settings as extra', async () => {
  // The host's side: hand-over says what handOverExtra gives, and null without it (the web's).
  for (const [extra, handOverExtra] of [[EXTRA, () => EXTRA], [null, undefined]]) {
    const host = new Host({ send: () => {}, passKey: async () => null, roomId: ID, ...(handOverExtra ? { handOverExtra } : {}) });
    host.room = { name: 'Night shift', welcome: 'Hi all' };
    const w = { peer: 'p_1', claims: { sub: 'u_bo' }, drawing: true, queue: [] };
    host.watchers.set('p_1', w);
    host.open = () => [w];
    host.sendTo = vi.fn();
    host.putPaced = async () => {};
    host.sentWhole = async () => {};
    const handing = host.handOver('u_bo', [new Uint8Array(4)]);
    await vi.waitFor(() => expect(host.sendTo).toHaveBeenCalled());
    expect(host.sendTo).toHaveBeenCalledWith(w, { t: 'hand-over', chunks: 1, room: host.room, extra });
    w.handedOver(true);
    expect(await handing).toBe(true);
  }

  // The artist's side: Watch hands it on, for someone drawing.
  const onHandOverExtra = vi.fn();
  const watch = new Watch({ send: () => {}, roomId: ID, passKey: async () => null, onRoom: () => {}, onArt: () => {}, onView: () => {}, onState: () => {}, takesProjects: () => true, onHandOverExtra });
  watch.handOverStart({ chunks: 1, room: null, extra: EXTRA });
  expect(onHandOverExtra).toHaveBeenCalledWith(EXTRA);
});

test('the named artist hosts on its own service with the extra\'s settings and the same room id', async () => {
  const old = await joined();
  drawingNow();
  await vi.waitFor(() => expect(desktop.startService).toHaveBeenCalledWith(expect.objectContaining({ mode: 'standby' })));
  room._watch.takesProjects = () => true;   // an artist the host has listed and who said yes
  room._watch.handOverStart({ chunks: 1, room: { name: 'Night shift', welcome: 'Hi all' }, extra: EXTRA });   // what the old host's hand-over brought
  const made = sockets.length;

  old.receive({ type: 'new-host', name: 'bo', sub: social.claims.sub, planned: true, addresses: MINE });
  old.serverClose('new-host');
  await vi.waitFor(() => expect(desktop.startService).toHaveBeenLastCalledWith({ mode: 'host', sub: social.claims.sub }));
  expect(room.role).toBe('host');
  expect(old.closed).toBe(true);
  const socket = await lastSocket(made + 1);
  expect(socket.url).toBe(`ws://127.0.0.1:${PORT}/room`);
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('host'));
  expect(socket.sent[0]).toMatchObject({ type: 'host', secret: SECRET, protocol: 1, room: { ...EXTRA, id: ID } });
  expect([room.id, room.hasPassword, room.addresses]).toEqual([ID, true, MINE]);

  socket.receive({ type: 'hosting', room: { id: ID, name: 'Night shift', welcome: 'Hi all', max: 6, count: 0 }, peers: [] });
  expect(room.status).toBe('live');
  // Handing it on again carries the same password.
  expect(room._host.handOverExtra()).toMatchObject({ password: 'sesame', max: 6, welcome: 'Hi all', name: 'Night shift' });
  expect(sessionStorage.getItem('phosphor-hosting')).not.toContain('sesame');
});

test('everyone else rejoins at new-host\'s first address with the room id', async () => {
  const old = await joined();
  const made = sockets.length;
  old.receive({ type: 'new-host', name: 'cy', sub: 'u_cy', planned: true, addresses: ['192.168.1.40:31337', '192.168.1.41:31337'] });
  old.serverClose('new-host');
  expect(old.closed).toBe(true);
  const socket = await lastSocket(made + 1);
  expect(socket.url).toBe('ws://192.168.1.40:31337/room');
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('join'));
  expect(socket.sent[0]).toMatchObject({ type: 'join', room: ID, protocol: 1 });
  expect(room.room).toMatchObject({ host: 'cy', hostSub: 'u_cy' });

  socket.receive({ type: 'joined', id: ID, peer: 'p_4', token: 'tok2', hostName: 'cy', hostSub: 'u_cy', artists: [] });
  expect([room.role, room._joinedAs]).toEqual(['watch', { peer: 'p_4', token: 'tok2' }]);
  expect(sockets).toHaveLength(made + 1);
});

test('the next address is tried when the first doesn\'t go live', async () => {
  const old = await joined();
  const made = sockets.length;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  old.receive({ type: 'new-host', name: 'cy', sub: 'u_cy', planned: true, addresses: ['192.168.1.40:31337', '10.0.0.7:31337'] });
  // (No waitFor while the clock is fake: it moves the clock. The sockets are made as the connection opens.)
  const first = sockets[made];
  expect(first.url).toBe('ws://192.168.1.40:31337/room');
  vi.advanceTimersByTime(4999);
  expect(sockets).toHaveLength(made + 1);
  vi.advanceTimersByTime(1);
  expect(first.closed).toBe(true);
  expect(sockets).toHaveLength(made + 2);
  const next = sockets[made + 1];
  expect(next.url).toBe('ws://10.0.0.7:31337/room');

  // The new host's service took the room up a moment late: the room isn't there yet, so it's asked again.
  next.accept();
  next.receive({ type: 'refused', reason: 'unavailable' });
  expect(room.role).toBe('watch');
  vi.advanceTimersByTime(1000);
  expect(sockets).toHaveLength(made + 3);
  const again = sockets[made + 2];
  expect(again.url).toBe('ws://10.0.0.7:31337/room');
  again.accept();
  again.receive({ type: 'joined', id: ID, peer: 'p_4', token: 'tok2', hostName: 'cy', hostSub: 'u_cy', artists: [] });
  vi.advanceTimersByTime(10_000);
  expect(room.role).toBe('watch');
  expect(sockets).toHaveLength(made + 3);
});

test('no address answering closes with the moved-unreachable words', async () => {
  const old = await joined();
  const made = sockets.length;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  old.receive({ type: 'new-host', name: 'cy', sub: 'u_cy', planned: true, addresses: ['192.168.1.40:31337', '10.0.0.7:31337'] });
  vi.advanceTimersByTime(10_000);
  expect(room.role).toBe(null);
  expect(social.notice).toBe('The room moved to cy, and their address couldn\'t be reached.');
  expect(social.notice).toBe(t('social.errors.movedUnreachable', { name: 'cy' }));
  expect(sockets.slice(made).every((s) => s.closed)).toBe(true);
  vi.advanceTimersByTime(60_000);
  expect(sockets).toHaveLength(made + 2);   // nothing tries again

  // None at all to go to is the same, and the old socket doesn't try its old address again.
  vi.useRealTimers();
  const again = await joined();
  const connection = room._connection;
  again.receive({ type: 'new-host', name: 'cy', sub: 'u_cy', planned: true, addresses: ['not an address/x', 7] });
  again.serverClose('new-host');
  expect(room.role).toBe(null);
  expect(social.notice).toBe(t('social.errors.movedUnreachable', { name: 'cy' }));
  expect(connection.status).toBe('closed');
});

test('quitting as host with a hostable artist makes them host, then quitReady', async () => {
  const socket = await hosting();
  const ann = await someone('ann'), cy = await someone('cy');
  socket.receive({ type: 'artists-now', subs: [cy.claims.sub, ann.claims.sub], hostable: { [ann.claims.sub]: ['192.168.1.30:31337'] } });
  drawing.connected = [cy.claims.sub, ann.claims.sub];
  room.watchers = [cy, ann].map(({ claims }, i) => ({ peer: `p_${i + 1}`, sub: claims.sub, name: claims.name, guest: false, tracking: true, connected: true }));
  const made = sockets.length;
  let answered;
  const makeHost = vi.spyOn(drawing, 'makeHost').mockImplementation(async (sub) => {
    // The room's artists on the next host's service: those drawing now, and this host, who stays on as one.
    expect(room._host.handOverExtra()).toEqual({ password: 'sesame', max: 5, welcome: 'Hi', name: 'Night shift', approved: [social.claims.sub, cy.claims.sub, ann.claims.sub], artists: [social.claims.sub, cy.claims.sub, ann.claims.sub] });
    await new Promise((resolve) => { answered = resolve; });
    socket.receive({ type: 'new-host', name: 'ann', sub, planned: true, addresses: ['192.168.1.30:31337'] });
    return true;
  });

  const quitting = room.quitting();
  expect(makeHost).toHaveBeenCalledWith(ann.claims.sub);   // cy's service never answered
  await Promise.resolve();
  expect(desktop.quitReady).not.toHaveBeenCalled();   // not before the room's moved
  answered();
  await quitting;
  expect(desktop.quitReady).toHaveBeenCalledTimes(1);
  expect(room.role).toBe('watch');   // the window's question is about the drawing alone, not the room
  expect(socket.sent.some((msg) => msg.type === 'end')).toBe(false);
  const rejoin = await lastSocket(made + 1);
  expect(rejoin.url).toBe('ws://192.168.1.30:31337/room');
});

test('quitting as host with no one hostable ends the room, then quitReady', async () => {
  let socket = await hosting();
  const makeHost = vi.spyOn(drawing, 'makeHost');
  await room.quitting();
  expect(makeHost).not.toHaveBeenCalled();
  expect(socket.sent.at(-1)).toEqual({ type: 'end' });
  expect(desktop.stopService).toHaveBeenCalledTimes(1);
  expect([room.role, desktop.quitReady.mock.calls.length]).toEqual([null, 1]);

  // A hand-over that doesn't happen, or throws, ends it too, and quitReady is said once.
  for (const outcome of [async () => false, async () => { throw new Error('gone'); }]) {
    desktop.quitReady.mockClear();
    socket = await hosting();
    const ann = await someone('ann');
    socket.receive({ type: 'artists-now', subs: [ann.claims.sub], hostable: { [ann.claims.sub]: ['192.168.1.30:31337'] } });
    drawing.connected = [ann.claims.sub];
    makeHost.mockImplementation(outcome);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await room.quitting();
    expect(socket.sent.at(-1)).toEqual({ type: 'end' });
    expect([room.role, desktop.quitReady.mock.calls.length]).toEqual([null, 1]);
    warn.mockRestore();
  }

  // Not hosting: ready at once.
  desktop.quitReady.mockClear();
  await joined();
  await room.quitting();
  expect([room.role, desktop.quitReady.mock.calls.length]).toEqual(['watch', 1]);
});

// A host with ann listed, connected and able to host. Returns the room's socket and ann.
async function hostingWithAnn() {
  const socket = await hosting();
  const ann = await someone('ann');
  socket.receive({ type: 'artists-now', subs: [ann.claims.sub], hostable: { [ann.claims.sub]: ['192.168.1.30:31337'] } });
  drawing.connected = [ann.claims.sub];
  return { socket, ann };
}

test('quitting gives up on a hand-over that takes too long: the room ends, then quitReady, before the app stops waiting', async () => {
  const { socket } = await hostingWithAnn();
  vi.spyOn(drawing, 'makeHost').mockImplementation(() => new Promise(() => {}));   // never answers
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const quitting = room.quitting();
  vi.advanceTimersByTime(15_999);
  await Promise.resolve();
  expect(desktop.quitReady).not.toHaveBeenCalled();
  expect(room.role).toBe('host');
  vi.advanceTimersByTime(1);   // 16 s: the main process waits 20
  await quitting;
  expect(socket.sent.at(-1)).toEqual({ type: 'end' });
  expect([room.role, desktop.quitReady.mock.calls.length]).toEqual([null, 1]);
});

test('quitting while a Make host is on its way waits on that one', async () => {
  const { socket, ann } = await hostingWithAnn();
  let said;
  vi.spyOn(room._host, 'handOver').mockImplementation(() => new Promise((resolve) => { said = resolve; }));
  const asked = drawing.makeHost(ann.claims.sub);
  expect(drawing.handingOver()).toBeTruthy();
  const makeHost = vi.spyOn(drawing, 'makeHost');
  const quitting = room.quitting();
  expect(makeHost).not.toHaveBeenCalled();   // a second ask would be refused at once, and the room ended
  await vi.waitFor(() => expect(said).toBeTypeOf('function'));
  said(true);   // the artist has the ledger
  await vi.waitFor(() => expect(socket.sent.at(-1)).toEqual({ type: 'hand-over', to: ann.claims.sub }));
  expect(desktop.quitReady).not.toHaveBeenCalled();
  socket.receive({ type: 'new-host', name: 'ann', sub: ann.claims.sub, planned: true, addresses: ['192.168.1.30:31337'] });
  await quitting;
  expect(await asked).toBe(true);
  expect(drawing.handingOver()).toBe(null);
  expect([room.role, desktop.quitReady.mock.calls.length]).toEqual(['watch', 1]);
  expect(socket.sent.some((msg) => msg.type === 'end')).toBe(false);
});

test('standby left running from before a reload stops when nothing here is drawing', async () => {
  desktop.serviceInfo.mockResolvedValue({ port: PORT, addresses: MINE, secret: SECRET, mode: 'standby', password: null });
  room.resume();
  await vi.waitFor(() => expect(desktop.stopService).toHaveBeenCalledTimes(1));
  desktop.stopService.mockClear();
  desktop.serviceInfo.mockResolvedValue(null);   // nothing running: nothing to stop
  room.resume();
  await vi.waitFor(() => expect(desktop.serviceInfo).toHaveBeenCalledTimes(2));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(desktop.stopService).not.toHaveBeenCalled();
});

test('passOn names only an artist whose own service answered', async () => {
  await joined();
  const ann = await someone('ann'), cy = await someone('cy');
  const send = vi.fn(() => true);
  room._connection = { send, close: () => {} };
  room._named = { passing: true, to: null, tried: new Set(), timer: null, heard: [
    { type: 'hosting', room: {}, peers: [{ peer: 'p_1', pass: cy.pass }, { peer: 'p_2', pass: ann.pass }] },
    { type: 'artists-now', subs: [cy.claims.sub, ann.claims.sub], hostable: { [ann.claims.sub]: ['192.168.1.30:31337'] } },
  ] };
  room.passOn();
  expect(send).toHaveBeenCalledWith({ type: 'hand-over', to: ann.claims.sub });
  clearTimeout(room._named.timer);
  room._named = null;
  room._connection = null;
});
