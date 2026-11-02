// Drawing together, end to end but for the screen: a host's and artists' project stores, each in its own
// pinia, joined by a real Host and real Watches over real WebRTC (no STUN), with a relay for signals and
// passes signed by a test key. The tests draw through the stores and read what each ends up with.
import { test, expect, afterEach, vi } from 'vitest';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { createApp, h, nextTick, watch } from 'vue';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { Host } from '@/social/hosting';
import { Watch } from '@/social/watching';
import { toBase64url } from '@/social/base64url';
import { CHECK_EVERY_MS, MOST_ARTISTS, useDrawingStore } from '@/store/DrawingStore';
import RoomPeople from '@/components/social/RoomPeople.vue';
import { useProjectStore } from '@/store/ProjectStore';
import { ASK_AGAIN_MS, HELD_FLOAT_MS } from '@/store/project/sharing';
import { useRoomStore } from '@/store/RoomStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { serializeBase, withPins } from '@/document/baseRecords';
import { CHUNK_BYTES, packValue } from '@/social/wire';
import { hashCell } from '@/document/changes';
import { Ledger, keptForWire, keptFromWire } from '@/document/ledger';
import { forgetRoomLedger, readRoomLedger } from '@/document/autosaveStore';
import { toastMessage } from '@/composables/useToast';

const config = { iceServers: [] };
const later = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PATIENT = { timeout: 8000 };
const RED = 0xff0000ff, BLUE = 0x0000ffff;

const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
const keyB64 = toBase64url(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)));
const passKey = async () => keyB64;
async function passFor(sub, guest = false) {
  const claims = { sub, name: sub, guest, verified: !guest, key: 'k', exp: Date.now() / 1000 + 3600 };
  const body = toBase64url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', keys.privateKey, new TextEncoder().encode(body)));
  return `${body}.${toBase64url(signature)}`;
}

let toStop = [];
afterEach(() => {
  for (const stop of toStop) stop();
  toStop = [];
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// The host, drawing on a 40 x 40 grid in its own pinia. Join people with join(room, sub).
async function hosting({ cols = 40, rows = 40 } = {}) {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols, rows });
  project.ensureLayer();
  const drawing = useDrawingStore();
  const room = { project, drawing, people: new Map() };
  room.host = new Host({
    config, passKey, roomId: 'room',
    send: async (msg) => {
      if (msg.type !== 'signal-to') return;
      await later();
      room.people.get(msg.to)?.watch.signalFrom('host', msg.data);
    },
    ...drawing.hostCallbacks(),
  });
  drawing.hosted(room.host, { me: () => 'host' });
  room.host.setRoom({ name: 'Night shift', welcome: '' });
  toStop.push(() => { drawing.close(); room.host.close(); });
  return room;
}

// Someone in the room, watching: their own pinia, with what EditWorkspace does for settings. Art is left out.
async function join(room, sub, { guest = false } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const project = useProjectStore(), drawing = useDrawingStore();
  project.seed = 'phosphor-tests';
  toStop.push(watch(() => project.processParams, () => project.render(), { deep: true }));
  const person = { sub, pinia, project, drawing };
  person.watch = new Watch({
    config, roomId: 'room', passKey,
    send: async (msg) => { await later(); room.host.signalFrom(sub, msg.data); },
    onRoom: () => {}, onArt: () => {}, onView: () => {},
    onState: (state) => drawing.connection(state),
    ...drawing.watchCallbacks(),
  });
  drawing.watching(person.watch, { me: () => sub, roomId: 'room', roomName: () => 'Night shift' });
  room.people.set(sub, person);
  toStop.push(() => { drawing.close(); person.watch.close(); });
  await room.host.peer(sub, await passFor(sub, guest));
  await expect.poll(() => room.host.open().some((w) => w.peer === sub), PATIENT).toBe(true);
  await expect.poll(() => person.watch.ready, PATIENT).toBe(true);
  return person;
}

// Invited, accepted, and with the project opened.
async function artist(room, sub) {
  const person = await join(room, sub);
  expect(room.drawing.invite(sub)).toBe(true);
  await expect.poll(() => person.drawing.invitation, PATIENT).toBe(true);
  person.drawing.accept();
  await expect.poll(() => person.drawing.mayDraw, PATIENT).toBe(true);
  return person;
}

const sorted = (project) => [...project.editCells].sort(([a], [b]) => (a < b ? -1 : 1));
const char = (project, col, row) => project.editCellAt(col, row)?.char;
const painted = (project, x, y) => project.paintLayer.pixelAt(x, y);
const dab = (project, x, y, color = '#ff0000') => project.paintStroke([{ x, y, alpha: 1 }], color);
const quiet = (person) => person.project._sharing.pending.size === 0;

// Everyone's edit layer the same, and the sums that follow it what a scan says.
async function allMatch(room, ...people) {
  await expect.poll(() => people.every(quiet), PATIENT).toBe(true);
  room.project.flushHeard();
  for (const person of people) {
    await expect.poll(() => JSON.stringify(sorted(person.project)), PATIENT).toBe(JSON.stringify(sorted(room.project)));
    await expect.poll(() => person.project.editLayerSum(), PATIENT).toBe(room.project.editLayerSum());
    expect(person.project._sharing.pending.sum).toBe(person.project.editLayerSum());
  }
  expect(room.project._ledger.sum).toBe(room.project.editLayerSum());
}

test('a guest can\'t be invited', async () => {
  const room = await hosting();
  const person = await join(room, 'guest1', { guest: true });
  expect(room.drawing.invite('guest1')).toBe(false);
  expect(room.drawing.invited).toEqual([]);
  await wait(50);
  expect(person.drawing.invitation).toBe(false);
});

test('no invitation for someone not here, or for the host', async () => {
  const room = await hosting();
  expect(room.drawing.invite('nobody')).toBe(false);
  expect(room.drawing.invite('host')).toBe(false);
});

test('an invitation can be withdrawn or declined, and an answer nobody asked for does nothing', async () => {
  const room = await hosting();
  const person = await join(room, 'ann');
  person.watch.post({ t: 'accept' });
  await wait(50);
  expect(room.drawing.artists).toEqual([]);

  room.drawing.invite('ann');
  expect(room.drawing.invited).toEqual(['ann']);
  await expect.poll(() => person.drawing.invitation, PATIENT).toBe(true);
  room.drawing.withdraw('ann');
  await expect.poll(() => person.drawing.invitation, PATIENT).toBe(false);
  expect(room.drawing.invited).toEqual([]);

  room.drawing.invite('ann');
  await expect.poll(() => person.drawing.invitation, PATIENT).toBe(true);
  person.drawing.decline();
  await expect.poll(() => room.drawing.invited, PATIENT).toEqual([]);
  expect(room.drawing.artists).toEqual([]);
  expect(person.drawing.mayDraw).toBe(false);
});

test('an artist opens the room\'s art under a new document, keeping the old one\'s, and may draw only then', async () => {
  const room = await hosting();
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  const person = await join(room, 'ann');
  const hasOwn = await createOwnDocument(person);
  room.drawing.invite('ann');
  await expect.poll(() => person.drawing.invitation, PATIENT).toBe(true);
  expect(person.project.documentId).toBe(hasOwn);
  expect(person.drawing.mayDraw).toBe(false);
  person.drawing.accept();
  await expect.poll(() => person.drawing.mayDraw, PATIENT).toBe(true);
  expect(person.project.documentId).not.toBe(hasOwn);
  expect(person.project.documentId).not.toBe(room.project.documentId);
  expect(char(person.project, 1, 1)).toBe('H');
  expect(person.project.filename).toBe('Night shift');
  expect(person.project.history.canUndo).toBe(false);
  expect(room.drawing.artists).toEqual(['ann']);
  expect(person.drawing.artists).toEqual(['ann']);
});

async function createOwnDocument(person) {
  setActivePinia(person.pinia);
  await loadImage(person.project, '/tests/fixtures/images/gradient.png', { cols: 10, rows: 10 });
  return person.project.documentId;
}

test('host and artist end with equal edit layers after crossing strokes', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  for (let i = 0; i < 12; i++) {
    room.project.editCell(i, 3, { char: 'H' });
    ann.project.editCell(i, 3, { char: 'A' });
    dab(room.project, 2 * i, 20);
    dab(ann.project, 2 * i, 20, '#0000ff');
    room.project.editCell(i, 5, { char: 'H' });
    ann.project.editCell(i + 6, 5, { char: 'A' });
    await later();
  }
  room.project.commitEdit();
  ann.project.commitEdit();
  await allMatch(room, ann);
  for (let i = 0; i < 12; i++) expect(painted(ann.project, 2 * i, 20)).toEqual(painted(room.project, 2 * i, 20));
});

test('a change from an artist shows on the host\'s cells, so what watchers are sent follows', async () => {
  const room = await hosting();
  room.project.render();
  await settle(room.project);
  const ann = await artist(room, 'ann');
  ann.project.editCell(2, 2, { char: 'Q' });
  ann.project.commitEdit();
  await expect.poll(() => room.project.cells[2 * 40 + 2].char, PATIENT).toBe('Q');
});

test('undo by an artist comes back as a numbered change everyone applies', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  ann.project.editCell(1, 1, { char: 'A' });
  ann.project.commitEdit();
  dab(bob.project, 9, 9);
  bob.project.commitEdit();
  await allMatch(room, ann, bob);
  expect(char(bob.project, 1, 1)).toBe('A');

  ann.project.undo();
  expect(char(ann.project, 1, 1)).toBe('A');   // not ahead of the host
  await expect.poll(() => char(bob.project, 1, 1), PATIENT).toBe(undefined);
  await expect.poll(() => char(ann.project, 1, 1), PATIENT).toBe(undefined);
  expect(painted(room.project, 9, 9)).toEqual(painted(bob.project, 9, 9));
  await allMatch(room, ann, bob);

  ann.project.redo();
  await expect.poll(() => char(bob.project, 1, 1), PATIENT).toBe('A');
  await allMatch(room, ann, bob);
});

test('an artist\'s undo on a stroke with the host mid-stroke leaves the host\'s screen as its ledger has it', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  ann.project.editCell(1, 1, { char: 'A' });
  ann.project.commitEdit();
  await allMatch(room, ann);
  room.project.editCell(1, 1, { char: 'H' });
  dab(room.project, 4, 4);
  ann.project.undo();
  await expect.poll(() => room.project._ledger.n > 1, PATIENT).toBe(true);
  await wait(30);
  room.project.commitEdit();
  await allMatch(room, ann);
  expect(char(ann.project, 1, 1)).toBe('H');
});

test('a joining artist gets the project, then the changes made during its transfer, none twice', async () => {
  const room = await hosting();
  room.project.editCell(0, 0, { char: 'B' });
  room.project.commitEdit();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const pack = room.host.project;
  room.host.project = () => {
    const made = pack();
    return { ...made, chunks: gate.then(() => made.chunks) };
  };

  const ann = await join(room, 'ann');
  const applied = vi.spyOn(ann.project, 'hearDrawing');
  room.drawing.invite('ann');
  await expect.poll(() => ann.drawing.invitation, PATIENT).toBe(true);
  ann.drawing.accept();
  await expect.poll(() => room.host.open().find((w) => w.peer === 'ann').projecting, PATIENT).toBe(true);
  const projectN = room.project._ledger.n;

  room.project.editCell(1, 0, { char: 'D' });
  room.project.commitEdit();
  room.project.editCell(2, 0, { char: 'E' });
  room.project.commitEdit();
  const lastN = room.project._ledger.n;
  expect(lastN).toBeGreaterThan(projectN);
  await wait(30);
  expect(ann.drawing.mayDraw).toBe(false);
  expect(char(ann.project, 1, 0)).toBe(undefined);

  release();
  await expect.poll(() => char(ann.project, 2, 0), PATIENT).toBe('E');
  expect(char(ann.project, 0, 0)).toBe('B');
  expect(char(ann.project, 1, 0)).toBe('D');
  expect(ann.project._sharing.pending.n).toBe(lastN);
  const numbers = applied.mock.calls.map(([m]) => m.n).filter((n) => n !== undefined);
  expect(new Set(numbers).size).toBe(numbers.length);
  expect(numbers.every((n) => n > projectN)).toBe(true);
  await allMatch(room, ann);
});

test('numbered changes sent inside a project\'s chunks wait for it, and any it already has are skipped', async () => {
  const room = await hosting();
  const person = await join(room, 'ann');
  const applied = vi.spyOn(person.project, 'hearDrawing');
  const open = vi.spyOn(person.project, 'takeProject');
  const { chunks } = room.project.projectNow();
  const packed = await chunks;
  const channel = room.host.open().find((w) => w.peer === 'ann').channel;
  const change = (n, char) => JSON.stringify({ t: 'numbered', n, by: 'host', stroke: `s${n}`, cells: [[`${n},0`, { char }]], runs: [] });
  person.drawing.accept();
  person.drawing.artists = ['ann'];
  channel.send(JSON.stringify({ t: 'project-start', n: 5, epoch: 'e', bytes: 1, chunks: packed.length, took: 0 }));
  channel.send(change(4, 'x'));
  channel.send(change(5, 'y'));
  channel.send(change(6, 'z'));
  for (const chunk of packed) channel.send(chunk);
  channel.send(change(3, 'w'));
  channel.send(change(7, 'v'));
  await expect.poll(() => char(person.project, 7, 0), PATIENT).toBe('v');
  expect(open).toHaveBeenCalledOnce();
  expect(applied.mock.calls.map(([m]) => m.n)).toEqual([6, 7]);
  expect(char(person.project, 6, 0)).toBe('z');
  expect(char(person.project, 4, 0)).toBe(undefined);
  expect(char(person.project, 3, 0)).toBe(undefined);
});

test('a project reaching someone who didn\'t accept opens nothing', async () => {
  const room = await hosting();
  const person = await join(room, 'ann');
  const own = await createOwnDocument(person);
  room.project.startSharing({ send: () => {}, role: 'host', me: 'host' });
  room.host.setArtists(['ann']);   // the host just says so
  const w = room.host.open().find((other) => other.peer === 'ann');
  w.drawing = true;
  await room.host.sendProject(w);
  await wait(100);
  expect(person.project.documentId).toBe(own);
  expect(person.drawing.mayDraw).toBe(false);
});

test('a project that comes again keeps a stroke of mine that isn\'t numbered yet, and its document', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const id = ann.project.documentId;
  room.project.editCell(5, 5, { char: 'H' });
  room.project.commitEdit();
  await expect.poll(() => char(ann.project, 5, 5), PATIENT).toBe('H');

  const w = room.host.open().find((other) => other.peer === 'ann');
  const sharing = ann.project._sharing, send = sharing.send, held = [];
  sharing.send = (msg) => held.push(msg);   // on its way: the host hasn't got to it yet
  ann.project.editCell(6, 6, { char: 'A' });
  ann.project.commitEdit();
  expect(sharing.pending.size).toBe(1);
  await room.host.sendProject(w);
  await expect.poll(() => char(ann.project, 5, 5) === 'H' && ann.project.documentId === id && ann.project._sharing.pending.n === room.project._ledger.n, PATIENT).toBe(true);
  expect(char(ann.project, 6, 6)).toBe('A');
  expect(ann.project._sharing.pending.sum).toBe(room.project.editLayerSum());   // seeded before reapply
  expect(ann.drawing.mayDraw).toBe(true);
  sharing.send = send;
  for (const msg of held) send(msg);
  await allMatch(room, ann);
  expect(char(room.project, 6, 6)).toBe('A');
});

test('a project from a host is a stranger\'s: what doesn\'t fit opens nothing, and only a document\'s settings are taken', async () => {
  const room = await hosting();
  const person = await join(room, 'ann');
  const own = await createOwnDocument(person);
  const parts = await room.project.projectParts();
  const whole = { settings: { ...parts.settings }, imageBuffer: room.project.imageBuffer, paintBuffer: null, baseBuffer: null, editCells: new Map(), baseRecords: parts.baseRecords, erasedCells: [], migrated: false };
  const take = (over) => person.project.takeProject({ ...whole, ...over }, { n: 1, filename: 'x', send: () => {}, me: 'ann' });

  expect(await take({ editCells: new Map([['99999,0', { char: 'x' }]]) })).toBe(false);
  expect(await take({ editCells: new Map([['01,0', { char: 'x' }]]) })).toBe(false);
  expect(await take({ editCells: new Map([['1,0', { char: 'too many' }]]) })).toBe(false);
  expect(await take({ imageBuffer: new ArrayBuffer(4) })).toBe(false);
  expect(person.project.documentId).toBe(own);
  expect(person.project._sharing).toBe(null);

  expect(await take({ settings: { ...whole.settings, baseScale: -1 } })).toBe(false);   // a bad value refuses them all
  expect(person.project._sharing).toBe(null);

  const history = person.project.history;
  expect(await take({ settings: { ...whole.settings, _sharing: 'x', history: 'x', image: 'x', renderer: 'x' }, editCells: new Map([['299,4999', { char: 'p' }]]) })).toBe(true);
  expect(person.project.history).toBe(history);
  expect(typeof person.project.renderer).toBe('object');
  expect(person.project.baseScale).toBeGreaterThan(0);
  expect(person.project._sharing.role).toBe('artist');   // kept past the grid, for when it grows back
  expect(person.project.editCells.get('299,4999')).toEqual({ char: 'p' });
});

test('every way of opening a document stays refused for an artist once the project\'s in', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const id = ann.project.documentId;
  await ann.project.openParts({ settings: {}, imageBuffer: room.project.imageBuffer, editCells: new Map(), baseRecords: room.project.baseRecords, erasedCells: [] }, { filename: 'x' });
  expect(ann.project.documentId).toBe(id);
  expect(ann.project._takingProject).toBeFalsy();
});

test('a host\'s slider move reaches the artist and rerenders, with no history entry there', async () => {
  const room = await hosting();
  await settle(room.project);
  const ann = await artist(room, 'ann');
  await settle(ann.project);
  const send = vi.spyOn(room.host, 'sendAll');
  room.project.setSlider('brightness', 140);
  await wait(30);
  expect(send).not.toHaveBeenCalled();   // its end goes as one change
  room.project.setSlider('brightness', 70);
  room.project.commitSliders();
  await expect.poll(() => ann.project.brightness, PATIENT).toBe(70);
  expect(send.mock.calls.filter(([m]) => m.t === 'settings').map(([m]) => m.values.brightness)).toEqual([70]);
  expect(ann.project.history.canUndo).toBe(false);
  expect(room.project.history.canUndo).toBe(true);
  await settle(room.project);
  await settle(ann.project);
  await expect.poll(() => cellsKey(ann.project), PATIENT).toEqual(cellsKey(room.project));
});

test('the settings number joins the same sequence, so the next change follows it', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const before = room.project._ledger.n;
  room.project.setSlider('brightness', 70);
  room.project.commitSliders();
  await expect.poll(() => ann.project.brightness, PATIENT).toBe(70);
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  await expect.poll(() => char(ann.project, 1, 1), PATIENT).toBe('H');
  expect(room.project._ledger.n).toBe(before + 2);
  expect(ann.project._sharing.pending.n).toBe(before + 2);
  expect(room.project._ledger.tail.items.at(-2).t).toBe('settings');
});

test('a base message from the host writes the artist\'s base', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  room.host.sendAll({ t: 'base', n: room.project._ledger.note(), runs: [[1, 1, 2, RED]], records: { pins: [['3,3', 'P']] } });
  await expect.poll(() => ann.project.baseRecords.pins.get('3,3'), PATIENT).toBe('P');
  expect(ann.project.baseLayer.pixelAt(2, 1)).toMatchObject({ r: 255, g: 0, b: 0 });
  room.host.sendAll({ t: 'base', n: room.project._ledger.note(), runs: [[1, 1, 1, 99, BLUE]], records: {} });
  await wait(50);
  expect(ann.project.baseRecords.pins.get('3,3')).toBe('P');   // refused as a whole
});

test('the first accepted invitation keeps the host\'s strokes undoable, and drops a merge and what came before it', async () => {
  const room = await hosting();
  const { project } = room;
  project.editCell(1, 1, { char: 'a' });
  project.commitEdit();
  project.mergeDown();
  expect(project.canUndo).toBe(true);
  const merged = char(project, 2, 2);
  project.editCell(2, 2, { char: 'b' });
  project.commitEdit();
  dab(project, 7, 7);
  project.commitEdit();

  await artist(room, 'ann');
  project.undo();
  expect(painted(project, 7, 7)).toBe(null);
  project.undo();
  expect(char(project, 2, 2)).toBe(merged);
  expect(project.canUndo).toBe(false);
  project.redo();
  expect(char(project, 2, 2)).toBe('b');
});

test('later acceptances leave a host\'s undo alone', async () => {
  const room = await hosting();
  await artist(room, 'ann');
  room.project.editCell(2, 2, { char: 'b' });
  room.project.commitEdit();
  await artist(room, 'bob');
  room.project.undo();
  expect(char(room.project, 2, 2)).toBe(undefined);
});

test('when the list empties, the host\'s undo carries on, and takes back only the host\'s strokes', async () => {
  const room = await hosting();
  const { project } = room;
  const ann = await artist(room, 'ann');
  project.editCell(1, 1, { char: 'H' });
  project.commitEdit();
  ann.project.editCell(2, 2, { char: 'A' });
  ann.project.commitEdit();
  await expect.poll(() => char(project, 2, 2), PATIENT).toBe('A');
  await allMatch(room, ann);

  room.drawing.backToWatching('ann');
  expect(room.drawing.artists).toEqual([]);
  expect(project._sharing).toBe(null);
  await expect.poll(() => ann.drawing.mayDraw, PATIENT).toBe(false);
  expect(ann.project._sharing).toBe(null);
  expect(ann.project.canUndo).toBe(false);
  expect(char(ann.project, 2, 2)).toBe('A');   // the art stays open

  project.undo();
  expect(char(project, 1, 1)).toBe(undefined);
  expect(char(project, 2, 2)).toBe('A');
  expect(project.canUndo).toBe(false);
  project.redo();
  expect(char(project, 1, 1)).toBe('H');
});

test('invited again after going back to watching, an artist gets the art as it is now', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  room.drawing.backToWatching('ann');
  await expect.poll(() => ann.drawing.mayDraw, PATIENT).toBe(false);
  room.project.editCell(3, 3, { char: 'N' });
  room.project.commitEdit();
  room.drawing.invite('ann');
  await expect.poll(() => ann.drawing.invitation, PATIENT).toBe(true);
  ann.drawing.accept();
  await expect.poll(() => ann.drawing.mayDraw, PATIENT).toBe(true);
  expect(char(ann.project, 3, 3)).toBe('N');
  ann.project.editCell(4, 4, { char: 'A' });
  ann.project.commitEdit();
  await allMatch(room, ann);
});

test.each([
  ['a cell off the grid', { t: 'change', stroke: 's', cells: [['40,0', { char: 'x' }]], runs: [] }],
  ['a key the editor would never make', { t: 'change', stroke: 's', cells: [['01,0', { char: 'x' }]], runs: [] }],
  ['a character a cell can\'t hold', { t: 'change', stroke: 's', cells: [['1,0', { char: 'too many' }]], runs: [] }],
  ['a color that isn\'t one', { t: 'change', stroke: 's', cells: [['1,0', { fg: 'red' }]], runs: [] }],
  ['a run off the layer', { t: 'change', stroke: 's', cells: [], runs: [[0, 99999, 1, RED]] }],
  ['a run that isn\'t one', { t: 'change', stroke: 's', cells: [], runs: [[0, 0, 'x']] }],
  ['no stroke', { t: 'change', cells: [], runs: [] }],
  ['no cells', { t: 'change', stroke: 's', runs: [] }],
])('a change from an artist with %s is refused and the room carries on', async (_, bad) => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const sum = room.project.editLayerSum(), n = room.project._ledger.n;
  const projects = vi.spyOn(room.host, 'sendProject');
  ann.watch.post(bad);
  await expect.poll(() => projects.mock.calls.length, PATIENT).toBe(1);   // its screen is put right
  expect(room.project._ledger.n).toBe(n);
  expect(room.project.editLayerSum()).toBe(sum);
  expect(room.host.open().find((w) => w.peer === 'ann').took).toBe(1);
  expect(ann.watch.ready).toBe(true);
  ann.project.editCell(1, 1, { char: 'A' });
  ann.project.commitEdit();
  await expect.poll(() => char(room.project, 1, 1), PATIENT).toBe('A');
});

test('a change whose stroke is someone else\'s is refused the same way', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  bob.watch.sendChange({ stroke: 'shared', cells: [['1,1', { char: 'B' }]], runs: [] });
  await expect.poll(() => char(room.project, 1, 1), PATIENT).toBe('B');
  const projects = vi.spyOn(room.host, 'sendProject');
  ann.watch.sendChange({ stroke: 'shared', cells: [['2,2', { char: 'A' }]], runs: [] });
  await expect.poll(() => projects.mock.calls.length, PATIENT).toBe(1);
  expect(char(room.project, 2, 2)).toBe(undefined);
});

test('an undo the ledger can\'t do takes no number and sends no project', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const n = room.project._ledger.n, projects = vi.spyOn(room.host, 'sendProject');
  ann.watch.sendUndo('nothing-like-it');
  ann.watch.sendRedo(42);
  await wait(60);
  expect(room.project._ledger.n).toBe(n);
  expect(projects).not.toHaveBeenCalled();
  expect(ann.watch.ready).toBe(true);
});

// The batches: messages in one frame are one copy of the map and one refresh.
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
function countingMaps(project) {
  const copies = [];
  toStop.push(watch(() => project.editCells, (map) => copies.push(map), { flush: 'sync' }));
  return copies;
}

test('on the host, N changes in one frame are numbered and sent at once, with one map copy and one refresh', async () => {
  const room = await hosting();
  const { project } = room;
  project.startSharing({ send: (msg) => sent.push(msg), role: 'host', me: 'host' });
  const sent = [];
  const copies = countingMaps(project), refresh = vi.spyOn(project, 'refreshChanged');
  for (let i = 0; i < 20; i++) {
    expect(project.takeFromArtist('ann', { t: 'change', stroke: `s${i}`, cells: [[`${i},0`, { char: 'A' }]], runs: [[i, 2, 1, RED]] })).toBeTruthy();
  }
  expect(sent.map((m) => m.n)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));   // fan-out isn't delayed
  expect(project._ledger.n).toBe(20);
  expect(copies).toEqual([]);
  await nextFrame();
  await nextFrame();
  expect(copies.length).toBe(1);
  expect(refresh).toHaveBeenCalledOnce();
  for (let i = 0; i < 20; i++) expect(char(project, i, 0)).toBe('A');
  expect(project._ledger.sum).toBe(project.editLayerSum());
  project.stopSharing();
});

test('on the host, with no animation frames (a hidden tab), artists\' changes still land', async () => {
  const room = await hosting();
  const { project } = room;
  project.startSharing({ send: () => {}, role: 'host', me: 'host' });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  project.takeFromArtist('ann', { t: 'change', stroke: 's', cells: [['1,0', { char: 'A' }]], runs: [] });
  await expect.poll(() => char(project, 1, 0), PATIENT).toBe('A');
  project.stopSharing();
});

test('on the host, its own write over a change waiting for its frame stays on top, as the ledger has it', async () => {
  const room = await hosting();
  const { project } = room;
  const sent = [];
  project.startSharing({ send: (msg) => sent.push(msg), role: 'host', me: 'host' });
  project.takeFromArtist('ann', { t: 'change', stroke: 's', cells: [['1,0', { char: 'A' }]], runs: [] });
  project.editCell(1, 0, { char: 'H' });
  await nextFrame();
  await nextFrame();
  expect(char(project, 1, 0)).toBe('H');
  project.commitEdit();
  expect(char(project, 1, 0)).toBe('H');
  expect(sent.at(-1).cells).toEqual([['1,0', { char: 'H' }]]);
  expect(project._ledger.sum).toBe(project.editLayerSum());
  project.undo();
  expect(char(project, 1, 0)).toBe('A');
  expect(project._ledger.sum).toBe(project.editLayerSum());
  project.stopSharing();
});

test('on the host, a position taken back and written again in one frame starts from what was truly there', async () => {
  const room = await hosting();
  const { project } = room;
  project.startSharing({ send: () => {}, role: 'host', me: 'host' });
  project.takeFromArtist('ann', { t: 'change', stroke: 'a', cells: [['1,0', { char: 'A' }]], runs: [] });
  project.takeFromArtist('ann', { t: 'undo', stroke: 'a' });
  project.takeFromArtist('bob', { t: 'change', stroke: 'b', cells: [['1,0', { char: 'B' }]], runs: [] });
  project.takeFromArtist('bob', { t: 'undo', stroke: 'b' });
  await nextFrame();
  await nextFrame();
  expect(char(project, 1, 0)).toBe(undefined);
  expect(project._ledger.sum).toBe(project.editLayerSum());
  project.stopSharing();
});

test('on the host, undo right after a change in the same frame sees that change', async () => {
  const room = await hosting();
  const { project } = room;
  project.startSharing({ send: () => {}, role: 'host', me: 'host' });
  project.editCell(1, 0, { char: 'H' });
  project.commitEdit();
  project.takeFromArtist('ann', { t: 'change', stroke: 'a', cells: [['2,0', { char: 'A' }]], runs: [] });
  project.undo();
  expect(char(project, 1, 0)).toBe(undefined);
  expect(char(project, 2, 0)).toBe('A');
  await nextFrame();
  await nextFrame();
  expect(char(project, 2, 0)).toBe('A');
  project.stopSharing();
});

test('on the host, a change waiting for its frame isn\'t written into another document', async () => {
  const room = await hosting();
  const { project } = room;
  project.startSharing({ send: () => {}, role: 'host', me: 'host' });
  project.takeFromArtist('ann', { t: 'change', stroke: 'a', cells: [['2,0', { char: 'A' }]], runs: [[1, 1, 1, RED]] });
  project.newDocument();
  project.editCells = new Map();
  await nextFrame();
  await nextFrame();
  expect(char(project, 2, 0)).toBe(undefined);
  project.stopSharing();
});

test('what a project is sent with, the host\'s open stroke and changes waiting for their frame, is in it', async () => {
  const room = await hosting();
  const { project } = room;
  project.startSharing({ send: () => {}, role: 'host', me: 'host' });
  project.takeFromArtist('ann', { t: 'change', stroke: 'a', cells: [['2,0', { char: 'A' }]], runs: [] });
  project.editCell(3, 0, { char: 'H' });
  const { n } = project.projectNow();
  expect(n).toBe(project._ledger.n);
  expect(char(project, 2, 0)).toBe('A');
  expect(n).toBe(2);   // the open stroke's slice took a number
  project.stopSharing();
});

test('on an artist, N changes heard in one frame are one map copy and one refresh, in order', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const { project } = ann;
  await nextFrame();
  const copies = countingMaps(project), refresh = vi.spyOn(project, 'refreshChanged');
  const start = project._sharing.pending.n;
  for (let i = 1; i <= 20; i++) project.hearDrawing({ t: 'numbered', n: start + i, by: 'host', stroke: `s${i}`, cells: [['1,1', { char: String.fromCharCode(64 + i) }], [`${i},0`, { char: 'x' }]], runs: [[i, 2, 1, RED]] });
  expect(copies).toEqual([]);
  await nextFrame();
  await nextFrame();
  expect(copies.length).toBe(1);
  expect(refresh).toHaveBeenCalledOnce();
  expect(char(project, 1, 1)).toBe('T');
  expect(project._sharing.pending.n).toBe(start + 20);
  expect(project.editVersion).toBeGreaterThan(0);
});

test('on an artist, with no animation frames (a hidden tab), what\'s heard still lands', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  vi.stubGlobal('requestAnimationFrame', () => 1);
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  await expect.poll(() => char(ann.project, 1, 1), PATIENT).toBe('H');
});

test('a bad number from a host is ignored and the next one lands', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const channel = room.host.open().find((w) => w.peer === 'ann').channel, n = room.project._ledger.n;
  channel.send(JSON.stringify({ t: 'numbered', n: n + 1, by: 'host', stroke: 's', cells: [['99,99', { char: 'x' }]], runs: [] }));
  channel.send(JSON.stringify({ t: 'numbered', n: 'x', by: 'host', stroke: 's', cells: [], runs: [] }));
  channel.send(JSON.stringify({ t: 'numbered', n: n + 2, by: 'host', stroke: 's2', cells: [['1,1', { char: 'y' }]], runs: [] }));
  await expect.poll(() => char(ann.project, 1, 1), PATIENT).toBe('y');
  expect(ann.project.editCells.has('99,99')).toBe(false);
});

test('when the connection is lost an artist is paused, and when it\'s back it says hello again', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  ann.drawing.connection('lost');
  expect(ann.drawing.paused).toBe(true);
  ann.project.editCell(1, 1, { char: 'A' });
  expect(char(ann.project, 1, 1)).toBe(undefined);
  const hello = vi.spyOn(room.host, 'onHello');
  const n = ann.project._sharing.pending.n;
  ann.drawing.connection('live');
  ann.drawing.heardArtists(['ann']);
  expect(ann.drawing.paused).toBe(false);
  await expect.poll(() => hello.mock.calls.at(-1)?.[1]?.has, PATIENT).toBe(n);
  ann.project.editCell(1, 1, { char: 'A' });
  ann.project.commitEdit();
  await expect.poll(() => char(room.project, 1, 1), PATIENT).toBe('A');
});

test('a hello with a number the tail reaches gets the tail, and one it can\'t gets the project', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const w = room.host.open().find((other) => other.peer === 'ann');
  const has = room.project._ledger.n, epoch = room.project._ledger.epoch;
  room.host.setArtists(['ann']);
  w.drawing = false;   // the channel to it went quiet: the changes below don't reach it
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  await wait(30);
  expect(char(ann.project, 1, 1)).toBe(undefined);
  const projects = vi.spyOn(room.host, 'sendProject');
  ann.watch.post({ t: 'artist-hello', has, epoch });
  await expect.poll(() => char(ann.project, 1, 1), PATIENT).toBe('H');
  expect(projects).not.toHaveBeenCalled();
  ann.watch.post({ t: 'artist-hello', has: 0, epoch: 'another' });
  await expect.poll(() => projects.mock.calls.length, PATIENT).toBe(1);
});

test('cursors go to the artists with a name, at most about ten times a second', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  const sent = vi.spyOn(room.host, 'sendAll');
  for (let i = 0; i < 10; i++) ann.watch.sendCursor({ col: i, row: 1 }, { col: 0, row: 0, cols: 9, rows: 9 });
  await expect.poll(() => bob.drawing.cursors.ann?.at?.col, PATIENT).toBe(9);
  expect(bob.drawing.cursors.ann).toEqual({ at: { col: 9, row: 1 }, view: { col: 0, row: 0, cols: 9, rows: 9 }, name: 'ann' });
  expect(sent.mock.calls.filter(([m]) => m.t === 'cursors').length).toBeLessThan(4);
  expect(bob.drawing.showCursors).toBe(true);
});

test('the room store hands a Host and a Watch to the drawing store, and closing the room stops sharing', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  const room = useRoomStore(), drawing = useDrawingStore();
  room.hostRoom({ id: 'abcdefghij', room: { name: 'R' } });
  expect(room._host.onAnswer).toBeInstanceOf(Function);
  project.startSharing({ send: () => {}, role: 'host', me: 'host' });
  room.close();
  expect(project._sharing).toBe(null);
  expect(drawing.artists).toEqual([]);
});

test('a host\'s base edit reaches the artist, its undo too, as the same numbered sequence', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const pixel = () => ann.project.baseLayer.pixelAt(4, 4);
  const was = pixel();
  const n = room.project._ledger.n;
  room.project.writeBase([{ x: 4, y: 4, hex: '#00ff00' }]);
  room.project.commitEdit();
  await expect.poll(() => JSON.stringify(pixel()), PATIENT).not.toBe(JSON.stringify(was));
  expect(pixel()).toEqual(room.project.baseLayer.pixelAt(4, 4));
  expect(room.project._ledger.n).toBeGreaterThan(n);
  await expect.poll(() => ann.project._sharing.pending.n, PATIENT).toBe(room.project._ledger.n);
  room.project.undo();
  await expect.poll(() => JSON.stringify(pixel()), PATIENT).toBe(JSON.stringify(was));
  await expect.poll(() => ann.project._sharing.pending.n, PATIENT).toBe(room.project._ledger.n);
  expect(ann.project.history.canUndo).toBe(false);
});

test('a merge with an artist listed goes to everyone as the project, and is final', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const epoch = room.project._ledger.epoch;
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  await allMatch(room, ann);
  room.project.mergeDown();
  expect(room.project.canUndo).toBe(false);
  expect(room.project._ledger.epoch).not.toBe(epoch);
  await expect.poll(() => ann.project.baseRecords.pins.get('1,1'), PATIENT).toBe('H');
  expect(char(ann.project, 1, 1)).toBe(undefined);
  await allMatch(room, ann);
  ann.project.editCell(3, 3, { char: 'A' });
  ann.project.commitEdit();
  await allMatch(room, ann);
  expect(char(room.project, 3, 3)).toBe('A');
});

test('a grid resize goes to everyone as the project', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  await allMatch(room, ann);
  room.project.cols = 30;
  await expect.poll(() => ann.project.cols, PATIENT).toBe(30);
  await allMatch(room, ann);
  expect(char(ann.project, 1, 1)).toBe('H');
  expect(room.project.canUndo).toBe(false);
});

// Fix round: what strands someone, and what closes a channel.
test('a new connection with no lost before it says hello again, and numbers reach the artist', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const old = room.host.open().find((w) => w.peer === 'ann');
  await room.host.peer('ann', await passFor('ann'));   // the host meets them again: an offer, and Watch connects afresh
  await expect.poll(() => room.host.open().find((w) => w.peer === 'ann' && w !== old)?.drawing, PATIENT).toBe(true);
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  await expect.poll(() => char(ann.project, 1, 1), PATIENT).toBe('H');
});

test('an offer that replaces the connection, with no lost before it, has them say hello on the next list', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const post = vi.spyOn(ann.watch, 'post');
  ann.drawing.connection('connecting');   // what Watch.connect says, and all it says, on a new offer
  ann.drawing.heardArtists(['ann']);
  expect(post.mock.calls.filter(([m]) => m.t === 'artist-hello').length).toBe(1);
});

test('a list without me crossing my accept doesn\'t strand me: when I\'m listed I say hello', async () => {
  const room = await hosting();
  const ann = await join(room, 'ann');
  room.drawing.invite('ann');
  await expect.poll(() => ann.drawing.invitation, PATIENT).toBe(true);
  ann.drawing.accept();
  ann.drawing.heardArtists(['bob']);   // on its way before the host heard the accept
  await expect.poll(() => ann.drawing.mayDraw, PATIENT).toBe(true);
  expect(room.drawing.artists).toEqual(['ann']);
});

test('a withdrawal crossing an accept leaves no yes behind: being listed later opens nothing', async () => {
  const room = await hosting();
  const ann = await join(room, 'ann');
  const own = await createOwnDocument(ann);
  room.drawing.invite('ann');
  await expect.poll(() => ann.drawing.invitation, PATIENT).toBe(true);
  room.drawing.withdraw('ann');
  ann.drawing.accept();   // before the withdrawal lands
  await expect.poll(() => sessionStorage.getItem('phosphor-artist:room:ann'), PATIENT).toBe(null);
  room.project.startSharing({ send: () => {}, role: 'host', me: 'host' });
  room.host.setArtists(['ann']);
  await wait(100);
  expect(ann.project.documentId).toBe(own);
  expect(ann.drawing.mayDraw).toBe(false);
});

test('an artist put back to watching while away, leaving the list empty, hears so on reconnecting', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  room.host.drop('ann');
  room.drawing.backToWatching('ann');
  expect(room.drawing.artists).toEqual([]);
  expect(ann.drawing.mayDraw).toBe(true);   // it hasn't heard
  await room.host.peer('ann', await passFor('ann'));
  await expect.poll(() => ann.drawing.mayDraw, PATIENT).toBe(false);
  expect(ann.project._sharing).toBe(null);
});

test('a watcher hearing an empty list has nothing change', async () => {
  const room = await hosting();
  const person = await join(room, 'ann');
  const own = await createOwnDocument(person);
  await expect.poll(() => person.watch.ready, PATIENT).toBe(true);
  const stop = vi.spyOn(person.project, 'stopSharing'), edits = person.project.editVersion;
  person.drawing.heardArtists([]);
  expect(stop).not.toHaveBeenCalled();
  expect(person.project.documentId).toBe(own);
  expect(person.project.editVersion).toBe(edits);
  expect(person.drawing.paused).toBe(false);
  expect(person.drawing.mayDraw).toBe(false);
});

test('a base edit whose pins don\'t fit a message goes as the project, and the host\'s undo stays', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const sent = vi.spyOn(room.host, 'sendAll'), projects = vi.spyOn(room.host, 'sendProjectToAll');
  const pins = [];
  for (let col = 0; col < 40; col++) for (let row = 0; row < 20; row++) pins.push({ col, row, char: 'P' });
  for (let i = 0; i < 6; i++) room.project.setBaseRecords(withPins(room.project.baseRecords, pins.map((pin) => ({ ...pin, col: pin.col + 40 * i, row: pin.row + 20 * i }))));
  expect(JSON.stringify(serializeBase(room.project.baseRecords)).length).toBeGreaterThan(CHUNK_BYTES);
  room.project.writeBase([{ x: 4, y: 4, hex: '#00ff00' }]);
  room.project.commitEdit();
  expect(sent.mock.calls.filter(([m]) => m.t === 'base')).toEqual([]);
  expect(projects).toHaveBeenCalledOnce();
  await expect.poll(() => ann.project.baseRecords.pins.size, PATIENT).toBe(room.project.baseRecords.pins.size);
  expect(ann.project.baseLayer.pixelAt(4, 4)).toEqual(room.project.baseLayer.pixelAt(4, 4));
  expect(room.project.canUndo).toBe(true);
});

test('a big base edit with pins goes in messages that each fit', async () => {
  const room = await hosting();
  await artist(room, 'ann');
  const sent = vi.spyOn(room.host, 'sendAll'), projects = vi.spyOn(room.host, 'sendProjectToAll');
  const pins = [];
  for (let col = 0; col < 40; col++) for (let row = 0; row < 100; row++) pins.push({ col, row, char: 'P' });
  room.project.setBaseRecords(withPins(room.project.baseRecords, pins));
  const pixels = [];
  for (let x = 0; x < 40; x++) for (let y = 0; y < 40; y++) pixels.push({ x, y, hex: (x + y) % 2 ? '#00ff00' : '#ff00ff' });
  room.project.writeBase(pixels);
  room.project.commitEdit();
  const messages = sent.mock.calls.map(([m]) => m).filter((m) => m.t === 'base');
  expect(projects).not.toHaveBeenCalled();
  expect(messages.length).toBeGreaterThan(1);
  for (const message of messages) expect(JSON.stringify(message).length).toBeLessThanOrEqual(CHUNK_BYTES);
});

test('a hello gets the tail only if it reaches the last number; one taken without a message means the project', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const w = room.host.open().find((other) => other.peer === 'ann');
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  await expect.poll(() => char(ann.project, 1, 1), PATIENT).toBe('H');
  const has = room.project._ledger.n - 1, epoch = room.project._ledger.epoch;
  room.project._ledger.note();
  const projects = vi.spyOn(room.host, 'sendProject');
  room.host.onHello(w, { has, epoch });
  expect(projects).toHaveBeenCalledOnce();
});

// The check, and the backlog. Tests send a check when they want one; one looks at the timer.
const checkNow = (room) => room.host.sendCheck(room.project._ledger.n, room.project._ledger.sum);
const reach = (room, person) => expect.poll(() => person.project._sharing.pending.n, PATIENT).toBe(room.project._ledger.n);
const asks = (person) => {
  const post = vi.spyOn(person.watch, 'post');
  return () => post.mock.calls.filter(([m]) => m.t === 'artist-hello' && m.has === -1);
};
const seat = (room, sub) => room.host.open().find((w) => w.peer === sub);

// Holds every project the host packs until released.
function gatePacking(room) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; }), pack = room.host.project;
  room.host.project = () => {
    const made = pack();
    return { ...made, chunks: gate.then(() => made.chunks) };
  };
  return () => {
    room.host.project = pack;
    release();
  };
}

test('an edit layer changed behind a client\'s back, at a position a number then touches, re-fetches and matches', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann'), asked = asks(ann);
  const { epoch } = room.project._ledger;
  ann.project.editCells = new Map([['3,3', { char: 'Z' }], ['4,4', { char: 'X' }]]);
  room.project.editCell(3, 3, { char: 'H' });   // what the sum reads there isn't what it was told
  room.project.commitEdit();
  await reach(room, ann);
  expect(asked()).toEqual([]);
  checkNow(room);
  await expect.poll(() => asked().length, PATIENT).toBe(1);
  expect(asked()[0][0]).toEqual({ t: 'artist-hello', has: -1, epoch });
  await expect.poll(() => char(ann.project, 4, 4), PATIENT).toBe(undefined);
  expect(char(ann.project, 3, 3)).toBe('H');
  await allMatch(room, ann);
  checkNow(room);
  room.project.editCell(5, 5, { char: 'H' });
  room.project.commitEdit();
  await reach(room, ann);
  checkNow(room);
  await wait(50);
  expect(asked().length).toBe(1);
});

test('a number that never landed comes back with the re-fetch, paint too', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann'), asked = asks(ann);
  const hear = vi.spyOn(ann.project, 'hearDrawing').mockImplementationOnce(() => {});
  room.project.editCell(5, 5, { char: 'L' });
  dab(room.project, 8, 8);
  room.project.commitEdit();
  await expect.poll(() => hear.mock.calls.length, PATIENT).toBe(1);
  room.project.editCell(6, 6, { char: 'M' });
  room.project.commitEdit();
  await reach(room, ann);
  expect(char(ann.project, 5, 5)).toBe(undefined);
  checkNow(room);
  await expect.poll(() => char(ann.project, 5, 5), PATIENT).toBe('L');
  expect(painted(ann.project, 8, 8)).toEqual(painted(room.project, 8, 8));
  expect(asked().length).toBe(1);
  await allMatch(room, ann);
});

test('a re-fetch keeps a stroke of mine that isn\'t numbered yet', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  room.project.editCell(5, 5, { char: 'H' });
  room.project.commitEdit();
  await reach(room, ann);
  const w = seat(room, 'ann');
  ann.project.editCell(6, 6, { char: 'A' });   // still open, not even sliced
  ann.project.paintStroke([{ x: 2, y: 2, alpha: 0.5 }], '#ff0000');
  const release = gatePacking(room);
  const going = room.host.sendProject(w);
  room.project.editCell(6, 7, { char: 'H' });
  room.project.commitEdit();
  release();
  await going;
  await expect.poll(() => char(ann.project, 6, 7), PATIENT).toBe('H');
  expect(char(ann.project, 6, 6)).toBe('A');
  expect(painted(ann.project, 2, 2)).not.toBe(null);
  ann.project.commitEdit();
  await allMatch(room, ann);
  expect(char(room.project, 6, 6)).toBe('A');
  expect(painted(room.project, 2, 2)).toEqual(painted(ann.project, 2, 2));
});

test('a re-fetch doesn\'t lose changes numbered while it travels, and asks once', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann'), asked = asks(ann);
  const projects = vi.spyOn(room.host, 'sendProject');
  room.project.editCell(0, 0, { char: 'C' });   // a check at the number of the project it has just opened says nothing
  room.project.commitEdit();
  await reach(room, ann);
  ann.project._sharing.pending.seedSum(12345);
  const release = gatePacking(room);
  checkNow(room);
  await expect.poll(() => seat(room, 'ann').projecting, PATIENT).toBe(true);
  const { n } = room.project._ledger;
  room.project.editCell(1, 0, { char: 'D' });
  room.project.commitEdit();
  checkNow(room);
  // A check that gets through anyway, at what this artist has heard: it has asked already.
  seat(room, 'ann').channel.send(JSON.stringify({ t: 'check', n, sum: 1 }));
  await wait(50);
  expect(asked().length).toBe(1);
  expect(projects).toHaveBeenCalledOnce();
  room.project.editCell(2, 0, { char: 'E' });
  room.project.commitEdit();
  release();
  await expect.poll(() => char(ann.project, 2, 0), PATIENT).toBe('E');
  expect(char(ann.project, 1, 0)).toBe('D');
  await reach(room, ann);
  await allMatch(room, ann);
  room.project.editCell(3, 0, { char: 'F' });
  room.project.commitEdit();
  await reach(room, ann);
  checkNow(room);
  await wait(50);
  expect(asked().length).toBe(1);   // the project landed: it's quiet, and could ask again
  ann.project._sharing.pending.seedSum(12345);
  room.project.editCell(4, 0, { char: 'G' });
  room.project.commitEdit();
  await reach(room, ann);
  checkNow(room);
  await expect.poll(() => asked().length, PATIENT).toBe(2);
  await allMatch(room, ann);
});

test('a project crossing my changes drops those it holds, and what\'s numbered after it echoes', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const w = seat(room, 'ann'), { pending } = ann.project._sharing;
  // Numbered with its echo gone, as a queue discarded would: only the project can say so.
  w.drawing = false;
  ann.project.editCell(1, 1, { char: 'a' });
  ann.project.commitEdit();
  await expect.poll(() => char(room.project, 1, 1), PATIENT).toBe('a');
  w.drawing = true;
  expect(pending.size).toBe(1);

  const release = gatePacking(room);
  const going = room.host.sendProject(w);
  ann.project.editCell(2, 2, { char: 'b' });
  ann.project.commitEdit();
  await expect.poll(() => w.took, PATIENT).toBe(2);
  expect(pending.size).toBe(2);
  release();
  await going;
  await allMatch(room, ann);
  expect(pending.size).toBe(0);
  expect(char(ann.project, 1, 1)).toBe('a');
  expect(char(ann.project, 2, 2)).toBe('b');
  ann.project.editCell(3, 3, { char: 'c' });
  ann.project.commitEdit();
  await allMatch(room, ann);
});

test('an echo waiting for its frame when a project lands is counted once', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  ann.project.editCell(1, 1, { char: 'a' });
  ann.project.commitEdit();
  ann.project.editCell(2, 2, { char: 'b' });
  ann.project.commitEdit();
  const w = seat(room, 'ann');
  await expect.poll(() => w.took, PATIENT).toBe(2);
  await room.host.sendProject(w);
  await expect.poll(() => ann.project._sharing.pending.n, PATIENT).toBe(room.project._ledger.n);
  await allMatch(room, ann);
  expect(ann.project._sharing.pending.size).toBe(0);
});

test('a change the host refuses is taken back by the project that answers it, and later strokes echo', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  vi.spyOn(room.host, 'onChange').mockImplementationOnce(() => null);
  ann.project.editCell(1, 1, { char: 'R' });
  ann.project.commitEdit();
  expect(ann.project._sharing.pending.size).toBe(1);
  await expect.poll(() => ann.project._sharing.pending.size, PATIENT).toBe(0);
  await expect.poll(() => char(ann.project, 1, 1), PATIENT).toBe(undefined);
  expect(room.project.editCellAt(1, 1)).toBeFalsy();
  ann.project.editCell(2, 2, { char: 'A' });
  ann.project.commitEdit();
  await allMatch(room, ann);
  expect(char(room.project, 2, 2)).toBe('A');
});

test('the check stays quiet through a fill across 80 x 2000 with another artist drawing', async () => {
  const room = await hosting({ cols: 80, rows: 4000 });
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  const asksAnn = asks(ann), asksBob = asks(bob), projects = vi.spyOn(room.host, 'sendProject');
  const heard = vi.spyOn(ann.project, 'hearDrawing'), heardBob = vi.spyOn(bob.project, 'hearDrawing');
  const sends = vi.spyOn(room.host, 'sendAll');
  const before = room.project._ledger.n, list = [];
  for (let row = 0; row < 2000; row++) for (let col = 0; col < 80; col++) list.push({ col, row, attrs: { char: 'F', fg: '#ff0000' } });
  expect(list.length).toBe(160000);

  const started = performance.now();
  let stop = false;
  const drawing = (async () => {
    for (let i = 0; !stop; i++) {
      bob.project.editCell(i % 80, 3, { char: 'b' });
      bob.project.commitEdit();
      checkNow(room);
      await wait(20);
    }
  })();
  await wait(50);
  room.project.writeEditCells(list);
  room.project.commitEdit();
  const fills = sends.mock.calls.filter(([m]) => m.t === 'numbered' && m.by === 'host');
  expect(fills.length).toBeGreaterThan(10);   // it really did go as many numbered changes
  checkNow(room);
  const filled = room.project._ledger.n;
  await expect.poll(() => ann.project._sharing.pending.n >= filled, { timeout: 60_000 }).toBe(true);
  await expect.poll(() => bob.project._sharing.pending.n >= filled, { timeout: 60_000 }).toBe(true);
  await wait(100);
  stop = true;
  await drawing;
  bob.project.commitEdit();
  await allMatch(room, ann, bob);
  await reach(room, ann);
  await reach(room, bob);
  checkNow(room);
  for (const spy of [heard, heardBob]) await expect.poll(() => spy.mock.calls.filter(([m]) => m.t === 'check' && m.n === room.project._ledger.n).length, PATIENT).toBe(1);
  await wait(50);
  expect(ann.project._sharing.pending.sum).toBe(room.project._ledger.sum);
  expect(bob.project._sharing.pending.sum).toBe(room.project._ledger.sum);
  console.info(`fill across 160k cells, ${fills.length} numbered, to matching: ${Math.round(performance.now() - started)} ms`);
  expect(room.project._ledger.n).toBeGreaterThan(before + fills.length);
  expect(asksAnn()).toEqual([]);
  expect(asksBob()).toEqual([]);
  expect(projects).not.toHaveBeenCalled();
  expect([...room.project.editCells].length).toBe(160000);
}, 120_000);

test('an artist past the queue limit is sent the project once and catches up, and no one else waits', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  const w = seat(room, 'ann');
  let slow = true;
  Object.defineProperty(w.channel, 'bufferedAmount', { configurable: true, get: () => (slow ? 9 * 1024 * 1024 : 0) });
  const projects = vi.spyOn(room.host, 'sendProject');
  const packing = vi.spyOn(room.host, 'project');

  room.project.editCell(1, 0, { char: 'q' });   // queued, then discarded
  room.project.commitEdit();
  ann.project.editCell(2, 0, { char: 'a' });    // its echo too
  ann.project.commitEdit();
  await expect.poll(() => w.took, PATIENT).toBe(1);
  await expect.poll(() => char(bob.project, 2, 0), PATIENT).toBe('a');   // bob keeps up
  expect(w.queue.length).toBeGreaterThan(0);
  for (let i = 0; i < 64 && !w.again; i++) room.host.deliver(w, JSON.stringify({ t: 'cursors', pad: 'x'.repeat(1024 * 1024) }));
  expect(w.queue).toEqual([]);

  room.project.editCell(3, 0, { char: 'd' });   // after the discard
  room.project.commitEdit();
  await expect.poll(() => char(bob.project, 3, 0), PATIENT).toBe('d');
  ann.project.editCell(4, 0, { char: 'e' });
  ann.project.commitEdit();
  await expect.poll(() => w.took, PATIENT).toBe(2);
  await wait(30);
  expect(packing).not.toHaveBeenCalled();
  expect(ann.project._sharing.pending.size).toBe(2);
  expect(char(ann.project, 3, 0)).toBe(undefined);

  slow = false;
  w.channel.dispatchEvent(new Event('bufferedamountlow'));
  await expect.poll(() => char(ann.project, 3, 0), PATIENT).toBe('d');
  await allMatch(room, ann, bob);
  expect(packing).toHaveBeenCalledOnce();
  expect(projects).toHaveBeenCalledOnce();
  expect(w.projecting).toBe(false);
  expect(char(ann.project, 1, 0)).toBe('q');
  ann.project.editCell(5, 0, { char: 'f' });
  ann.project.commitEdit();
  await allMatch(room, ann, bob);
  checkNow(room);
  await wait(50);
  expect(projects).toHaveBeenCalledOnce();
});

test('more numbers than a watcher may have waiting, arriving while a project opens, don\'t cut an artist off', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const take = ann.project.takeProject.bind(ann.project);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  vi.spyOn(ann.project, 'takeProject').mockImplementation(async (...args) => {
    await gate;
    return take(...args);
  });
  const w = seat(room, 'ann');
  await room.host.sendProject(w);
  for (let i = 0; i < 1500; i++) {
    room.project.editCell(i % 40, 7, { char: String.fromCharCode(65 + (i % 26)) });
    room.project.commitEdit();
  }
  await wait(300);
  release();
  await reach(room, ann);
  expect(ann.watch.ready).toBe(true);
  await allMatch(room, ann);
});

test('a different base layer doesn\'t count as a mismatch', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann'), asked = asks(ann);
  ann.project.baseLayer.writeRuns([[1, 1, 3, RED]]);
  room.project.writeBase([{ x: 9, y: 9, hex: '#00ff00' }]);
  room.project.commitEdit();
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  await reach(room, ann);
  checkNow(room);
  await wait(60);
  expect(asked()).toEqual([]);
});

test('a check is compared at its own number: changes waiting for the frame land first, and one ahead or behind says nothing', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann'), asked = asks(ann);
  const { project } = ann, n = project._sharing.pending.n, sum = project._sharing.pending.sum;
  await nextFrame();
  const entry = { char: 'x' };
  project.hearDrawing({ t: 'numbered', n: n + 1, by: 'host', stroke: 's', cells: [['1,1', entry]], runs: [] });
  project.hearDrawing({ t: 'check', n: n + 1, sum: sum ^ hashCell('1,1', entry) });
  project.hearDrawing({ t: 'check', n: n + 2, sum: 99 });
  project.hearDrawing({ t: 'check', n: n, sum: 99 });
  project.flushHeard();
  expect(project._sharing.pending.n).toBe(n + 1);
  expect(asked()).toEqual([]);
  project.hearDrawing({ t: 'check', n: n + 1, sum: 99 });
  project.flushHeard();
  expect(asked().length).toBe(1);
});

test('paused, a check isn\'t compared, and a new connection may ask again', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann'), asked = asks(ann);
  const { project } = ann, n = project._sharing.pending.n;
  ann.drawing.connection('lost');
  project.hearDrawing({ t: 'check', n, sum: 99 });
  project.flushHeard();
  expect(asked()).toEqual([]);
  ann.drawing.connection('live');
  project.hearDrawing({ t: 'check', n, sum: 99 });
  project.flushHeard();
  expect(asked().length).toBe(1);
  project.hearDrawing({ t: 'check', n, sum: 98 });
  project.flushHeard();
  expect(asked().length).toBe(1);
  ann.drawing.connection('connecting');
  project.hearDrawing({ t: 'check', n, sum: 98 });
  project.flushHeard();
  expect(asked().length).toBe(2);
});

test('the check goes on a timer, to artists only, says nothing when nothing changed, and stops with the sharing', async () => {
  expect(CHECK_EVERY_MS).toBe(2000);
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const watcher = await join(room, 'wes');
  const checks = vi.spyOn(ann.watch, 'onCheck'), theirs = vi.spyOn(watcher.watch, 'onCheck');
  const sent = vi.spyOn(room.host, 'sendCheck');
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  await expect.poll(() => checks.mock.calls.length, { timeout: CHECK_EVERY_MS + 1000 }).toBe(1);
  expect(checks.mock.calls[0][0]).toMatchObject({ t: 'check', n: room.project._ledger.n, sum: room.project._ledger.sum });
  await wait(CHECK_EVERY_MS + 100);
  expect(checks.mock.calls.length).toBe(1);   // the same number
  expect(theirs).not.toHaveBeenCalled();
  room.drawing.backToWatching('ann');
  const calls = sent.mock.calls.length;
  await wait(CHECK_EVERY_MS + 100);
  expect(sent.mock.calls.length).toBe(calls);
}, 20_000);

test('a host\'s open stroke isn\'t in the sum until it\'s numbered, so the check stays quiet either side of its slice', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann'), asked = asks(ann);
  const { sum, n } = room.project._ledger;
  room.project.editCell(4, 4, { char: 'H' });
  dab(room.project, 6, 6);
  expect(room.project._ledger.sum).toBe(sum);
  expect(room.project._ledger.n).toBe(n);
  checkNow(room);
  await wait(30);
  room.project.commitEdit();
  await reach(room, ann);
  checkNow(room);
  await wait(30);
  expect(asked()).toEqual([]);
  await allMatch(room, ann);
});

test('a project sent while the host has a stroke open holds it, and the sum follows', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann'), asked = asks(ann);
  room.project.editCell(4, 4, { char: 'H' });
  await room.host.sendProject(seat(room, 'ann'));
  await expect.poll(() => char(ann.project, 4, 4), PATIENT).toBe('H');
  room.project.editCell(4, 5, { char: 'H' });
  room.project.commitEdit();
  await reach(room, ann);
  checkNow(room);
  await wait(30);
  expect(asked()).toEqual([]);
  await allMatch(room, ann);
});

test('a grid resize with the host\'s stroke open counts that stroke once in the sum', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann'), asked = asks(ann);
  room.project.editCell(4, 4, { char: 'H' });
  room.project.shareWholeDocument();
  room.project.commitEdit();
  expect(room.project._ledger.sum).toBe(room.project.editLayerSum());
  await expect.poll(() => char(ann.project, 4, 4), PATIENT).toBe('H');
  await reach(room, ann);
  checkNow(room);
  await wait(30);
  expect(asked()).toEqual([]);
  await allMatch(room, ann);
});

test('soft paint through a project stays what the sum says, so a check after it is quiet', async () => {
  const room = await hosting();
  for (let i = 0; i < 20; i++) room.project.paintStroke([{ x: i, y: 4, alpha: (i + 1) / 21 }], '#3377cc');
  room.project.commitEdit();
  const ann = await artist(room, 'ann'), asked = asks(ann);
  for (let i = 0; i < 20; i++) ann.project.paintStroke([{ x: i, y: 6, alpha: (i + 1) / 21 }], '#cc7733');
  ann.project.commitEdit();
  for (let i = 0; i < 20; i++) room.project.paintStroke([{ x: i, y: 8, alpha: (i + 1) / 21 }], '#77cc33');
  room.project.commitEdit();
  await allMatch(room, ann);
  await reach(room, ann);
  checkNow(room);
  await wait(30);
  expect(asked()).toEqual([]);
  expect(ann.project._sharing.pending.sum).toBe(room.project._ledger.sum);
});

test('an accept that didn\'t get an answer before the connection went doesn\'t leave the next list ignored', async () => {
  for (const state of ['connecting', 'lost', 'failed']) {
    const room = await hosting();
    const ann = await join(room, 'ann');
    room.drawing.invite('ann');
    await expect.poll(() => ann.drawing.invitation, PATIENT).toBe(true);
    ann.drawing.accept();
    expect(sessionStorage.getItem('phosphor-artist:room:ann')).toBe('1');
    ann.drawing.connection(state);
    ann.drawing.heardArtists([]);   // the new connection's list: the host never heard it
    expect(sessionStorage.getItem('phosphor-artist:room:ann')).toBe(null);
  }
});

// Fix round: undo through a project, an ask that isn't answered, and the bigger cap.
const SELECTED = { col: 1, row: 1, cols: 2, rows: 2 };

test('a re-fetch keeps my undo and selection: undo still takes back my earlier stroke, and one left open ends', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const workspace = useWorkspaceStore();   // ann's: hers is the pinia joined last
  ann.project.editCell(1, 1, { char: 'a' });
  ann.project.commitEdit();
  await allMatch(room, ann);
  workspace.selection = SELECTED;
  const epoch = room.project._ledger.epoch;
  ann.project.editCell(2, 2, { char: 'b' });   // open
  await room.host.sendProject(seat(room, 'ann'));
  await expect.poll(() => ann.project._stroke, PATIENT).toBe(null);
  await allMatch(room, ann);
  expect(room.project._ledger.epoch).toBe(epoch);
  expect(workspace.selection).toEqual(SELECTED);
  expect(ann.project.history.canUndo).toBe(true);
  ann.project.undo();
  await expect.poll(() => char(ann.project, 2, 2), PATIENT).toBe(undefined);
  ann.project.undo();
  await expect.poll(() => char(ann.project, 1, 1), PATIENT).toBe(undefined);
  await expect.poll(() => char(room.project, 1, 1), PATIENT).toBe(undefined);
  await allMatch(room, ann);
  ann.project.redo();
  await expect.poll(() => char(room.project, 1, 1), PATIENT).toBe('a');
});

test('a merge resets it: undo has nothing for me, and the selection goes', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const workspace = useWorkspaceStore();
  ann.project.editCell(1, 1, { char: 'a' });
  ann.project.commitEdit();
  await allMatch(room, ann);
  workspace.selection = SELECTED;
  expect(ann.project.history.canUndo).toBe(true);
  room.project.mergeDown();
  await expect.poll(() => char(ann.project, 1, 1), PATIENT).toBe(undefined);
  await allMatch(room, ann);
  expect(ann.project.history.canUndo).toBe(false);
  expect(workspace.selection).toBe(null);
});

function askTimers() {
  const set = vi.spyOn(globalThis, 'setTimeout');
  const made = () => set.mock.calls.flatMap(([fn, ms], i) => (ms === ASK_AGAIN_MS ? [{ fn, id: set.mock.results[i].value }] : []));
  return Object.assign(() => made().map(({ fn }) => fn), { lastId: () => made().at(-1).id });
}

async function drifted(room, ann) {
  room.project.editCell(0, 0, { char: 'C' });
  room.project.commitEdit();
  await reach(room, ann);
  ann.project._sharing.pending.seedSum(12345);
  ann.project.hearDrawing({ t: 'check', n: ann.project._sharing.pending.n, sum: room.project._ledger.sum });
  ann.project.flushHeard();
}

test('an ask no project answers goes again after a long wait, and stops when one lands', async () => {
  expect(ASK_AGAIN_MS).toBe(30_000);
  const room = await hosting();
  const ann = await artist(room, 'ann'), asked = asks(ann);
  const timers = askTimers(), stop = vi.spyOn(globalThis, 'clearTimeout');
  const hello = vi.spyOn(room.host, 'onHello').mockImplementation(() => {});   // no answer
  await drifted(room, ann);
  expect(asked().length).toBe(1);
  await expect.poll(() => hello.mock.calls.length, PATIENT).toBe(1);
  expect(timers().length).toBe(1);
  ann.project.hearDrawing({ t: 'check', n: ann.project._sharing.pending.n, sum: 1 });
  ann.project.flushHeard();
  expect(asked().length).toBe(1);   // not a moment sooner
  timers()[0]();
  expect(asked().length).toBe(2);
  await expect.poll(() => hello.mock.calls.length, PATIENT).toBe(2);
  hello.mockRestore();
  timers().at(-1)();
  expect(asked().length).toBe(3);
  await expect.poll(() => ann.project._sharing.asked, PATIENT).toBe(false);
  await allMatch(room, ann);
  expect(stop.mock.calls.some(([id]) => id === timers.lastId())).toBe(true);
});

test('a project that fails to open shows its notice, and it\'s asked for no sooner than the long wait', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann'), asked = asks(ann);
  const timers = askTimers(), sends = vi.spyOn(room.host, 'sendProject');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const open = vi.spyOn(ann.project, 'openFromHost').mockRejectedValueOnce(new Error('no'));
  await drifted(room, ann);
  await expect.poll(() => ann.drawing.notice, PATIENT).toBeTruthy();
  ann.project.hearDrawing({ t: 'check', n: ann.project._sharing.pending.n, sum: 1 });
  ann.project.flushHeard();
  await wait(60);
  expect(asked().length).toBe(1);
  expect(sends).toHaveBeenCalledOnce();
  timers().at(-1)();
  await expect.poll(() => open.mock.calls.length, PATIENT).toBe(2);
  await expect.poll(() => ann.project._sharing.asked, PATIENT).toBe(false);
  await allMatch(room, ann);
});

test('a project that failed unasked doesn\'t stop a later check from asking', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann'), asked = asks(ann);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(ann.project, 'openFromHost').mockRejectedValueOnce(new Error('no'));
  await room.host.sendProject(seat(room, 'ann'));
  await expect.poll(() => ann.drawing.notice, PATIENT).toBeTruthy();
  await drifted(room, ann);
  expect(asked().length).toBe(1);
  await expect.poll(() => ann.project._sharing.asked, PATIENT).toBe(false);
  await allMatch(room, ann);
});

const flood = (person) => {
  for (let i = 0; i < 1100; i++) person.watch.hear('not json', person.watch.conn);
};

test('from project-start, before the first project has unpacked, an artist may have more waiting', async () => {
  const room = await hosting();
  const ann = await join(room, 'ann');
  ann.drawing.accept();
  ann.drawing.artists = ['ann'];
  ann.watch.projectStart({ n: 1, epoch: 'e', bytes: 1, chunks: 1, took: 0 });
  flood(ann);
  ann.watch.project = null;
  expect(ann.watch.ready).toBe(true);
});

test('a project sent to someone who hasn\'t said yes doesn\'t let a host fill their memory', async () => {
  const room = await hosting();
  const wes = await join(room, 'wes');
  room.project.startSharing({ send: () => {}, role: 'host', me: 'host' });
  const w = seat(room, 'wes');
  w.drawing = true;
  await room.host.sendProject(w);
  await expect.poll(() => wes.watch.projectN, PATIENT).toBeGreaterThanOrEqual(0);
  flood(wes);
  expect(wes.watch.ready).toBe(false);
});

test('an accept the host no longer holds is answered, and leaves nothing behind on their side', async () => {
  const room = await hosting();
  const ann = await join(room, 'ann');
  room.drawing.invite('ann');
  await expect.poll(() => ann.drawing.invitation, PATIENT).toBe(true);
  room.drawing.invited = [];   // gone from the host's list, as it is when their channel drops
  ann.drawing.accept();
  const key = 'phosphor-artist:room:ann';
  expect(sessionStorage.getItem(key)).toBe('1');
  await expect.poll(() => sessionStorage.getItem(key), PATIENT).toBe(null);
  expect(ann.drawing.invitation).toBe(false);
  expect(room.drawing.artists).toEqual([]);

  // Asked again, it all works, and the art comes up in view as a first accept does.
  room.drawing.invite('ann');
  await expect.poll(() => ann.drawing.invitation, PATIENT).toBe(true);
  ann.drawing.accept();
  await expect.poll(() => ann.drawing.mayDraw, PATIENT).toBe(true);
});

test('an accept from someone already listed isn\'t answered with a withdrawal', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const tell = vi.spyOn(room.host, 'tell');
  room.host.onAnswer('ann', true);
  expect(tell).not.toHaveBeenCalled();
  expect(ann.drawing.mayDraw).toBe(true);
});

test('a host back from a reload keeps invitations until those it\'s waiting for have come or won\'t', async () => {
  const room = await hosting();
  room.host.onWatchers = room.drawing.peopleHere;
  room.host.returnWithinMs = 100;
  const [annPass, bobPass] = [await passFor('ann'), await passFor('bob')];
  room.host.restore({ log: [], only: [], removed: [], muted: [], here: [{ sub: 'ann', pass: annPass }, { sub: 'bob', pass: bobPass }, { sub: 'cat', pass: await passFor('cat') }] });
  room.drawing.resumeHosting({ invited: ['ann', 'bob', 'cat'] });

  // The first of them back, before the server has said who's inside.
  room.drawing.peopleHere([{ peer: 'ann', sub: 'ann', connected: false }]);
  expect(room.drawing.invited).toEqual(['ann', 'bob', 'cat']);

  // Cat isn't inside: gone. Bob is, and may still come.
  room.host.settle([{ peer: 'ann', pass: annPass }, { peer: 'bob', pass: bobPass }]);
  expect(room.drawing.invited).toEqual(['ann', 'bob']);
  room.drawing.peopleHere([{ peer: 'ann', sub: 'ann', connected: false }]);
  expect(room.drawing.invited).toEqual(['ann', 'bob']);

  // Bob never connects.
  await expect.poll(() => room.drawing.invited, PATIENT).toEqual([]);
});

test('someone gone takes their invitation, and an invitee who connects is told again', async () => {
  const room = await hosting();
  room.host.onWatchers = room.drawing.peopleHere;
  const ann = await join(room, 'ann');
  room.drawing.invite('ann');
  await expect.poll(() => ann.drawing.invitation, PATIENT).toBe(true);
  room.drawing.peopleHere([]);
  expect(room.drawing.invited).toEqual([]);

  // Restored from before a reload, this person arrives knowing nothing.
  room.drawing.resumeHosting({ invited: ['bob'] });
  const bob = await join(room, 'bob');
  await expect.poll(() => bob.drawing.invitation, PATIENT).toBe(true);
});

test('a new connection clears the notice: if the host still means it, it says so again', async () => {
  const room = await hosting();
  const ann = await join(room, 'ann');
  room.drawing.invite('ann');
  await expect.poll(() => ann.drawing.invitation, PATIENT).toBe(true);
  ann.drawing.connection('connecting');
  expect(ann.drawing.invitation).toBe(false);
});

test('catching up with no answer asks for the project again after a long wait, and drawing goes on when it lands', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const asked = asks(ann), timers = askTimers();
  const hello = vi.spyOn(room.host, 'onHello').mockImplementation(() => {});   // says nothing
  ann.drawing.connection('connecting');
  ann.drawing.connection('live');
  expect(ann.drawing.paused).toBe(true);
  ann.drawing.heardArtists(['ann']);
  expect(timers().length).toBe(1);
  expect(asked()).toEqual([]);

  timers()[0]();
  expect(asked().length).toBe(1);
  await expect.poll(() => hello.mock.calls.length, PATIENT).toBeGreaterThan(1);
  expect(ann.drawing.paused).toBe(true);

  hello.mockRestore();
  timers().at(-1)();
  await expect.poll(() => ann.drawing.paused, PATIENT).toBe(false);
  expect(ann.project._paused).toBe(false);
  await allMatch(room, ann);
});

test('a project that can\'t be opened while catching up keeps asking, rather than stopping there', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const asked = asks(ann), timers = askTimers();
  const take = vi.spyOn(ann.project, 'takeProject').mockResolvedValueOnce(false);
  vi.spyOn(room.host, 'onHello').mockImplementationOnce((w) => room.host.sendProject(w));
  ann.drawing.connection('connecting');
  ann.drawing.connection('live');
  ann.drawing.heardArtists(['ann']);
  await expect.poll(() => take.mock.calls.length, PATIENT).toBe(1);
  await expect.poll(() => ann.drawing.notice, PATIENT).toBe('The room\'s art couldn\'t be opened.');
  expect(ann.drawing.paused).toBe(true);

  timers().at(-1)();
  expect(asked().length).toBe(1);
  await expect.poll(() => ann.drawing.paused, PATIENT).toBe(false);
});

test('an answer that lands stops the wait', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const timers = askTimers(), stop = vi.spyOn(globalThis, 'clearTimeout');
  ann.drawing.connection('connecting');
  ann.drawing.connection('live');
  ann.drawing.heardArtists(['ann']);
  const id = timers.lastId();
  await expect.poll(() => ann.drawing.paused, PATIENT).toBe(false);
  expect(stop.mock.calls.some(([one]) => one === id)).toBe(true);
});


test('a watcher is told the names of the artists, and follows one: their view reaches it, also when they scroll without moving the pointer', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const wes = await join(room, 'wes');
  await expect.poll(() => wes.drawing.artistNames, PATIENT).toEqual({ ann: 'ann' });
  const heard = [];
  wes.watch.onView = (view, who) => heard.push([view, who]);
  wes.watch.follow('ann');
  ann.watch.sendCursor({ col: 1, row: 1 }, { col: 2, row: 3, cols: 9, rows: 9 });
  await expect.poll(() => heard.at(-1), PATIENT).toEqual([{ col: 2, row: 3, cols: 9, rows: 9, zoom: 1 }, 'ann']);

  setActivePinia(ann.pinia);
  const workspace = useWorkspaceStore();
  Object.assign(workspace, { viewTab: 'output', ansiViewOrigin: { col: 7, row: 8 }, ansiViewSize: { cols: 5, rows: 4 } });
  ann.drawing.viewMoved();   // what the viewport does when the view moves
  await expect.poll(() => heard.at(-1), PATIENT).toEqual([{ col: 7, row: 8, cols: 5, rows: 4, zoom: 1 }, 'ann']);
  ann.drawing.pointAt({ col: 3, row: 3 });
  ann.drawing.viewMoved();
  await expect.poll(() => room.drawing.cursors.ann?.at, PATIENT).toEqual({ col: 3, row: 3 });   // the pointer stays where it was
});

test('the host\'s own view is not an artist\'s: it is never sent as one', async () => {
  const room = await hosting();
  await artist(room, 'ann');
  const wes = await join(room, 'wes');
  const heard = [];
  wes.watch.onView = (view, who) => heard.push([view, who]);
  wes.watch.follow('host');
  room.drawing.pointAt({ col: 1, row: 1 });
  room.host.setView({ col: 4, row: 4, cols: 2, rows: 2 });
  await expect.poll(() => heard.at(-1), PATIENT).toEqual([{ col: 4, row: 4, cols: 2, rows: 2, zoom: 1 }, undefined]);
  expect(heard.filter(([, who]) => who !== undefined)).toEqual([]);
});

// Handing over. What RoomStore does on the server's new-host, for each side of it: a new Host in the chosen
// one's pinia with its own relay, everyone else's Watch dropped, and each met by the new Host as a new peer.
async function newHostIs(room, chosen, { planned, former = null } = {}) {
  const others = [...room.people.values()].filter((person) => person !== chosen);
  const next = { project: chosen.project, drawing: chosen.drawing, people: new Map(others.map((person) => [person.sub, person])) };
  next.host = new Host({
    config, passKey, roomId: 'room',
    send: async (msg) => {
      if (msg.type !== 'signal-to') return;
      await later();
      next.people.get(msg.to)?.watch.signalFrom('host', msg.data);
    },
    ...chosen.drawing.hostCallbacks(),
  });
  next.host.onWatchers = (list) => chosen.drawing.peopleHere(list);
  chosen.watch.close();
  chosen.drawing.hosted(next.host, { me: () => chosen.sub });
  chosen.drawing.takeOver(next.host, { planned });
  chosen.drawing.hostingAgain({ tookOver: true });
  next.host.setRoom({ name: 'Night shift', welcome: '' });
  toStop.push(() => next.host.close());
  for (const person of others) {
    person.watch.close();
    person.drawing.connection('lost');
    person.drawing.hostChanged({ planned });
    person.watch.send = async (msg) => { await later(); next.host.signalFrom(person.sub, msg.data); };
  }
  if (former) {   // the old host, in the room again as an artist on a new Watch of its own
    room.host.close();
    const { project, drawing } = room;
    setActivePinia(room.pinia);
    const person = { sub: former, project, drawing };
    person.watch = new Watch({
      config, roomId: 'room', passKey,
      send: async (msg) => { await later(); next.host.signalFrom(former, msg.data); },
      onRoom: () => {}, onArt: () => {}, onView: () => {},
      onState: (state) => drawing.connection(state),
      ...drawing.watchCallbacks(),
    });
    drawing.watching(person.watch, { me: () => former, roomId: 'room', roomName: () => 'Night shift' });
    drawing.becomeArtist();
    next.people.set(former, person);
    others.push(person);
    toStop.push(() => person.watch.close());
    next.former = person;
  }
  const listed = others.map((person) => person.sub);
  chosen.drawing.artistsNow(listed);
  for (const person of others) await next.host.peer(person.sub, await passFor(person.sub));
  await expect.poll(() => others.every((person) => person.watch.ready && !person.drawing.paused), PATIENT).toBe(true);
  return next;
}

// A planned handover from the host in `room` to `chosen`: over the channel, and then as the server answers.
async function plannedHandOver(room, chosen) {
  setActivePinia(room.pinia);
  const asked = room.drawing.makeHost(chosen.sub);
  await expect.poll(() => sentHandOver(room), PATIENT).toBe(chosen.sub);
  const next = await newHostIs(room, chosen, { planned: true, former: 'host' });
  await asked;
  return next;
}
const sentHandOver = (room) => room.socket?.find((msg) => msg.type === 'hand-over')?.to;

// A host whose socket's messages are kept.
async function hostingWithSocket() {
  const room = await hosting();
  room.pinia = getActivePinia();
  room.socket = [];
  const send = room.host.send;
  room.host.send = (msg) => { room.socket.push(msg); return send(msg); };
  room.host.onWatchers = (list) => room.drawing.peopleHere(list);
  return room;
}

test('a planned handover keeps everyone\'s undo: undo after it still takes back only mine', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  ann.project.editCell(1, 1, { char: 'A' });
  ann.project.commitEdit();
  bob.project.editCell(1, 1, { char: 'B' });
  bob.project.commitEdit();
  dab(bob.project, 9, 9);
  bob.project.commitEdit();
  await allMatch(room, ann, bob);

  const next = await plannedHandOver(room, ann);
  expect(ann.project.canUndo).toBe(true);
  expect(bob.project.canUndo).toBe(true);
  expect(room.project.canUndo).toBe(true);
  expect(ann.project._sharing.role).toBe('host');
  expect(room.project._sharing.role).toBe('artist');

  bob.project.undo();   // the dab
  await expect.poll(() => painted(ann.project, 9, 9), PATIENT).toEqual(null);
  bob.project.undo();
  await expect.poll(() => char(ann.project, 1, 1), PATIENT).toBe('A');
  ann.project.undo();   // on the new host: the ledger came with it
  await expect.poll(() => char(bob.project, 1, 1), PATIENT).toBe('H');
  room.project.undo();  // on the old host: now it asks the new one
  expect(char(room.project, 1, 1)).toBe('H');
  await expect.poll(() => char(ann.project, 1, 1), PATIENT).toBe(undefined);
  await expect.poll(() => char(room.project, 1, 1), PATIENT).toBe(undefined);
  await allMatch(next, bob, next.former);
});

test('after a planned handover, the old host\'s undo can\'t move the room\'s sliders', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  room.project.setSlider('brightness', 140);
  room.project.commitSliders();
  await expect.poll(() => ann.project.brightness, PATIENT).toBe(140);
  await plannedHandOver(room, ann);
  room.project.undo();
  expect(room.project.brightness).toBe(140);
});

test('a sudden handover keeps all the drawing, empties undo and shows the notice', async () => {
  const room = await hosting();
  room.pinia = getActivePinia();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  ann.project.editCell(1, 1, { char: 'A' });
  ann.project.commitEdit();
  bob.project.editCell(2, 2, { char: 'B' });
  bob.project.commitEdit();
  dab(room.project, 5, 5);
  room.project.commitEdit();
  await allMatch(room, ann, bob);
  const n = ann.project._sharing.pending.n;
  ann.drawing.connection('lost');
  bob.drawing.connection('lost');
  room.host.close();
  room.people.delete('ann');

  const next = await newHostIs(room, ann, { planned: false });
  expect(ann.project._ledger.n).toBe(n);   // the numbering goes on
  expect(ann.project._ledger.sum).toBe(ann.project.editLayerSum());
  expect(ann.project.canUndo).toBe(false);
  expect(bob.project.canUndo).toBe(false);
  expect(bob.drawing.notice).toContain('undo starts over');
  expect(ann.drawing.notice).toContain('undo starts over');
  expect(char(bob.project, 1, 1)).toBe('A');
  expect(painted(bob.project, 5, 5)).toEqual(painted(ann.project, 5, 5));

  bob.project.editCell(3, 3, { char: 'C' });
  bob.project.commitEdit();
  await expect.poll(() => char(ann.project, 3, 3), PATIENT).toBe('C');
  bob.project.undo();
  await expect.poll(() => char(ann.project, 3, 3), PATIENT).toBe(undefined);
  await allMatch(next, bob);
});

test('an unnumbered stroke is sent again after a handover, and lands', async () => {
  const room = await hosting();
  room.pinia = getActivePinia();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  await allMatch(room, ann, bob);
  room.host.close();   // the host's gone, and these never reach it
  ann.drawing.connection('lost');
  bob.drawing.connection('lost');
  ann.project._paused = bob.project._paused = false;
  ann.project.editCell(1, 1, { char: 'a' });
  ann.project.commitEdit();
  bob.project.editCell(1, 1, { char: 'b' });
  bob.project.commitEdit();
  dab(ann.project, 9, 9);
  ann.project.commitEdit();
  bob.project.editCell(2, 2, { char: 'c' });
  bob.project.commitEdit();
  expect(bob.project._sharing.pending.size).toBe(2);

  room.people.delete('ann');
  const next = await newHostIs(room, ann, { planned: false });
  expect(next.project._ledger.sum).toBe(next.project.editLayerSum());
  await expect.poll(() => bob.project._sharing.pending.size, PATIENT).toBe(0);
  expect(char(bob.project, 2, 2)).toBe('c');
  await expect.poll(() => char(ann.project, 2, 2), PATIENT).toBe('c');
  await expect.poll(() => char(ann.project, 1, 1), PATIENT).toBe('b');   // whichever landed last, the same on both
  await allMatch(next, bob);
});

test('a float an artist still holds goes once after a handover', async () => {
  const room = await hosting();
  room.pinia = getActivePinia();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  await allMatch(room, ann, bob);
  const sent = [];
  const { send } = bob.project._sharing;
  bob.project._sharing.send = (msg) => { sent.push(msg); return send(msg); };
  bob.project._floating = true;
  bob.project.beginEdit();
  bob.project.editCell(4, 4, { char: 'f' });
  bob.project.commitEdit();
  expect(bob.project._sharing.held).toBeTruthy();
  ann.drawing.connection('lost');
  bob.drawing.connection('lost');
  room.host.close();
  room.people.delete('ann');

  const next = await newHostIs(room, ann, { planned: false });
  expect(sent.filter((msg) => msg.t === 'change')).toEqual([]);
  bob.project._floating = false;
  bob.project.commitPending();   // placed
  await expect.poll(() => char(ann.project, 4, 4), PATIENT).toBe('f');
  await expect.poll(() => bob.project._sharing.pending.size, PATIENT).toBe(0);
  expect(sent.filter((msg) => msg.t === 'change').length).toBe(1);
  await allMatch(next, bob);
});

test('if the room ends, an unnumbered stroke is dropped and the last agreed picture stays', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  ann.project.editCell(1, 1, { char: 'A' });
  ann.project.commitEdit();
  await allMatch(room, ann);
  room.host.close();
  ann.drawing.connection('lost');
  ann.project._paused = false;
  ann.project.editCell(1, 1, { char: 'x' });
  ann.project.commitEdit();
  ann.project.editCell(2, 2, { char: 'y' });
  ann.project.commitEdit();
  expect(char(ann.project, 1, 1)).toBe('x');

  ann.drawing.close();
  expect(char(ann.project, 1, 1)).toBe('A');
  expect(char(ann.project, 2, 2)).toBe(undefined);
});

test('a handover the new host never acknowledges leaves the old host hosting', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  room.host.handOverWithinMs = 200;
  ann.watch.onHandOver = () => {};   // never answers
  const asked = room.drawing.makeHost('ann');
  await later();
  expect(room.drawing.paused).toBe(true);
  ann.project.editCell(1, 1, { char: 'A' });   // waits while the host isn't numbering
  ann.project.commitEdit();
  expect(await asked).toBe(false);
  expect(sentHandOver(room)).toBe(undefined);
  expect(room.drawing.paused).toBe(false);
  expect(room.project._sharing.role).toBe('host');
  await expect.poll(() => char(room.project, 1, 1), PATIENT).toBe('A');
  room.project.editCell(2, 2, { char: 'H' });
  room.project.commitEdit();
  await allMatch(room, ann);
});

test('a hand-over the server never answers leaves the old host hosting too', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  room.host.serverAnswersWithinMs = 200;
  expect(await room.drawing.makeHost('ann')).toBe(false);
  expect(sentHandOver(room)).toBe('ann');
  expect(room.project._sharing.role).toBe('host');
  expect(room.drawing.paused).toBe(false);
  // Later, the same artist picked with what's on it, stale: it starts from Pending, not what it was handed.
  room.project.editCell(2, 2, { char: 'H' });
  room.project.commitEdit();
  await allMatch(room, ann);
  const n = ann.project._sharing.pending.n;
  room.host.close();
  ann.drawing.connection('lost');
  room.people.delete('ann');
  await newHostIs(room, ann, { planned: true });
  expect(ann.project._ledger.n).toBe(n);
  expect(ann.project._ledger.sum).toBe(ann.project.editLayerSum());
});

test('the ledger\'s record survives a reload: what it holds comes back, undo works, and the document catches up from its tail', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  await allMatch(room, ann);
  const documentN = room.project._ledger.n;
  const oldCells = room.project.editCells;
  ann.project.editCell(1, 1, { char: 'A' });
  ann.project.commitEdit();
  room.project.editCell(2, 2, { char: 'I' });
  room.project.commitEdit();
  await allMatch(room, ann);
  await room.project.keepLedger();
  const row = await readRoomLedger('room');
  expect(row.documentId).toBe(room.project.documentId);
  expect(row.kept.n).toBe(room.project._ledger.n);
  expect(row.kept.stacks.strokes instanceof Map).toBe(true);

  // What a reload leaves: the document as autosave last had it, nothing else.
  const { project } = room;
  const n = project._ledger.n, sum = project._ledger.sum;
  room.host.close();
  project.stopSharing();
  project.clearHistory();
  project.editCells = oldCells;
  project._documentN = documentN;
  project.restoreLedger(row, 'host');
  expect(project._ledger.n).toBe(n);
  expect(project._ledger.sum).toBe(sum);
  expect(char(project, 1, 1)).toBe('A');
  expect(char(project, 2, 2)).toBe('I');
  expect(project.canUndo).toBe(true);
  project._by = 'host';
  project.undo();
  expect(char(project, 2, 2)).toBe(undefined);
  project.undo();
  expect(char(project, 1, 1)).toBe('A');   // not ann's, whatever's under it
  project.redo();   // a redo goes on top of whatever's drawn since
  expect(char(project, 1, 1)).toBe('H');
  project.redo();
  expect(char(project, 2, 2)).toBe('I');
  await forgetRoomLedger('room');
  expect(await readRoomLedger('room')).toBe(null);
});

test('a kept ledger whose tail can\'t reach the document starts its stacks over, and says the undo is gone', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  await allMatch(room, ann);
  await room.project.keepLedger();
  const row = await readRoomLedger('room');
  const { project } = room;
  room.host.close();
  project.stopSharing();
  project.clearHistory();
  project._documentN = null;
  expect(project.restoreLedger(row, 'host')).toBe(false);
  expect(project.canUndo).toBe(false);
  expect(project._ledger.n).toBe(-1);
  await forgetRoomLedger('room');
});

test('a ledger crosses a channel whole: shared arrays stay shared, and it undoes and redoes the same', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  dab(room.project, 3, 3);
  room.project.commitEdit();
  dab(ann.project, 3, 3, '#0000ff');
  ann.project.commitEdit();
  room.project.editCell(5, 5, { char: 'Z' });
  room.project.commitEdit();
  room.project.undo();
  await allMatch(room, ann);
  const kept = room.project._ledger.kept();
  const back = keptFromWire(JSON.parse(JSON.stringify(keptForWire(kept))));
  expect(back.n).toBe(kept.n);
  expect(back.stacks.bytes).toBe(kept.stacks.bytes);
  const tile = [...back.stacks.tiles.values()][0];
  for (const entry of tile.entries) expect(back.stacks.strokes.get(entry.stroke).paint.get('0,0')).toBe(entry.px);
  const { readCell, readTile } = room.project._ledger;
  const ledger = Ledger.restore(back, { readCell, readTile, mostBytes: CHUNK_BYTES });
  expect(ledger.undo('ann', [...back.stacks.strokes.values()].find((r) => r.by === 'ann').id).runs.length).toBeGreaterThan(0);
  expect(ledger.redo('host', [...back.stacks.strokes.values()].find((r) => r.undone && r.by === 'host').id).cells).toEqual([['5,5', expect.objectContaining({ char: 'Z' })]]);
});

test('a host back with no way to know joins the artists\' ahead of it: it catches up by their tail, and no stroke goes', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  await allMatch(room, ann);
  const behind = room.project._ledger.kept(), behindCells = room.project.editCells;
  const row = { documentId: room.project.documentId, kept: structuredClone(behind) };
  ann.project.editCell(2, 2, { char: 'A' });
  ann.project.commitEdit();
  await expect.poll(() => quiet(ann), PATIENT).toBe(true);
  room.project.flushHeard();

  // The host reloads: the ledger and the document as of before ann's stroke, and ann reconnects.
  room.host.close();
  ann.drawing.connection('lost');
  room.drawing.close();
  setActivePinia(room.pinia);
  room.project.editCells = behindCells;
  room.project._documentN = behind.n;
  const again = new Host({
    config, passKey, roomId: 'room',
    send: async (msg) => {
      if (msg.type !== 'signal-to') return;
      await later();
      ann.watch.signalFrom('host', msg.data);
    },
    ...room.drawing.hostCallbacks(),
  });
  room.drawing.hosted(again, { me: () => 'host' });
  again.setRoom({ name: 'Night shift', welcome: '' });
  toStop.push(() => again.close());
  ann.watch.send = async (msg) => { await later(); again.signalFrom('ann', msg.data); };
  room.drawing.resumeHosting({ artists: ['ann'], invited: [] }, row);
  room.drawing.hostingAgain();
  expect(room.drawing.paused).toBe(true);
  expect(char(room.project, 2, 2)).toBe(undefined);
  await again.peer('ann', await passFor('ann'));

  await expect.poll(() => char(room.project, 2, 2), PATIENT).toBe('A');
  await expect.poll(() => room.drawing.paused, PATIENT).toBe(false);
  await expect.poll(() => ann.drawing.paused, PATIENT).toBe(false);
  expect(room.project.canUndo).toBe(true);
  ann.project.undo();
  await expect.poll(() => char(room.project, 2, 2), PATIENT).toBe(undefined);
  await allMatch({ project: room.project }, ann);
});

test('a host whose kept ledger doesn\'t reach takes the artist\'s agreed picture, without what the artist hasn\'t had numbered', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  await allMatch(room, ann);
  ann.project.editCell(2, 2, { char: 'A' });
  ann.project.commitEdit();
  await expect.poll(() => quiet(ann), PATIENT).toBe(true);
  room.project.flushHeard();
  const beforeCells = new Map();

  room.host.close();
  ann.drawing.connection('lost');
  ann.project._paused = false;
  ann.project.editCell(3, 3, { char: 'w' });   // not numbered: it goes out when the host's back
  ann.project.commitEdit();
  ann.project._paused = true;
  room.drawing.close();
  setActivePinia(room.pinia);
  room.project.editCells = beforeCells;
  room.project._documentN = null;
  const again = new Host({
    config, passKey, roomId: 'room',
    send: async (msg) => {
      if (msg.type !== 'signal-to') return;
      await later();
      ann.watch.signalFrom('host', msg.data);
    },
    ...room.drawing.hostCallbacks(),
  });
  room.drawing.hosted(again, { me: () => 'host' });
  again.setRoom({ name: 'Night shift', welcome: '' });
  toStop.push(() => again.close());
  ann.watch.send = async (msg) => { await later(); again.signalFrom('ann', msg.data); };
  room.drawing.resumeHosting({ artists: ['ann'], invited: [] }, null);
  room.drawing.hostingAgain();
  await again.peer('ann', await passFor('ann'));

  await expect.poll(() => char(room.project, 1, 1), PATIENT).toBe('H');
  await expect.poll(() => char(room.project, 2, 2), PATIENT).toBe('A');
  await expect.poll(() => char(room.project, 3, 3), PATIENT).toBe('w');
  await expect.poll(() => room.drawing.notice, PATIENT).toContain('undo starts over');
  await expect.poll(() => ann.drawing.notice, PATIENT).toContain('undo starts over');
  expect(room.drawing.notice).not.toContain('host changed');   // the host only reloaded
  expect(ann.drawing.notice).not.toContain('host changed');
  await allMatch({ project: room.project }, ann);
  expect(char(ann.project, 3, 3)).toBe('w');
});

// The host's channels outlive its socket, so artists can reach new-host at different numbers.
const heardOnly = (person, ...messages) => {
  for (const message of messages) person.project.hearDrawing(message);
  person.project.flushHeard();
};
const cellChange = (n, stroke, cell, char) => ({ t: 'numbered', n, by: 'dan', stroke, cells: [[cell, { char }]], runs: [] });

test('a new host hears who\'s ahead before it numbers anything: artists at different numbers keep every stroke', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob'), cid = await artist(room, 'cid');
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  await allMatch(room, ann, bob, cid);
  const n = ann.project._sharing.pending.n;
  for (const person of [ann, bob, cid]) person.drawing.connection('lost');
  room.host.close();
  room.people.delete('ann');
  const one = cellChange(n + 1, 'b1', '5,5', 'B'), two = cellChange(n + 2, 'c1', '6,6', 'C');
  heardOnly(bob, one);
  heardOnly(cid, one, two);
  ann.project._paused = false;
  ann.project.editCell(7, 7, { char: 'A' });   // no number yet
  ann.project.commitEdit();
  ann.project._paused = true;

  const next = await newHostIs(room, ann, { planned: false });
  await expect.poll(() => ann.project._ledger.n, PATIENT).toBe(n + 3);
  await allMatch(next, bob, cid);
  for (const person of [ann, bob, cid]) {
    expect(char(person.project, 5, 5)).toBe('B');
    expect(char(person.project, 6, 6)).toBe('C');
    expect(char(person.project, 7, 7)).toBe('A');
  }
});

test('a new host that didn\'t take the old ledger tells artists undo starts over, even on a planned handover', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  bob.project.editCell(2, 2, { char: 'B' });
  bob.project.commitEdit();
  room.project.editCell(3, 3, { char: 'H' });
  room.project.commitEdit();
  await allMatch(room, ann, bob);
  expect(bob.project.canUndo).toBe(true);
  expect(room.project.canUndo).toBe(true);
  room.people.delete('ann');

  const next = await newHostIs(room, ann, { planned: true, former: 'host' });   // the ledger never came
  await expect.poll(() => bob.project.canUndo, PATIENT).toBe(false);
  expect(bob.drawing.notice).toContain('undo starts over');
  await expect.poll(() => next.former.project.canUndo, PATIENT).toBe(false);   // the old host's own undo too
});

test('a host back from a reload with no ledger tells artists undo starts over', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  ann.project.editCell(2, 2, { char: 'A' });
  ann.project.commitEdit();
  await allMatch(room, ann);
  expect(ann.project.canUndo).toBe(true);
  room.host.close();
  ann.drawing.connection('lost');
  const documentN = room.project._ledger.n;
  room.drawing.close();
  setActivePinia(room.pinia);
  room.project._documentN = documentN;
  const again = new Host({
    config, passKey, roomId: 'room',
    send: async (msg) => {
      if (msg.type !== 'signal-to') return;
      await later();
      ann.watch.signalFrom('host', msg.data);
    },
    ...room.drawing.hostCallbacks(),
  });
  room.drawing.hosted(again, { me: () => 'host' });
  again.setRoom({ name: 'Night shift', welcome: '' });
  toStop.push(() => again.close());
  ann.watch.send = async (msg) => { await later(); again.signalFrom('ann', msg.data); };
  room.drawing.resumeHosting({ artists: ['ann'], invited: [] }, null);
  room.drawing.hostingAgain();
  await again.peer('ann', await passFor('ann'));
  await expect.poll(() => ann.project.canUndo, PATIENT).toBe(false);
  expect(ann.drawing.notice).toContain('undo starts over');
});

test('a hand-over that isn\'t what a ledger could be is refused, whatever part of it is wrong', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  room.project.editCell(1, 1, { char: 'H' });
  dab(room.project, 5, 5);
  room.project.commitEdit();
  dab(room.project, 5, 5);
  room.project.commitEdit();
  room.project.undo();
  dab(room.project, 9, 9);
  room.project.commitEdit();
  await allMatch(room, ann);
  const plain = () => keptForWire(room.project._ledger.kept());
  const read = async (wire) => ann.project.readHandOver(await packValue(JSON.parse(JSON.stringify(wire))));

  expect(plain().strokes.length).toBeGreaterThan(1);
  expect(plain().tiles.length).toBeGreaterThan(0);
  expect(await read(plain())).not.toBe(null);
  expect(await read({ ...plain(), tail: [null] })).not.toBe(null);   // the sender's tail isn't used at all

  const live = (wire) => wire.strokes.find((stroke) => !stroke.undone && stroke.paint.length);
  const bad = {
    'no number': (w) => { w.n = 'x'; },
    'a negative number': (w) => { w.n = -2; },
    'no epoch': (w) => { w.epoch = null; },
    'a sum that isn\'t': (w) => { w.sum = 'x'; },
    'strokes that aren\'t': (w) => { w.strokes = 'x'; },
    'a stroke that isn\'t': (w) => { w.strokes.push(null); },
    'a stroke with no id': (w) => { w.strokes[0].id = 7; },
    'a stroke with no author': (w) => { w.strokes[0].by = null; },
    'a stroke\'s bytes': (w) => { w.strokes[0].bytes = -1; },
    'a stroke\'s bad cell': (w) => { w.strokes.find((stroke) => stroke.cells.length).cells[0] = ['nope', { char: 'x' }]; },
    'a stroke\'s paint that isn\'t': (w) => { live(w).paint = 'x'; },
    'a stroke\'s paint in the wrong place': (w) => { live(w).paint[0][0] = '1,1'; },
    'a stroke\'s paint past the arrays': (w) => { live(w).paint[0][1] = 9999; },
    'a stroke\'s paint at no array': (w) => { live(w).paint[0][1] = 'length'; },
    'a live stroke missing from its tile': (w) => { w.tiles = []; },
    'a live stroke missing from its stack': (w) => { w.cells = []; },
    'a stack naming no stroke': (w) => { w.cells[0][2] = ['gone']; },
    'a stack\'s stroke without that cell': (w) => { w.cells[0][0] = '30,30'; },
    'a bad base cell': (w) => { w.cells[0][1] = { nope: 1 }; },
    'cells that aren\'t': (w) => { w.cells = 'x'; },
    'a tile that isn\'t': (w) => { w.tiles[0] = null; },
    'a tile named apart from its place': (w) => { w.tiles[0][1] += 64; },
    'a tile past the layer': (w) => { w.tiles[0] = [`${1 << 24},0`, 1 << 24, 0, [], []]; },
    'a tile\'s base index past its end': (w) => { w.tiles[0][3] = [1e9, 1]; },
    'a tile\'s base index that isn\'t': (w) => { w.tiles[0][3] = ['__proto__', 1]; },
    'a tile\'s odd base': (w) => { w.tiles[0][3] = [1]; },
    'a tile\'s pixel that isn\'t': (w) => { w.tiles[0][3] = [0, -1]; },
    'a tile\'s pixel too big': (w) => { w.tiles[0][3] = [0, 2 ** 40]; },
    'an entry naming no stroke': (w) => { w.tiles[0][4][0][0] = 'gone'; },
    'an entry past the arrays': (w) => { w.tiles[0][4][0][1] = 9999; },
    'an array\'s pixel index past its end': (w) => { w.arrays[0] = [1e9, 1]; },
    'an array\'s pixel that isn\'t': (w) => { w.arrays[0] = [0, 'x']; },
    'arrays that aren\'t': (w) => { w.arrays = 'x'; },
    'a million arrays': (w) => { w.arrays = Array.from({ length: 1e6 }, () => []); },
    'a million tiles': (w) => { w.tiles = Array.from({ length: 1e6 }, (_, i) => [`${i * 64},0`, i * 64, 0, [], []]); },
  };
  for (const [what, spoil] of Object.entries(bad)) {
    const wire = plain();
    spoil(wire);
    expect(await read(wire), what).toBe(null);
  }
  expect(await ann.project.readHandOver([new Uint8Array([1, 2, 3])])).toBe(null);
});

test('a ledger that can\'t be restored falls back to the sudden path, and the new host is really hosting', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  ann.project.editCell(1, 1, { char: 'A' });
  ann.project.commitEdit();
  await allMatch(room, ann, bob);
  setActivePinia(room.pinia);
  const asked = room.drawing.makeHost('ann');
  await expect.poll(() => sentHandOver(room), PATIENT).toBe('ann');
  const restore = vi.spyOn(Ledger, 'restore').mockImplementation(() => { throw new Error('broken'); });
  const next = await newHostIs(room, ann, { planned: true });
  restore.mockRestore();
  room.host.close();
  await asked;
  expect(ann.project._sharing.role).toBe('host');
  expect(ann.drawing.notice).toContain('undo starts over');
  ann.project.editCell(3, 3, { char: 'C' });
  ann.project.commitEdit();
  await expect.poll(() => char(bob.project, 3, 3), PATIENT).toBe('C');
  await allMatch(next, bob);
});

test('a new host keeps its own numbers on: the tail is its own, not the one it was sent', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  await allMatch(room, ann);
  const own = ann.project._sharing.pending.tail;
  const kept = keptFromWire(keptForWire(room.project._ledger.kept()));
  const left = ann.project.leavePending();
  expect(ann.project.takeLedger({ ...kept, tail: [null] }, left)).toBe(true);
  expect(ann.project._ledger.tail).toBe(own);
});

test('someone claiming to be ahead in the middle of a room gets the usual answer, with no pause', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  await allMatch(room, ann);
  const n = room.project._ledger.n;
  const asked = vi.spyOn(room.host, 'askCatchUp'), sent = vi.spyOn(room.host, 'sendProject');
  ann.watch.post({ t: 'artist-hello', has: n + 1000, epoch: room.project._ledger.epoch });
  await expect.poll(() => sent.mock.calls.length, PATIENT).toBe(1);
  expect(asked).not.toHaveBeenCalled();
  expect(room.drawing.paused).toBe(false);
  expect(room.host.holding ?? null).toBe(null);
  expect(room.project._ledger.n).toBe(n);
});

test('a catch-up answer is taken only if it\'s what was asked for, with nothing changed otherwise', async () => {
  const room = await hostingWithSocket();
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  const { project } = room, { n, epoch } = project._ledger;
  const item = (at, char = 'x') => ({ n: at, by: 'ann', stroke: `s${at}`, cells: [['2,2', { char }]], runs: [] });
  const tail = (...items) => ({ n: items.at(-1)?.n ?? n, epoch, kind: 'tail', tail: items });
  const parts = (await project.projectParts());
  const bad = {
    'a number below the claim': [{ ...tail(item(n + 1)), n: n + 1 }, n + 2],
    'a claim that isn\'t past mine': [tail(item(n + 1)), n],
    'a gap at the start': [tail(item(n + 2)), n + 2],
    'a gap in the middle': [tail(item(n + 1), item(n + 3)), n + 3],
    'a tail short of its number': [{ ...tail(item(n + 1)), n: n + 2 }, n + 2],
    'another epoch': [{ ...tail(item(n + 1)), epoch: 'other' }, n + 1],
    'a change with no author': [tail({ ...item(n + 1), by: null }), n + 1],
    'a change that isn\'t': [tail({ ...item(n + 1), cells: 'x' }), n + 1],
    'an item that isn\'t': [tail(null), n + 1],
    'settings that aren\'t': [tail({ t: 'settings', n: n + 1, values: null }), n + 1],
    'a base with bad runs': [tail({ t: 'base', n: n + 1, runs: 'x', records: { pins: [] } }), n + 1],
    'a base with no records': [tail({ t: 'base', n: n + 1, runs: [], records: 'x' }), n + 1],
    'a project below the claim': [{ n: n + 1, epoch, kind: 'project', parts }, n + 2],
    'a project at my number': [{ n, epoch, kind: 'project', parts }, n],
    'a project under my number': [{ n: n - 1, epoch, kind: 'project', parts }, n - 1],
  };
  const open = vi.spyOn(project, 'openFromHost');
  for (const [what, [answer, has]] of Object.entries(bad)) {
    expect(await project.takeCatchUp(answer, has), what).toBe(false);
    expect(project._ledger.n, what).toBe(n);
    expect(char(project, 2, 2), what).toBe(undefined);
  }
  expect(open).not.toHaveBeenCalled();
  expect(await project.takeCatchUp(tail(item(n + 1, 'y'), item(n + 2, 'z')), n + 2)).toBe(true);
  expect(project._ledger.n).toBe(n + 2);
  expect(char(project, 2, 2)).toBe('z');
});

test('the list emptying while a returning host gathers leaves it drawing, and strokes from anyone asked later aren\'t held', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  room.project._documentN = room.project._ledger.n;
  room.drawing.resumeHosting({ artists: ['ann'], invited: [] }, null);
  expect(room.drawing.paused).toBe(true);
  expect(room.host.holding).not.toBe(null);
  room.drawing.backToWatching('ann');
  expect(room.drawing.paused).toBe(false);
  expect(room.project._paused).toBe(false);
  expect(room.host.holding).toBe(null);
  room.project.editCell(4, 4, { char: 'k' });
  room.project.commitEdit();
  expect(char(room.project, 4, 4)).toBe('k');
  await expect.poll(() => ann.drawing.mayDraw, PATIENT).toBe(false);
});

test('a new host\'s own waiting strokes stay when the list empties before they\'re numbered', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  await allMatch(room, ann, bob);
  bob.watch.send = async () => {};   // bob stays quiet
  bob.watch.close();
  room.host.close();
  room.people.delete('ann');
  ann.drawing.connection('lost');
  ann.project._paused = false;
  ann.project.editCell(7, 7, { char: 'A' });
  ann.project.commitEdit();
  ann.project._paused = true;
  const hosting2 = new Host({ config, passKey, roomId: 'room', send: async () => {}, ...ann.drawing.hostCallbacks() });
  toStop.push(() => hosting2.close());
  ann.watch.close();
  ann.drawing.hosted(hosting2, { me: () => 'ann' });
  ann.drawing.takeOver(hosting2, { planned: false });
  expect(ann.drawing.paused).toBe(true);
  ann.drawing.artistsNow([]);
  expect(ann.drawing.paused).toBe(false);
  expect(char(ann.project, 7, 7)).toBe('A');
});

test('a hand-over\'s chunks can\'t be cut in on: what\'s numbered waits behind them', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  await allMatch(room, ann);
  const put = room.host.putPaced.bind(room.host);
  let during = null;
  room.host.putPaced = async (w, chunks) => {
    during = w.projecting;
    await put(w, chunks);
  };
  const w = room.host.open().find(({ claims }) => claims.sub === 'ann');
  const answered = room.host.handOver('ann', [new Uint8Array(4)]);
  await expect.poll(() => during, PATIENT).toBe(true);
  w.handedOver?.(false);
  await answered;
  expect(w.projecting).toBe(false);
});

test('during any handover the layer says the host is changing, and a host who is away is reconnecting', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  await allMatch(room, ann, bob);
  bob.drawing.connection('lost');
  expect(bob.drawing.paused).toBe(true);
  expect(bob.drawing.hostChanging).toBe(false);
  bob.drawing.hostChanged({ planned: false });
  expect(bob.drawing.hostChanging).toBe(true);
  setActivePinia(room.pinia);
  room.host.handOverWithinMs = room.host.serverAnswersWithinMs = 50;
  const asked = room.drawing.makeHost('ann');
  expect(room.drawing.hostChanging).toBe(true);
  await asked;
  expect(room.drawing.hostChanging).toBe(false);
  expect(room.drawing.paused).toBe(false);
});

// A host gathering, with its artists still connected, as after a reload.
function gatheringAgain(room, list) {
  setActivePinia(room.pinia);
  room.project._documentN = room.project._ledger.n;
  room.drawing.resumeHosting({ artists: list, invited: [] }, null);
  expect(room.drawing.paused).toBe(true);
}
const stalling = (person) => vi.spyOn(person.project, 'catchUpFor').mockImplementation(() => new Promise(() => {}));
const saysAhead = (room, person, by = 5) => person.watch.post({ t: 'artist-hello', has: room.project._ledger.n + by, epoch: room.project._ledger.epoch });

test('Make host is refused while the host is gathering', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  await allMatch(room, ann);
  gatheringAgain(room, ['ann']);
  expect(await room.drawing.makeHost('ann')).toBe(false);
  expect(room.drawing.paused).toBe(true);
  expect(room.host.holding).not.toBe(null);
  expect(sentHandOver(room)).toBe(undefined);
});

test('settings a catch-up brings aren\'t numbered and sent to those still to be answered', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  await allMatch(room, ann);
  gatheringAgain(room, ['ann']);
  const sent = vi.spyOn(room.project, 'sendSettings');
  room.project.applySettings({ brightness: room.project.brightness + 7 });
  await later();
  await later();
  expect(sent).not.toHaveBeenCalled();
});

test('a catch-up answer landing after the gather has stopped isn\'t taken', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  await allMatch(room, ann);
  gatheringAgain(room, ['ann']);
  let answer = null;
  vi.spyOn(room.host, 'askCatchUp').mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
  const taken = vi.spyOn(room.project, 'takeCatchUp');
  saysAhead(room, ann);
  await expect.poll(() => answer, PATIENT).not.toBe(null);
  room.drawing.backToWatching('ann');
  answer({ n: room.project._ledger.n + 5, epoch: 'other', kind: 'project', parts: {} });
  await later();
  await later();
  expect(taken).not.toHaveBeenCalled();
});

test('a gather finishes with what it has when its time is up, whoever\'s still sending', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  await allMatch(room, ann);
  room.host.gatherWithinMs = 200;
  stalling(ann);
  gatheringAgain(room, ['ann']);
  saysAhead(room, ann);
  await expect.poll(() => ann.project.catchUpFor.mock.calls.length, PATIENT).toBe(1);
  await expect.poll(() => room.drawing.paused, { timeout: 3000 }).toBe(false);
  expect(room.host.holding).toBe(null);
});

test('a catch-up stops when its artist is put back to watching', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  await allMatch(room, ann, bob);
  stalling(ann);
  gatheringAgain(room, ['ann', 'bob']);
  saysAhead(room, ann);
  bob.watch.post({ t: 'artist-hello', has: room.project._ledger.n, epoch: room.project._ledger.epoch });
  await expect.poll(() => ann.project.catchUpFor.mock.calls.length, PATIENT).toBe(1);
  room.drawing.backToWatching('ann');
  await expect.poll(() => room.drawing.paused, { timeout: 3000 }).toBe(false);
});

test('a claim from someone put back to watching since isn\'t asked about', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  await allMatch(room, ann, bob);
  const asked = vi.spyOn(room.host, 'askCatchUp');
  stalling(bob);
  gatheringAgain(room, ['ann', 'bob']);
  saysAhead(room, ann);
  await wait(100);
  room.drawing.backToWatching('ann');
  saysAhead(room, bob, 0);   // everyone left has said
  await expect.poll(() => room.drawing.paused, PATIENT).toBe(false);
  expect(asked).not.toHaveBeenCalled();
});

// An artist back from a reload, named host before hearing any number: nothing of the room's sharing left.
const reloaded = (person) => person.project.stopSharing();

test('a new host with no number and no one ahead settles on a number a project can carry, and someone invited gets the art', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  ann.project.editCell(4, 4, { char: 'A' });
  ann.project.commitEdit();
  await allMatch(room, ann);
  room.host.close();
  room.people.delete('ann');
  reloaded(ann);

  const next = await newHostIs(room, ann, { planned: false });
  await expect.poll(() => ann.drawing.paused, PATIENT).toBe(false);
  expect(ann.project._ledger.n).toBe(0);
  next.pinia = room.pinia;
  const cid = await artist(next, 'cid');
  await expect.poll(() => char(cid.project, 4, 4), PATIENT).toBe('A');
  await allMatch(next, cid);
});

test('a catch-up that comes to nothing with no number yet still settles, and the artist gets the art', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  ann.project.editCell(4, 4, { char: 'A' });
  ann.project.commitEdit();
  await allMatch(room, ann, bob);
  room.host.close();
  room.people.delete('ann');
  bob.drawing.connection('lost');
  reloaded(ann);
  const bad = await packValue([null]);
  vi.spyOn(bob.project, 'catchUpFor').mockResolvedValue({ n: bob.project._sharing.pending.n, epoch: 'e', kind: 'tail', chunks: bad });

  const next = await newHostIs(room, ann, { planned: false });
  expect(bob.project.catchUpFor).toHaveBeenCalled();
  expect(ann.project._ledger.n).toBe(0);
  await allMatch(next, bob);
  expect(char(bob.project, 4, 4)).toBe('A');
});

test('a gather stopped with no number yet leaves a number a project can carry', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  await allMatch(room, ann);
  room.project._documentN = null;
  setActivePinia(room.pinia);
  room.drawing.resumeHosting({ artists: ['ann'], invited: [] }, null);
  expect(room.project._ledger.n).toBe(-1);
  room.drawing.backToWatching('ann');
  expect(room.project._ledger.n).toBe(0);
});


// Full but for `left` places, the host counted: the room's own word on who's listed, none of them here.
const listedUpTo = (room, left, also = [], tag = undefined) => {
  const others = Array.from({ length: MOST_ARTISTS - 1 - left - also.length }, (_, i) => `listed-${i}`);
  setActivePinia(room.pinia ?? getActivePinia());
  room.drawing.artistsNow([...others, ...also], tag);
};

// The host's list of who's here, with one watcher, and the button their ⋯ menu has for Make artist.
async function makeArtistButton(room, watcher) {
  const rooms = useRoomStore();
  rooms.$patch({ role: 'host', peopleOpen: true, watchers: [{ peer: watcher, sub: watcher, name: watcher, guest: false, tracking: false, connected: true }] });
  const app = createApp({ render: () => h(RoomPeople) });
  app.use(getActivePinia());
  const element = document.createElement('div');
  document.body.append(element);
  app.mount(element);
  toStop.push(() => { app.unmount(); element.remove(); });
  await nextTick();
  element.querySelector('.dropdown-trigger').click();
  await nextTick();
  return () => [...element.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Make artist');
}

test('the host can\'t make more artists than the cap', async () => {
  const room = await hosting();
  const pinia = getActivePinia();
  room.pinia = pinia;
  listedUpTo(room, 1);
  const ann = await join(room, 'ann'), bob = await join(room, 'bob');
  setActivePinia(pinia);
  const button = await makeArtistButton(room, 'bob');
  expect(button().disabled).toBe(false);

  expect(room.drawing.invite('ann')).toBe(true);   // asked is a place held, as a yes has to find one
  await expect.poll(() => ann.drawing.invitation, PATIENT).toBe(true);
  expect(room.drawing.artistsFull).toBe('This room has as many artists as it can take.');
  await nextTick();
  expect(button().disabled).toBe(true);
  expect(button().title).toBe('This room has as many artists as it can take.');
  expect(room.drawing.invite('bob')).toBe(false);
  expect(room.drawing.invited).toEqual(['ann']);
  await wait(50);
  expect(bob.drawing.invitation).toBe(false);
  expect(room.drawing.invite('ann')).toBe(true);   // who's asked can be asked again

  room.drawing.withdraw('ann');
  expect(room.drawing.artistsFull).toBe(null);
  await nextTick();
  expect(button().disabled).toBe(false);
  expect(button().title).toBe('');
  expect(room.drawing.invite('bob')).toBe(true);
  await expect.poll(() => bob.drawing.invitation, PATIENT).toBe(true);
  bob.drawing.accept();
  await expect.poll(() => bob.drawing.mayDraw, PATIENT).toBe(true);
  expect(room.drawing.artists).toHaveLength(MOST_ARTISTS - 1);   // the host makes up the cap
  expect(room.drawing.artistsFull).toBe('This room has as many artists as it can take.');
});

test('a yes that finds the room full isn\'t listed, and is told so', async () => {
  const room = await hosting();
  room.pinia = getActivePinia();
  listedUpTo(room, 0);
  const bob = await join(room, 'bob');
  setActivePinia(room.pinia);
  room.drawing.invited = ['bob'];   // as a reload can bring back
  bob.drawing.accept();
  await expect.poll(() => room.drawing.invited, PATIENT).toEqual([]);
  expect(room.drawing.artists).not.toContain('bob');
  expect(room.drawing.artists).toHaveLength(MOST_ARTISTS - 1);
  await wait(50);
  expect(bob.drawing.mayDraw).toBe(false);
  expect(sessionStorage.getItem('phosphor-artist:room:bob')).toBe(null);
});

test('someone listed keeps their place: back on a new connection at the cap, they still draw, and going frees it', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  listedUpTo(room, 0, ['ann'], lastList(room).tag);   // the answer to the list that has ann on it
  await expect.poll(() => ann.drawing.artists.includes('ann'), PATIENT).toBe(true);
  setActivePinia(room.pinia);
  const list = [...room.drawing.artists];
  expect(room.drawing.artistsFull).not.toBe(null);

  room.host.drop('ann');
  room.drawing.peopleHere([]);
  expect(room.drawing.artists).toEqual(list);   // gone, and still counted
  expect(room.drawing.artistsFull).not.toBe(null);
  await room.host.peer('ann', await passFor('ann'));
  await expect.poll(() => room.host.open().find((w) => w.peer === 'ann')?.drawing, PATIENT).toBe(true);
  await expect.poll(() => ann.drawing.paused, PATIENT).toBe(false);
  ann.project.editCell(1, 1, { char: 'A' });
  ann.project.commitEdit();
  await expect.poll(() => char(room.project, 1, 1), PATIENT).toBe('A');
  expect(room.drawing.artists).toEqual(list);

  room.drawing.backToWatching('ann');
  expect(room.drawing.artistsFull).toBe(null);
});

// A picture for the Host to show, with what it heard by each person kept: they have what `art` does as of now.
const artOf = (char) => ({
  cols: 2, lines: 1, font: { id: 'vga', size: 20 },
  cells: [char, 'b'].map((c) => ({ char: c, fg: { r: 255, g: 255, b: 255, hex: '#ffffff' }, bg: { r: 0, g: 0, b: 0, hex: '#000000' } })),
});
const hearsArt = (person) => {
  person.art = null;
  person.watch.onArt = (art) => { person.art = art.cells[0].char; };
};
const artSent = (spy, person, room) => {
  const w = room.host.open().find(({ peer }) => peer === person.sub);
  return spy.mock.calls.filter(([to, data]) => to === w && (typeof data !== 'string' || /^\{"t":"(cells|snapshot)"/.test(data))).length;
};

test('an artist is sent no art, and a watcher in the same room still is', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann'), cid = await join(room, 'cid'), dee = await join(room, 'dee');
  hearsArt(ann);
  hearsArt(cid);
  hearsArt(dee);
  expect(room.drawing.invite('dee')).toBe(true);   // asked, and no answer: a watcher still
  const put = vi.spyOn(room.host, 'put');

  room.host.setArt(artOf('a'));   // a snapshot, as nothing's been sent
  await expect.poll(() => cid.art, PATIENT).toBe('a');
  await expect.poll(() => dee.art, PATIENT).toBe('a');
  room.host.setArt(artOf('c'));   // the changed cells
  await expect.poll(() => cid.art, PATIENT).toBe('c');
  expect(artSent(put, cid, room)).toBeGreaterThan(1);
  expect(artSent(put, ann, room)).toBe(0);
  await wait(50);
  expect(ann.art).toBe(null);
});

test('someone put back to watching gets the art straight away, a snapshot, and then what changes', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  room.host.setArt(artOf('a'));
  hearsArt(ann);
  const put = vi.spyOn(room.host, 'put');

  room.drawing.backToWatching('ann');
  await expect.poll(() => ann.art, PATIENT).toBe('a');   // with nothing new to send
  await expect.poll(() => ann.drawing.mayDraw, PATIENT).toBe(false);
  const w = room.host.open().find(({ peer }) => peer === 'ann');
  const first = put.mock.calls.findIndex(([to, data]) => to === w && typeof data === 'string' && data.startsWith('{"t":"snapshot"'));
  const list = put.mock.calls.findIndex(([to, data]) => to === w && typeof data === 'string' && data.startsWith('{"t":"artists"'));
  expect(list).toBeGreaterThanOrEqual(0);
  expect(first).toBeGreaterThan(list);   // they've heard they're watching, so the art's for them
  room.host.setArt(artOf('z'));
  await expect.poll(() => ann.art, PATIENT).toBe('z');
});

test('art that was held back behind a project isn\'t waited for by an artist, and is sent if they go back to watching first', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  room.host.setArt(artOf('a'));
  const w = room.host.open().find(({ peer }) => peer === 'ann');
  hearsArt(ann);

  await room.host.sendProject(w);
  expect(w.behind).toBeFalsy();
  w.projecting = true;   // one on its way
  room.host.setArt(artOf('b'));
  expect(w.behind).toBeFalsy();
  await room.host.sentWhole(w);
  await wait(50);
  expect(ann.art).toBe(null);

  w.projecting = true;
  room.drawing.backToWatching('ann');
  expect(w.drawing).toBe(false);
  await expect.poll(() => w.behind, PATIENT).toBe(true);   // not over a project
  await room.host.sentWhole(w);
  await expect.poll(() => ann.art, PATIENT).toBe('b');
  expect(w.behind).toBe(false);
});

// Someone saying yes for the first time, whose project doesn't come to anything. fails: what's set up first.
async function firstProjectFails(fails) {
  const room = await hosting();
  room.host.setArt(artOf('a'));
  const person = await join(room, 'ann');
  await expect.poll(() => room.host.open().find((w) => w.peer === 'ann')?.has, PATIENT).toBeTruthy();
  hearsArt(person);
  const undo = fails(room, person);
  expect(room.drawing.invite('ann')).toBe(true);
  await expect.poll(() => person.drawing.invitation, PATIENT).toBe(true);
  person.drawing.accept();

  await expect.poll(() => person.drawing.notice, PATIENT).toBe('The room\'s art couldn\'t be opened.');
  await expect.poll(() => room.drawing.artists, PATIENT).toEqual([]);   // back to watching
  await expect.poll(() => person.art, PATIENT).toBe('a');               // a fresh snapshot
  expect(person.drawing.mayDraw).toBe(false);
  room.host.setArt(artOf('z'));                                         // and the art as it changes
  await expect.poll(() => person.art, PATIENT).toBe('z');

  undo();   // and they can be asked again
  expect(room.drawing.invite('ann')).toBe(true);
  await expect.poll(() => person.drawing.invitation, PATIENT).toBe(true);
  person.drawing.accept();
  await expect.poll(() => person.drawing.mayDraw, PATIENT).toBe(true);
}

test('a first project that won\'t open puts them back to watching, with the notice and the art', async () => {
  await firstProjectFails((room, person) => {
    const take = vi.spyOn(person.project, 'takeProject').mockResolvedValue(false);
    return () => take.mockRestore();
  });
});

test('a first project with a bad chunk puts them back to watching, with the notice and the art', async () => {
  await firstProjectFails((room) => {
    const project = room.host.project;
    room.host.project = () => ({ n: 0, epoch: 'e', chunks: Promise.resolve([new Uint8Array(4)]) });
    return () => { room.host.project = project; };
  });
});

test('a first project the host can\'t pack puts them back to watching, with the notice and the art', async () => {
  await firstProjectFails((room) => {
    const project = room.host.project;
    room.host.project = () => { throw new Error('no'); };
    return () => { room.host.project = project; };
  });
});

test('a project that fails for someone already drawing leaves them drawing on what they have', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const project = room.host.project;
  room.host.project = () => ({ n: 0, epoch: 'e', chunks: Promise.reject(new Error('no')) });
  await room.host.sendProject(room.host.open().find((w) => w.peer === 'ann'));
  await expect.poll(() => ann.drawing.notice, PATIENT).toBe('The room\'s art couldn\'t be opened.');
  room.host.project = project;
  await wait(50);
  expect(room.drawing.artists).toEqual(['ann']);
  expect(ann.drawing.mayDraw).toBe(true);
});

test('a host writes its ledger every 10 seconds at most, by the clock', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  toStop.push(() => vi.useRealTimers());
  const room = await hosting();
  room.drawing.artistsNow(['ann']);
  const keep = vi.spyOn(room.project, 'keepLedger').mockResolvedValue();
  vi.advanceTimersByTime(9999);
  expect(keep).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(keep).toHaveBeenCalledTimes(1);
});

// A canvas's encoding held back until the answer's called: what's merged waits on this, and a room goes on meanwhile.
function holdEncoding() {
  const toBlob = HTMLCanvasElement.prototype.toBlob;
  let go;
  const open = new Promise((resolve) => { go = resolve; });
  const spy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (...args) {
    open.then(() => toBlob.apply(this, args));
  });
  return { spy, go };
}

test('what an artist draws while Into the image encodes survives on every screen', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  await allMatch(room, ann);

  const { spy, go } = holdEncoding();
  const merging = room.project.mergeIntoPicture();
  await expect.poll(() => spy.mock.calls.length, PATIENT).toBeGreaterThan(0);
  ann.project.editCell(1, 1, { char: 'A' });   // on a cell being merged
  dab(ann.project, 8, 8);
  ann.project.commitEdit();
  await wait(150);
  go();
  await merging;

  for (const { project } of [room, ann]) {
    await expect.poll(() => char(project, 1, 1), PATIENT).toBe('A');
    await expect.poll(() => painted(project, 8, 8)?.a, PATIENT).toBe(1);
  }
  await allMatch(room, ann);
  expect(room.host.holding).toBe(null);
});

test('what an artist draws while Bake encodes survives on every screen', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  room.project.setSlider('brightness', 120);
  room.project.commitSliders('brightness');
  await expect.poll(() => ann.project.brightness, PATIENT).toBe(120);

  const { spy, go } = holdEncoding();
  const baking = room.project.bake();
  await expect.poll(() => spy.mock.calls.length, PATIENT).toBeGreaterThan(0);
  ann.project.editCell(1, 1, { char: 'A' });
  dab(ann.project, 8, 8);
  ann.project.commitEdit();
  await wait(150);
  go();
  await baking;

  for (const { project } of [room, ann]) {
    await expect.poll(() => char(project, 1, 1), PATIENT).toBe('A');
    await expect.poll(() => painted(project, 8, 8)?.a, PATIENT).toBe(1);
  }
  await allMatch(room, ann);
});

test('a project whose settings are bad is refused, with nothing applied', async () => {
  const room = await hosting();
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  const ann = await artist(room, 'ann');
  const { n, epoch } = room.project._ledger;
  const parts = await room.project.projectParts();
  const buffer = await new Blob([room.project.imageBuffer]).arrayBuffer();
  const brightness = ann.project.brightness;
  const taken = await ann.project.takeProject({
    settings: { ...parts.settings, brightness: brightness + 1, baseScale: 1e9 }, imageBuffer: buffer, paintBuffer: null, baseBuffer: null, editCells: new Map(), baseRecords: parts.baseRecords,
  }, { n: n + 1, epoch, took: 0, filename: 'x' });
  expect(taken).toBe(false);
  expect(ann.project.brightness).toBe(brightness);
  expect(char(ann.project, 1, 1)).toBe('H');
});

test('an undo the host can\'t do says so and takes the step away, and the older one is still there', async () => {
  toastMessage.value = null;
  const room = await hosting();
  const ann = await artist(room, 'ann');
  ann.project.editCell(1, 1, { char: 'A' });
  ann.project.commitEdit();
  ann.project.editCell(2, 2, { char: 'B' });
  ann.project.commitEdit();
  await allMatch(room, ann);
  room.project._ledger.forget(room.project._ledger.strokesBy('ann').at(-1));

  ann.project.undo();
  await expect.poll(() => toastMessage.value, PATIENT).toBe('That can\'t be undone anymore.');
  expect(ann.project.history.canRedo).toBe(false);
  expect(ann.project._sharing.strokesAsked).toEqual([]);
  expect(char(ann.project, 2, 2)).toBe('B');
  ann.project.undo();
  await expect.poll(() => char(room.project, 1, 1), PATIENT).toBe(undefined);
  await allMatch(room, ann);
  expect(char(ann.project, 1, 1)).toBe(undefined);
});

test('a redo the host can\'t do says so and takes the step away', async () => {
  toastMessage.value = null;
  const room = await hosting();
  const ann = await artist(room, 'ann');
  ann.project.editCell(1, 1, { char: 'A' });
  ann.project.commitEdit();
  ann.project.editCell(2, 2, { char: 'B' });
  ann.project.commitEdit();
  await allMatch(room, ann);
  const last = room.project._ledger.strokesBy('ann').at(-1);
  ann.project.undo();
  await expect.poll(() => char(ann.project, 2, 2), PATIENT).toBe(undefined);
  await allMatch(room, ann);
  expect(ann.project._sharing.strokesAsked).toEqual([]);
  room.project._ledger.forget(last);

  ann.project.redo();
  await expect.poll(() => toastMessage.value, PATIENT).toBe('That can\'t be redone anymore.');
  expect(ann.project.history.canRedo).toBe(false);
  expect(ann.project.history.canUndo).toBe(true);
  ann.project.undo();
  await expect.poll(() => char(room.project, 1, 1), PATIENT).toBe(undefined);
});

test('an undo held across a project that replaced the stacks says so', async () => {
  toastMessage.value = null;
  const room = await hosting();
  const ann = await artist(room, 'ann');
  ann.project.editCell(1, 1, { char: 'A' });
  ann.project.commitEdit();
  await allMatch(room, ann);
  room.host.hold();
  ann.project.undo();
  await expect.poll(() => room.host.holding.length, PATIENT).toBe(1);
  room.project.mergeDown();
  room.host.release();
  await expect.poll(() => toastMessage.value, PATIENT).toBe('That can\'t be undone anymore.');
});

test('an undo lost with its connection says so once the host has said all it numbered', async () => {
  toastMessage.value = null;
  const room = await hosting();
  const ann = await artist(room, 'ann');
  ann.project.editCell(1, 1, { char: 'A' });
  ann.project.commitEdit();
  await allMatch(room, ann);
  const { send } = ann.project._sharing;
  ann.project._sharing.send = () => {};
  ann.project.undo();
  ann.project._sharing.send = send;
  expect(toastMessage.value).toBe(null);
  ann.drawing.connection('connecting');
  ann.drawing.heardArtists(['ann'], {});   // a new connection's list, and with it the hello
  await expect.poll(() => toastMessage.value, PATIENT).toBe('That can\'t be undone anymore.');
  expect(ann.project.history.canRedo).toBe(false);
});

test('an undo the host did says nothing, on a reconnect either', async () => {
  toastMessage.value = null;
  const room = await hosting();
  const ann = await artist(room, 'ann');
  ann.project.editCell(1, 1, { char: 'A' });
  ann.project.commitEdit();
  await allMatch(room, ann);
  ann.project.undo();
  await expect.poll(() => char(ann.project, 1, 1), PATIENT).toBe(undefined);
  await allMatch(room, ann);
  ann.drawing.connection('connecting');
  ann.drawing.heardArtists(['ann'], {});
  await wait(200);
  expect(toastMessage.value).toBe(null);
  expect(ann.project.history.canRedo).toBe(true);
});

test('a host\'s own undo the ledger no longer has says so and takes the step away', async () => {
  toastMessage.value = null;
  const room = await hosting();
  await artist(room, 'ann');
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  room.project._ledger.forget(room.project._ledger.strokesBy('host').at(-1));
  room.project.undo();
  expect(toastMessage.value).toBe('That can\'t be undone anymore.');
  expect(room.project.history.canRedo).toBe(false);
  expect(char(room.project, 1, 1)).toBe('H');
});

test('back from a reload, an artist can\'t draw until the project has come: nothing is silently replaced', async () => {
  const room = await hosting();
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  room.drawing.resumeHosting({ artists: ['ann'], invited: [] }, null);
  room.drawing.hostingAgain();
  sessionStorage.setItem('phosphor-artist:room:ann', 'their-document');
  await expect.poll(() => room.drawing.paused, PATIENT).toBe(true);
  const ann = await join(room, 'ann');
  await expect.poll(() => ann.drawing.mayDraw, PATIENT).toBe(true);
  expect(ann.drawing.paused).toBe(false);
  expect(ann.project._paused).toBe(false);
  ann.project.editCell(2, 2, { char: 'A' });
  expect(char(ann.project, 2, 2)).toBe('A');
});

test('the wait for the project of a reload holds through a live connection, and ends if the list says otherwise', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  project.ensureLayer();
  const drawing = useDrawingStore();
  toStop.push(() => drawing.close());
  sessionStorage.setItem('phosphor-artist:room:ann', project.documentId);
  drawing.watching({ post: () => true }, { me: () => 'ann', roomId: 'room', roomName: () => 'Night shift' });
  expect(drawing.paused).toBe(true);
  project.editCell(2, 2, { char: 'A' });
  expect(char(project, 2, 2)).toBe(undefined);
  drawing.connection('live');
  expect(drawing.paused).toBe(true);
  drawing.heardArtists([], {});
  expect(drawing.paused).toBe(false);
  project.editCell(2, 2, { char: 'A' });
  expect(char(project, 2, 2)).toBe('A');
});

test('the wait for the project of a reload ends when the connection fails, as nothing is coming', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  project.ensureLayer();
  const drawing = useDrawingStore();
  toStop.push(() => drawing.close());
  sessionStorage.setItem('phosphor-artist:room:ann', project.documentId);
  drawing.watching({ post: () => true }, { me: () => 'ann', roomId: 'room', roomName: () => 'Night shift' });
  expect(drawing.paused).toBe(true);
  drawing.connection('failed');
  expect(drawing.paused).toBe(false);
  expect(project._paused).toBe(false);
});

test('a tall project reaches an artist, who draws on it, at both ends of the grid', async () => {
  const room = await hosting({ cols: 40, rows: 6000 });   // 3000 lines
  expect(room.project.baseLayer.scale).toBeGreaterThanOrEqual(1);
  const ann = await artist(room, 'ann');
  expect([ann.project.cols, ann.project.rows]).toEqual([40, 6000]);
  expect(ann.project.baseLayer.scale).toBe(room.project.baseLayer.scale);
  ann.project.editCell(3, 2990, { char: 'A' });
  ann.project.commitEdit();
  dab(ann.project, 5, ann.project.paintLayer.canvas.height - 2);
  ann.project.commitEdit();
  room.project.editCell(4, 2, { char: 'H' });
  room.project.commitEdit();
  await allMatch(room, ann);
  expect(char(room.project, 3, 2990)).toBe('A');
  expect(char(ann.project, 4, 2)).toBe('H');
});

// The last list the host's socket sent: the tag an answer to it says.
const lastList = (room) => room.socket.findLast((msg) => msg.type === 'artists');

test('a list the room says unasked, while the host\'s is on its way, costs someone just accepted nothing', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann');
  room.drawing.artistsNow(['ann'], lastList(room).tag);
  const bob = await join(room, 'bob');
  expect(room.drawing.invite('bob')).toBe(true);
  await expect.poll(() => bob.drawing.invitation, PATIENT).toBe(true);
  bob.drawing.accept();
  await expect.poll(() => bob.drawing.mayDraw, PATIENT).toBe(true);
  const { tag } = lastList(room);
  bob.project.editCell(1, 1, { char: 'B' });
  bob.project.commitEdit();

  room.drawing.artistsNow(['ann']);   // unasked: from before the room took bob
  await wait(100);
  expect(room.drawing.artists).toEqual(['ann', 'bob']);
  expect(lastList(room).tag).toBe(tag);   // nothing was said again
  expect(bob.drawing.mayDraw).toBe(true);
  expect(bob.drawing.invitation).toBe(false);

  room.drawing.artistsNow(['ann', 'bob'], tag);
  await allMatch(room, ann, bob);
  expect(char(room.project, 1, 1)).toBe('B');
  expect(char(bob.project, 1, 1)).toBe('B');
});

test('while a list is on its way only the answer to the latest counts, and it\'s the room\'s word', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  await allMatch(room, ann, bob);
  const first = lastList(room).tag;
  room.drawing.backToWatching('bob');
  const second = lastList(room).tag;
  expect(second).not.toBe(first);
  room.drawing.artistsNow(['ann', 'bob'], first);   // an older answer
  expect(room.drawing.artists).toEqual(['ann']);
  room.drawing.artistsNow([], second);              // the room left ann off
  expect(room.drawing.artists).toEqual([]);
  room.drawing.artistsNow(['ann'], first);          // late, with nothing on its way
  expect(room.drawing.artists).toEqual([]);
});

test('with no list on its way, a list the room says unasked is the list', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  await allMatch(room, ann, bob);
  room.drawing.artistsNow(['ann', 'bob'], lastList(room).tag);
  room.drawing.artistsNow(['ann']);
  expect(room.drawing.artists).toEqual(['ann']);
  await expect.poll(() => bob.drawing.mayDraw, PATIENT).toBe(false);
  expect(ann.drawing.mayDraw).toBe(true);
});

test('the socket coming back forgets the list that was on its way, and the room\'s unasked one is the list', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  await allMatch(room, ann, bob);
  room.drawing.artistsNow(['ann', 'bob'], lastList(room).tag);
  room.drawing.backToWatching('bob');   // its answer goes with the socket
  room.drawing.artistsNow(['ann']);     // the room's word, while that's still on its way
  const sent = room.socket.length;
  room.drawing.hostingAgain();
  expect(room.socket).toHaveLength(sent);   // it's what the room last said
  room.drawing.artistsNow([]);
  expect(room.drawing.artists).toEqual([]);
});

test('a list sent on the way back is the one that waits for its answer, past the room\'s unasked one', async () => {
  const room = await hostingWithSocket();
  const ann = await artist(room, 'ann'), bob = await artist(room, 'bob');
  await allMatch(room, ann, bob);
  room.drawing.artistsNow(['ann', 'bob'], lastList(room).tag);
  room.host.send = () => false;   // the socket's down: this one goes when it's back
  room.drawing.backToWatching('bob');
  room.host.send = (msg) => { room.socket.push(msg); return true; };
  room.drawing.hostingAgain();
  const { subs, tag } = lastList(room);
  expect(subs).toEqual(['ann']);
  room.drawing.artistsNow(['ann', 'bob']);   // the room's unasked, right after hosting
  expect(room.drawing.artists).toEqual(['ann']);
  room.drawing.artistsNow(['ann'], tag);
  expect(room.drawing.artists).toEqual(['ann']);
});

test('a refusal for what was never asked does nothing: no step goes, and nothing\'s said', async () => {
  toastMessage.value = null;
  const room = await hosting();
  const ann = await artist(room, 'ann');
  ann.project.editCell(1, 1, { char: 'A' });
  ann.project.commitEdit();
  await allMatch(room, ann);
  const [stroke] = room.project._ledger.strokesBy('ann');
  ann.project.strokeRefused('undo', stroke);
  expect(toastMessage.value).toBe(null);
  expect(ann.project.canUndo).toBe(true);
});

test('a refusal goes by what was asked: an undo and a redo of one stroke are two questions', async () => {
  toastMessage.value = null;
  const room = await hosting();
  const ann = await artist(room, 'ann');
  ann.project.editCell(1, 1, { char: 'A' });
  ann.project.commitEdit();
  await allMatch(room, ann);
  const [stroke] = room.project._ledger.strokesBy('ann');
  room.host.hold();
  ann.project.askForStroke('undo', stroke);
  ann.project.strokeRefused('redo', stroke);   // not what's asked
  expect(toastMessage.value).toBe(null);
  expect(ann.project._sharing.strokesAsked).toEqual([{ kind: 'undo', stroke }]);
  ann.project.askForStroke('redo', stroke);
  ann.project.strokeRefused('redo', stroke);
  expect(toastMessage.value).toBe('That can\'t be redone anymore.');
  expect(ann.project._sharing.strokesAsked).toEqual([{ kind: 'undo', stroke }]);
});

test('put back to watching before the room\'s art came, a former host asked again isn\'t told they\'re back as one', async () => {
  toastMessage.value = null;
  const room = await hosting();
  const ann = await join(room, 'ann');
  ann.drawing.noteFormerHost();
  ann.drawing.heardArtists([]);
  expect(room.drawing.invite('ann')).toBe(true);
  await expect.poll(() => ann.drawing.invitation, PATIENT).toBe(true);
  ann.drawing.accept();
  await expect.poll(() => ann.drawing.mayDraw, PATIENT).toBe(true);
  expect(ann.drawing.notice).toBe(null);
  expect(toastMessage.value).toBe(null);
});

test('named host before the room\'s art came, a former host isn\'t told later that they\'re back as one', async () => {
  toastMessage.value = null;
  const room = await hosting();
  const ann = await artist(room, 'ann');
  await allMatch(room, ann);
  ann.drawing.noteFormerHost();
  const hosting2 = new Host({ config, passKey, roomId: 'room', send: async () => {}, ...ann.drawing.hostCallbacks() });
  toStop.push(() => hosting2.close());
  ann.watch.close();
  ann.drawing.hosted(hosting2, { me: () => 'ann' });
  ann.drawing.takeOver(hosting2, { planned: false });
  hosting2.close();

  // The role moves on from them in time, and the room's art comes.
  const answers = ann.drawing.watchCallbacks();
  ann.drawing.watching({ post: () => true }, { me: () => 'ann', roomId: 'room', roomName: () => 'Night shift' });
  ann.drawing.becomeArtist();
  ann.drawing.heardArtists(['ann']);
  vi.spyOn(ann.project, 'takeProject').mockResolvedValue(true);
  ann.drawing.notice = null;
  await answers.onProject({ n: 9, epoch: 'e', took: 0, parts: {} });
  expect(ann.drawing.notice).toBe(null);
  expect(toastMessage.value).toBe(null);
});

test('back as an artist, what\'s said joins what\'s still being said', async () => {
  toastMessage.value = null;
  const room = await hosting();
  room.project.editCell(1, 1, { char: 'H' });
  room.project.commitEdit();
  const ann = await join(room, 'ann');
  ann.drawing.noteFormerHost();
  ann.drawing.notice = 'Your undo starts over. All the drawing is still here.';
  ann.drawing.heardArtists(['ann']);
  room.drawing.artistsNow(['ann']);
  await expect.poll(() => ann.project.image, PATIENT).toBeTruthy();
  await expect.poll(() => ann.drawing.notice, PATIENT).toContain('What you had open');
  expect(ann.drawing.notice).toContain('Your undo starts over.');
  expect(toastMessage.value).toContain('What you had open');
  expect(toastMessage.value).not.toContain('undo starts over');
});

test('a block held when the art is replaced from a new start still goes out on its time, once', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  ann.project.editCell(1, 1, { char: 'A' });
  ann.project.commitEdit();
  await allMatch(room, ann);
  const posted = vi.spyOn(ann.watch, 'post');
  ann.project.floatSelection({ c0: 1, r0: 1, c1: 1, r1: 1 }, { base: false, edit: true }, 2, 0);
  await wait(150);
  expect(posted.mock.calls.filter(([msg]) => msg.t === 'change')).toEqual([]);
  room.project.shareWholeDocument();
  await expect.poll(() => ann.project._sharing.epoch, PATIENT).toBe(room.project._ledger.epoch);
  await wait(HELD_FLOAT_MS + 200);
  expect(ann.project._sharing.held).toBe(null);
  expect(posted.mock.calls.filter(([msg]) => msg.t === 'change')).toHaveLength(1);
  await allMatch(room, ann);
  expect(char(room.project, 3, 1)).toBe(char(ann.project, 3, 1));
}, 15_000);

test('a project that finishes opening after a new connection began leaves that connection still catching up', async () => {
  const room = await hosting();
  const ann = await artist(room, 'ann');
  const take = ann.project.takeProject.bind(ann.project);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const taking = vi.spyOn(ann.project, 'takeProject').mockImplementation(async (...args) => {
    await gate;
    return take(...args);
  });
  await room.host.sendProject(seat(room, 'ann'));
  await expect.poll(() => taking.mock.calls.length, PATIENT).toBe(1);
  ann.drawing.connection('lost');
  ann.drawing.connection('connecting');
  release();
  await taking.mock.results[0].value;
  await later();
  expect(ann.drawing.paused).toBe(true);   // the new connection's host hasn't said what it numbered
  ann.drawing.connection('live');
  expect(ann.drawing.paused).toBe(true);
});

// The art's font is the host's: an artist draws in it, as a watcher sees in it, and their own comes back after.
const fontArt = (font) => ({ cols: 2, lines: 1, font, cells: [{ char: 'a' }, { char: 'b' }] });
const fontOf = (person) => useWorkspaceStore(person.pinia).displayFontSpec;

test('an artist draws in the host\'s font, follows it as it changes, and has their own back when they stop', async () => {
  const room = await hosting();
  room.host.setArt(fontArt({ id: 'vga', size: 20 }));
  const ann = await artist(room, 'ann');
  useWorkspaceStore(ann.pinia).displayFont = 'unscii';
  await expect.poll(() => fontOf(ann).id, PATIENT).toBe('vga');
  expect(fontOf(ann).size).toBe(20);
  expect(fontOf(ann).family).toContain('IBM VGA');

  room.host.setArt(fontArt({ id: 'unifont', size: 32 }));
  await expect.poll(() => [fontOf(ann).id, fontOf(ann).size], PATIENT).toEqual(['unifont', 32]);

  room.drawing.backToWatching('ann');
  await expect.poll(() => ann.drawing.mayDraw, PATIENT).toBe(false);
  expect(fontOf(ann).id).toBe('unscii');   // theirs, which the host's never replaced
  expect(useWorkspaceStore(ann.pinia).roomFont).toBe(null);
});

test('an artist who arrives after the font changed, or whose host\'s font is their own, gets what a watcher gets', async () => {
  const room = await hosting();
  room.host.setArt(fontArt({ id: 'vga', size: 20 }));
  room.host.setArt(fontArt({ id: 'unifont', size: 24 }));
  const ann = await artist(room, 'ann');
  await expect.poll(() => [fontOf(ann).id, fontOf(ann).size], PATIENT).toEqual(['unifont', 24]);

  room.host.setArt(fontArt(null));   // loaded from the host's computer: it can't be sent
  await expect.poll(() => fontOf(ann).id, PATIENT).toBe('jetbrains');
});

test('someone only watching is sent no font message, and leaving forgets the room\'s font', async () => {
  const room = await hosting();
  room.host.setArt(fontArt({ id: 'vga', size: 20 }));
  const watcher = await join(room, 'wes');
  const ann = await artist(room, 'ann');
  await expect.poll(() => fontOf(ann).id, PATIENT).toBe('vga');
  room.host.setArt(fontArt({ id: 'unifont', size: 20 }));
  await expect.poll(() => fontOf(ann).id, PATIENT).toBe('unifont');
  expect(useWorkspaceStore(watcher.pinia).roomFont).toBe(null);

  ann.drawing.close();
  expect(useWorkspaceStore(ann.pinia).roomFont).toBe(null);
});
