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
import { useDrawingStore } from '@/store/DrawingStore';
import { useProjectStore } from '@/store/ProjectStore';
import { useRoomStore } from '@/store/RoomStore';

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
async function hosting() {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
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
  vi.spyOn(room.host, 'onChange').mockImplementation(() => true);   // the host hasn't got to it yet
  ann.project.editCell(6, 6, { char: 'A' });
  ann.project.commitEdit();
  await expect.poll(() => ann.project._sharing.pending.size, PATIENT).toBe(1);
  await room.host.sendProject(w);
  await expect.poll(() => char(ann.project, 5, 5) === 'H' && ann.project.documentId === id && ann.project._sharing.pending.n === room.project._ledger.n, PATIENT).toBe(true);
  expect(char(ann.project, 6, 6)).toBe('A');
  expect(ann.project._sharing.pending.sum).toBe(room.project.editLayerSum());   // seeded before reapply
  expect(ann.drawing.mayDraw).toBe(true);
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
