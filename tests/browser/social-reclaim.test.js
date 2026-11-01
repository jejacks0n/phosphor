// A host whose tab closed, from another tab in the same browser: what's kept for it, how a tab knows the host's is
// gone, and what going back leaves ready for the reload. The reload itself is in tests/e2e/social-reclaim.spec.js.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore } from '@/store/RoomStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { forgetKey } from '@/social/keys';
import { desktopQuery } from '@/social/config';
import { GOING_BACK_FAILED_WORDS, ROOM_AWAY_WORDS } from '@/social/messages';
import { keepHostCopy, hostCopies, keepRoomLedger, readRoomLedger, readLatest } from '@/document/autosaveStore';
import { settingsJson } from '@/store/project/shared';
import { createTestApp, loadImage } from '../support/app.js';
import { ownDatabase } from '../support/socialDatabase.js';
import { member, fakeServer, useFakeSockets, lastSocket } from '../support/socialServer.js';

vi.mock('@/social/thumbnail', () => ({ thumbnailOf: vi.fn(async () => 'AAAA') }));
vi.mock('@/document/autosaveStore', async (original) => ({ ...await original(), readLatest: vi.fn() }));

const ID = 'abcdefghij', LOCK = `phosphor-hosting:${ID}`;
const info = (fields = {}) => ({ id: ID, name: 'Night shift', hostSub: 'u_1', hostName: 'ansi-fan', public: true, allowGuests: true, max: 12, signal: null, liveSince: 1000, count: 0, ...fields });
const copyOf = (fields = {}) => ({ id: ID, sub: 'u_1', documentId: 'doc', room: { name: 'Night shift', hostName: 'ansi-fan' }, host: { log: [], only: [] }, session: { people: [] }, ...fields });
const held = async () => (await navigator.locks.query()).held.some((lock) => lock.name === LOCK);

let server, social, room, project, letGo, ahead;
beforeEach(async () => {
  const deleteDatabases = ownDatabase(['phosphor-social', 'phosphor-host-records', 'phosphor-room-ledgers'], 'reclaim');
  forgetKey();
  await deleteDatabases();
  sessionStorage.clear();
  useFakeSockets();
  vi.stubGlobal('matchMedia', (query) => ({ matches: query === desktopQuery }));
  ({ project } = await createTestApp());
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 8, rows: 8 });
  server = fakeServer();
  server.session = member();
  server.route('POST /api/rooms', () => [200, { id: ID, link: `http://localhost/?room=${ID}` }]);
  social = useSocialStore();
  room = useRoomStore();
  await social.boot();
  await social.getPass();
  useDrawingStore().autosavedBy(async () => true);
  vi.mocked(readLatest).mockReset().mockResolvedValue({ record: {}, imageBuffer: new ArrayBuffer(1) });
  letGo = null;
  ahead = 0;
  const now = Date.now.bind(Date);
  vi.spyOn(Date, 'now').mockImplementation(() => now() + ahead);
});
afterEach(async () => {
  letGo?.();
  room.leave();
  social.disconnectLobby();
  await Promise.all([hostCopies(), readRoomLedger(ID)]);   // what leaving forgets is done, so the next test can delete the databases
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// A look, with the clock moved on to the next one's.
const look = async () => {
  await room.lookForOwnRooms();
  ahead += 2000;
};

const anotherTabHosts = () => new Promise((granted) => {
  navigator.locks.request(LOCK, () => new Promise((release) => { letGo = release; granted(); }));
});

async function live() {
  await room.startRoom({ name: 'Night shift', welcome: 'Hi', isPublic: true, allowGuests: true, max: 12 });
  const socket = await lastSocket(1);
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('host'));
  socket.receive({ type: 'hosting', room: info(), peers: [] });
  await expect.poll(async () => (await hostCopies()).some((copy) => copy.id === ID)).toBe(true);
  return socket;
}

test('a room you host is kept in the browser with its document, and goes when you end it', async () => {
  await live();
  const [row] = await hostCopies();
  expect(row).toMatchObject({ id: ID, sub: 'u_1' });
  expect(JSON.parse(row.record).documentId).toBe(project.documentId);
  room.endRoom();
  await expect.poll(() => hostCopies()).toEqual([]);
});

test('a host doing nothing still says it\'s here, or its copy would read as too old to come back to', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  try {
    await live();
    const before = (await hostCopies())[0].at;
    await new Promise((resolve) => setTimeout(resolve, 5));
    vi.advanceTimersByTime(15_000);
    await expect.poll(async () => (await hostCopies())[0].at).toBeGreaterThan(before);
  } finally {
    vi.useRealTimers();
  }
});

test('the host opening another document moves the copy to it, without waiting for the next keep', async () => {
  await live();
  project.documentId = 'another';
  await expect.poll(async () => JSON.parse((await hostCopies())[0].record).documentId, { timeout: 500 }).toBe('another');
});

test('the role moving, or the room refusing, takes the copy with it', async () => {
  const socket = await live();
  socket.receive({ type: 'new-host', name: 'tin_owl', sub: 'u_2', planned: true });
  await expect.poll(() => hostCopies()).toEqual([]);
});

test('a room taken by another tab leaves that tab\'s copy alone', async () => {
  const socket = await live();
  socket.receive({ type: 'replaced' });
  expect(room.role).toBe(null);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(await hostCopies()).toHaveLength(1);
});

test('a room taken by another tab leaves that tab\'s ledger alone', async () => {
  const socket = await live();
  await keepRoomLedger(ID, 'doc', () => ({ n: 7 }));
  socket.receive({ type: 'replaced' });
  expect(room.role).toBe(null);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(await readRoomLedger(ID)).toMatchObject({ kept: { n: 7 } });
});

test('signing out takes every copy in this browser', async () => {
  await keepHostCopy(copyOf());
  server.route('POST /api/auth/sign-out', () => [200, {}]);
  await social.signOut();
  await expect.poll(() => hostCopies()).toEqual([]);
});

test('a pass that\'s become another account\'s doesn\'t make the room theirs: the copy stays the host\'s, and stops being written', async () => {
  await live();
  const before = (await hostCopies())[0];
  await new Promise((resolve) => setTimeout(resolve, 5));
  social.claims = { ...social.claims, sub: 'u_2', name: 'tin_owl' };
  room.keepRecord();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const [row] = await hostCopies();
  expect([row.sub, row.at]).toEqual(['u_1', before.at]);
  expect(JSON.parse(sessionStorage.getItem('phosphor-hosting')).sub).toBe('u_1');
});

test('a hosting tab holds the room\'s lock, and lets go when it\'s done', async () => {
  await live();
  await expect.poll(held).toBe(true);
  room.endRoom();
  await expect.poll(held).toBe(false);
});

test('a room of yours is offered once its tab has stayed gone from one look to the next', async () => {
  await keepHostCopy(copyOf());
  await look();
  expect(room.reclaimable).toEqual([]);   // a reload's gap looks just like this
  await look();
  expect(room.reclaimable).toEqual([{ id: ID, name: 'Night shift' }]);
});

test('looks moments apart aren\'t two looks: the first still counts when about 2 s have passed', async () => {
  await keepHostCopy(copyOf());
  await room.lookForOwnRooms();
  await room.lookForOwnRooms();
  expect(room.reclaimable).toEqual([]);
  ahead += 2000;
  await room.lookForOwnRooms();
  expect(room.reclaimable).toHaveLength(1);
});

test('SOCIAL going away starts the looking over, and takes the offer down', async () => {
  await keepHostCopy(copyOf());
  await look();
  await look();
  expect(room.reclaimable).toHaveLength(1);
  room.stopLooking();
  expect(room.reclaimable).toEqual([]);
  await look();
  expect(room.reclaimable).toEqual([]);
  await look();
  expect(room.reclaimable).toHaveLength(1);
});

test('a tab that came back between looks starts the count over', async () => {
  await keepHostCopy(copyOf());
  await look();
  await anotherTabHosts();
  await look();
  letGo();
  await expect.poll(held).toBe(false);
  await look();
  expect(room.reclaimable).toEqual([]);
});

test('a tab still hosting it means no offer, and an offer already up goes', async () => {
  await keepHostCopy(copyOf());
  await look();
  await look();
  expect(room.reclaimable).toHaveLength(1);
  await anotherTabHosts();
  await look();
  expect(room.reclaimable).toEqual([]);
});

test('a reloading tab, waiting for the lock it left, counts as there', async () => {
  await keepHostCopy(copyOf());
  await anotherTabHosts();
  let granted = false;
  navigator.locks.request(LOCK, () => { granted = true; });
  await look();
  await look();
  expect(room.reclaimable).toEqual([]);
  letGo();
  await expect.poll(() => granted).toBe(true);
});

test('another account\'s room isn\'t offered, and its copy is left for them', async () => {
  await keepHostCopy(copyOf({ sub: 'u_2' }));
  await look();
  await look();
  expect(room.reclaimable).toEqual([]);
  expect(await hostCopies()).toHaveLength(1);
});

test('someone in a room is offered nothing', async () => {
  await keepHostCopy(copyOf({ id: 'bcdefghijk', sub: 'u_1' }));
  await live();
  await look();
  await look();
  expect(room.reclaimable).toEqual([]);
});

test('with no Web Locks, a closed tab can\'t be told from an open one: nothing is offered', async () => {
  await keepHostCopy(copyOf());
  vi.spyOn(navigator, 'locks', 'get').mockReturnValue(undefined);
  await look();
  await look();
  expect(room.reclaimable).toEqual([]);
});

test('a card naming another host means the role moved: the copy goes', async () => {
  await keepHostCopy(copyOf());
  social.lobby = { rooms: new Map([[ID, { id: ID, host: 'tin_owl' }]]), people: new Map() };
  await look();
  expect(await hostCopies()).toEqual([]);
});

test('a card naming you is the room as you left it', async () => {
  await keepHostCopy(copyOf());
  social.lobby = { rooms: new Map([[ID, { id: ID, host: 'ansi-fan' }]]), people: new Map() };
  await look();
  await look();
  expect(room.reclaimable).toHaveLength(1);
});

test('going back saves what\'s open first, then leaves the record and document for the reload', async () => {
  await keepHostCopy(copyOf());
  const order = [];
  useDrawingStore().autosavedBy(async () => { order.push('saved'); return true; });
  const reload = vi.fn(() => order.push('reload'));
  await room.goBackToRoom(ID, { reload });
  expect(order).toEqual(['saved', 'reload']);
  expect(JSON.parse(sessionStorage.getItem('phosphor-hosting'))).toMatchObject({ id: ID, sub: 'u_1', documentId: 'doc' });
  expect(sessionStorage.getItem('phosphor-autosave-document')).toBe('doc');
  expect(room.goingBack).toBe(true);
});

test('going back with art that can\'t be read says so and takes nothing', async () => {
  await keepHostCopy(copyOf());
  vi.mocked(readLatest).mockRejectedValue(new Error('unreadable'));
  const reload = vi.fn();
  await room.goBackToRoom(ID, { reload });
  expect(reload).not.toHaveBeenCalled();
  expect(social.notice).toBe('The room\'s art couldn\'t be opened.');
  expect(sessionStorage.getItem('phosphor-hosting')).toBe(null);
  await expect.poll(() => hostCopies()).toEqual([]);
});

test('going back to a document just opened waits for its first write', async () => {
  await keepHostCopy(copyOf());
  vi.mocked(readLatest).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
  const reload = vi.fn();
  await room.goBackToRoom(ID, { reload });
  expect(reload).toHaveBeenCalled();
  expect(social.notice).toBe(null);
  expect(await hostCopies()).toHaveLength(1);
});

test('going back to a document that never gets written says so and takes nothing', async () => {
  await keepHostCopy(copyOf());
  vi.mocked(readLatest).mockResolvedValue(null);
  const reload = vi.fn();
  await room.goBackToRoom(ID, { reload });
  expect(reload).not.toHaveBeenCalled();
  expect(social.notice).toBe('The room\'s art couldn\'t be opened.');
  await expect.poll(() => hostCopies()).toEqual([]);
});

test('going back with autosave failing keeps what\'s open and says so', async () => {
  await keepHostCopy(copyOf());
  useDrawingStore().autosavedBy(async () => false);
  const reload = vi.fn();
  await room.goBackToRoom(ID, { reload });
  expect(reload).not.toHaveBeenCalled();
  expect(social.notice).toBe('Autosave isn\'t working in this browser. Save to a file to keep your work.');
  expect(sessionStorage.getItem('phosphor-hosting')).toBe(null);
  expect(room.goingBack).toBe(false);
});

test('going back once another tab has it does nothing but take the offer away', async () => {
  await keepHostCopy(copyOf());
  await look();
  await look();
  await anotherTabHosts();
  const reload = vi.fn();
  await room.goBackToRoom(ID, { reload });
  expect(reload).not.toHaveBeenCalled();
  expect(room.reclaimable).toEqual([]);
  expect(social.notice).toBe(null);
});

test('a tab that comes back while going back saves what\'s open keeps its room', async () => {
  await keepHostCopy(copyOf());
  await look();
  await look();
  useDrawingStore().autosavedBy(async () => {
    await anotherTabHosts();
    return true;
  });
  const reload = vi.fn();
  await room.goBackToRoom(ID, { reload });
  expect(reload).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('phosphor-hosting')).toBe(null);
  expect(room.goingBack).toBe(false);
  expect(room.reclaimable).toEqual([]);
  expect(await hostCopies()).toHaveLength(1);
});

test('going back with the copy past its life doesn\'t say the room ended, since it may not have', async () => {
  const reload = vi.fn();
  await room.goBackToRoom(ID, { reload });
  expect(reload).not.toHaveBeenCalled();
  expect(social.notice).toBe(GOING_BACK_FAILED_WORDS);
  expect(social.notice).not.toBe(ROOM_AWAY_WORDS);
});

test('going back with no room for the record in this tab doesn\'t say the room ended, and it\'s still offered', async () => {
  await keepHostCopy(copyOf());
  await look();
  await look();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
  const reload = vi.fn();
  await room.goBackToRoom(ID, { reload });
  expect(reload).not.toHaveBeenCalled();
  expect(social.notice).toBe(GOING_BACK_FAILED_WORDS);
  expect(room.reclaimable).toHaveLength(1);
  expect(await hostCopies()).toHaveLength(1);
});

test('art that won\'t open after the reload says so, and leaves the copy and ledger to try again', async () => {
  await live();
  await keepRoomLedger(ID, 'doc', () => ({ n: 7 }));
  const record = sessionStorage.getItem('phosphor-hosting');
  room._connection = null;
  room._letGoOfTab?.();
  for (const stop of room._stops) stop();
  Object.assign(room, { role: null, id: null, _host: null, _stops: [] });
  sessionStorage.setItem('phosphor-hosting', record);
  project.clearImage();
  room.resume();
  useWorkspaceStore().documentAnswered = true;
  await expect.poll(() => room.role).toBe(null);
  expect(social.notice).toBe('The room\'s art couldn\'t be opened.');
  expect(sessionStorage.getItem('phosphor-hosting')).toBe(null);
  expect(await hostCopies()).toHaveLength(1);
  expect(await readRoomLedger(ID)).toMatchObject({ kept: { n: 7 } });
});

test('another account can\'t go back, even by the id', async () => {
  await keepHostCopy(copyOf({ sub: 'u_2' }));
  const reload = vi.fn();
  await room.goBackToRoom(ID, { reload });
  expect(reload).not.toHaveBeenCalled();
});

test('going back says it replaces art with unsaved changes, and only then', async () => {
  project.savedEditVersion = project.editVersion;
  project.savedSettings = settingsJson(project);
  expect(room.goingBackReplaces).toBe(false);
  project.editVersion++;
  expect(room.goingBackReplaces).toBe(true);
});
