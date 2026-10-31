// Drawing together, end to end but for the screen: a host's and artists' project stores, each in its own
// pinia, joined by a real Host and real Watches over real WebRTC (no STUN), with a relay for signals and
// passes signed by a test key. The tests draw through the stores and read what each ends up with.
import { test, expect, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { watch } from 'vue';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { Host } from '@/social/hosting';
import { Watch } from '@/social/watching';
import { toBase64url } from '@/social/base64url';
import { CHECK_EVERY_MS, useDrawingStore } from '@/store/DrawingStore';
import { useProjectStore } from '@/store/ProjectStore';
import { ASK_AGAIN_MS } from '@/store/project/sharing';
import { useRoomStore } from '@/store/RoomStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { serializeBase, withPins } from '@/document/baseRecords';
import { CHUNK_BYTES } from '@/social/wire';
import { hashCell } from '@/document/changes';

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

  const history = person.project.history;
  expect(await take({ settings: { ...whole.settings, _sharing: 'x', history: 'x', image: 'x', renderer: 'x', baseScale: -1 }, editCells: new Map([['299,4999', { char: 'p' }]]) })).toBe(true);
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

test('an undo the ledger can\'t do has no reply', async () => {
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

