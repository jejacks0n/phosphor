// Drawing together: a host and an artist, each a real page in one fake Room, joined by real WebRTC. Art never
// passes through the server, so all of this is between the two pages; the room's socket only carries signals.
import { readFile } from 'node:fs/promises';
import { test, expect, tab, store, chars, editAt, cellPoint, settled, saveAs, openApp, imageInput } from './support.js';
import { fakeRoom, member, ROOM_ID, goLive, shown, chat, hash, selected, ARTIST, people, rowOf, invitation, mayDraw, fromMenu, invitedPage, artistPage, watcherPage, joinFromCard } from './social-support.js';

const WAITING_WORDS = 'The host is reconnecting. Drawing is paused.';
const ONLY_HOST = 'Only the host can do this.';
const NOT_WHILE = 'Not while others are drawing.';
const MERGE_WARNING = 'Strokes merged into the image can\'t be undone by anyone.';
const UNSAVED = 'Accepting replaces your open art, which has unsaved changes.';

const edits = (page) => store(page, 'project', (p) => JSON.stringify([...p.editCells].sort(([a], [b]) => (a < b ? -1 : 1))));
const shownCells = (page) => store(page, 'project', (p) => p.cells.map((c) => c.char + c.fg.hex + c.bg.hex).join());
const pauseLayer = (page) => page.locator('.pause-layer');
const undoButton = (page) => page.locator('.history-group button').first();
const redoKey = 'ControlOrMeta+Shift+z', undoKey = 'ControlOrMeta+z';

// Host and artist live on the ANSI tab with gradient (or what's given) open.
async function together(host, context, room, options = {}) {
  const server = await goLive(host, room, options);
  const artist = await artistPage(context, host, room);
  await tab(host, 'ANSI').click();
  await settled(host);
  return { artist, server };
}

// Types at a cell, and the run of typing ends.
async function typeAt(page, col, row, text) {
  await editAt(page, col, row);
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
}

// The top of tall art in view.
const toTopOfArt = async (page) => {
  await page.locator('.ansi-editor .display').evaluate((el) => el.scrollIntoView({ block: 'start', inline: 'start' }));
  await settled(page);
};

// How many pixels are painted on a row of cells.
const paintedOnRow = (page, row) => store(page, 'project', `(p) => {
  if (!p.paintLayer) return 0;
  const scale = p.paintLayer.scale;
  let count = 0;
  for (let y = ${row} * 2 * scale; y < (${row} + 1) * 2 * scale; y++) for (let x = 0; x < p.cols * scale; x++) if (p.paintLayer.pixelAt(x, y)) count++;
  return count;
}`);

const sameArt = async (a, b) => {
  await expect.poll(() => edits(a), { timeout: 10_000 }).toBe(await edits(b));
};

// The host's page goes away and comes back, as a reload does; it waits at who-you-are until release().
async function hostAway(host) {
  host.on('dialog', (dialog) => dialog.accept());
  let release = null;
  const held = new Promise((resolve) => { release = resolve; });
  await host.route(/\/api\/me$/, async (route) => {
    await held;
    await route.fallback().catch(() => {});
  });
  await host.reload();
  return release;
}

// The host's Host says it's going without the page going, so its ledger stays: the artist's channel closes,
// the room's socket drops the watcher, and they come back in on a new connection.
const hostSaysAway = (host) => store(host, 'room', (r) => r._host.goingAway());

test('the host invites, the row says invited, and withdrawing takes the notice away', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const person = await invitedPage(context, host, room);
  await expect(rowOf(host).getByText('invited', { exact: true })).toBeVisible();
  await expect(invitation(person)).toContainText('ansi-fan invited you to draw.');

  await fromMenu(host, 'Withdraw invitation');
  await expect(invitation(person)).toHaveCount(0);
  await expect(rowOf(host).getByText('invited', { exact: true })).toHaveCount(0);
  await rowOf(host).getByRole('button', { name: 'More for tin_owl' }).click();
  await expect(rowOf(host).getByRole('button', { name: 'Make artist' })).toBeVisible();
  await host.keyboard.press('Escape');

  // Not now: only the notice goes, and the host can ask again.
  await fromMenu(host, 'Make artist');
  await invitation(person).getByRole('button', { name: 'Not now' }).click();
  await expect(invitation(person)).toHaveCount(0);
  await expect(rowOf(host).getByText('invited', { exact: true })).toHaveCount(0);
  await fromMenu(host, 'Make artist');
  await expect(invitation(person)).toBeVisible();

  // Leaving clears it.
  await chat(person).getByRole('button', { name: 'Exit' }).click();
  await expect(rowOf(host)).toHaveCount(0);
  await expect.poll(() => store(host, 'drawing', (d) => d.invited)).toEqual([]);
});

test('a guest can\'t be asked', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const guest = await watcherPage(context, room);
  await guest.goto('/');
  await joinFromCard(guest);
  await chat(host).getByRole('button', { name: /^\d+ here$/ }).click();
  await expect(people(host).getByRole('listitem')).toHaveCount(1);
  await expect(host.getByRole('button', { name: 'Make artist' })).toHaveCount(0);
});

test('the notice doesn\'t block: they save their art, then accept', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const person = await invitedPage(context, host, room, { prepare: (page) => openApp(page, 'images/photo.jpg') });
  await tab(person, 'ANSI').click();
  await typeAt(person, 1, 1, 'mine');
  await expect(invitation(person).getByText(UNSAVED)).toBeVisible();

  const download = await saveAs(person, 'Save Project (.phosphor)');
  expect(download.suggestedFilename()).toMatch(/^photo.*\.phosphor$/);
  await expect(invitation(person).getByText(UNSAVED)).toHaveCount(0);
  await expect(invitation(person)).toBeVisible();
  await invitation(person).getByRole('button', { name: 'Accept' }).click();
  await mayDraw(person).toBe(true);
});

test('the notice warns when the open art is unsaved, and not otherwise', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const person = await invitedPage(context, host, room, { prepare: (page) => openApp(page, 'images/photo.jpg') });
  await expect(invitation(person)).toBeVisible();
  await expect(invitation(person).getByText(UNSAVED)).toHaveCount(0);
  await tab(person, 'ANSI').click();
  await typeAt(person, 1, 1, 'mine');
  await expect(invitation(person).getByText(UNSAVED)).toBeVisible();
});

test('accepting opens the room\'s art, and the row shows the artist tag', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  await tab(host, 'ANSI').click();
  await typeAt(host, 3, 2, 'Z');
  const artist = await artistPage(context, host, room);

  await selected(artist, 'ANSI');   // the watcher's view closes for the editor
  expect(await chars(artist, 2, 3, 3)).toBe('Z');
  await expect(rowOf(host).getByText('artist', { exact: true })).toBeVisible();
  await expect(invitation(artist)).toHaveCount(0);
  expect(await store(artist, 'room', (r) => r.role)).toBe('watch');

  // In the room on PIXEL and ANSI, at the address, and Back and Forward as for anyone watching.
  await hash(artist, `/ansi?room=${ROOM_ID}`);
  await tab(artist, 'PIXEL').click();
  await hash(artist, `/pixel?room=${ROOM_ID}`);
  expect(await store(artist, 'room', (r) => r.id)).toBe(ROOM_ID);
  await artist.goBack();
  await selected(artist, 'ANSI');
  await expect.poll(() => store(artist, 'drawing', (d) => d.mayDraw)).toBe(true);
  await artist.goForward();
  await selected(artist, 'PIXEL');
  expect(await store(artist, 'room', (r) => r.status)).toBe('live');
});

test('replaced art is still in the autosave list', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const person = await invitedPage(context, host, room, { prepare: (page) => openApp(page, 'images/photo.jpg') });
  await tab(person, 'ANSI').click();
  await settled(person);
  const own = await store(person, 'project', (p) => p.documentId);
  await editAt(person, 4, 4);
  await person.keyboard.type('L');   // its last moment: no autosave has run for this yet
  await invitation(person).getByRole('button', { name: 'Accept' }).click();
  await mayDraw(person).toBe(true);
  expect(await store(person, 'project', (p) => p.documentId)).not.toBe(own);

  // Out of the room, back to the start screen: it's listed, and it opens with that last letter.
  await chat(person).getByRole('button', { name: 'Exit' }).click();
  person.on('dialog', (dialog) => dialog.accept());
  await tab(person, 'PIXEL').click();
  await person.getByRole('button', { name: 'Start New Project' }).click();
  await person.getByRole('button', { name: 'Open: photo' }).click();
  await settled(person);
  expect(await store(person, 'project', (p) => p.documentId)).toBe(own);
  expect(await chars(person, 4, 4, 4)).toBe('L');
});

test('each sees the other\'s stroke before it ends', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  for (const [from, to] of [[artist, host], [host, artist]]) {
    await from.keyboard.press('Escape');
    await from.getByRole('button', { name: 'Pencil' }).click();
    const a = await cellPoint(from, 5, from === artist ? 5 : 8), b = await cellPoint(from, 12, from === artist ? 5 : 8);
    await from.mouse.move(a.x, a.y);
    await from.mouse.down();
    await from.mouse.move(b.x, b.y, { steps: 5 });
    await expect.poll(() => paintedOnRow(to, from === artist ? 5 : 8)).toBeGreaterThan(0);
    expect(await store(from, 'workspace', (w) => w.isPainting)).toBe(true);   // the press is still down
    await from.mouse.up();
  }
  await expect.poll(() => shownCells(artist), { timeout: 10_000 }).toBe(await shownCells(host));
});

test('undo takes back mine and shows theirs beneath', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await typeAt(host, 3, 2, 'H');
  await expect.poll(() => chars(artist, 2, 3, 3)).toBe('H');
  await typeAt(artist, 3, 2, 'A');
  await expect.poll(() => chars(host, 2, 3, 3)).toBe('A');
  await artist.keyboard.press(undoKey);
  await expect.poll(() => chars(artist, 2, 3, 3)).toBe('H');
  await expect.poll(() => chars(host, 2, 3, 3)).toBe('H');
  await artist.keyboard.press(redoKey);
  await expect.poll(() => chars(host, 2, 3, 3)).toBe('A');
  await sameArt(artist, host);
});

test('an artist\'s host-only controls are off with the reason', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await typeAt(artist, 1, 1, 'x');

  const panel = artist.locator('aside.control-panel');
  for (const control of ['#cols', '#rows', '#renderStyle', '#quantize', '#seed']) await expect(panel.locator(control)).toBeDisabled();
  await expect(panel.getByRole('slider').first()).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'RESET' }).first()).toBeDisabled();
  for (const fieldset of await panel.locator('fieldset').all()) await expect(fieldset).toHaveAttribute('title', ONLY_HOST);

  const actions = artist.locator('.edit-toolbar .desktop-only button.primary');
  await expect(actions).toHaveCount(3);
  for (const button of await actions.all()) {
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('title', ONLY_HOST);
  }
  for (const name of ['Start New Project', 'Versions']) {
    await expect(panel.getByRole('button', { name })).toBeDisabled();
    await expect(panel.getByRole('button', { name })).toHaveAttribute('title', ONLY_HOST);
  }

  // The Select tool's: Base is off, and Merge up and down are.
  await artist.keyboard.press('Escape');
  await artist.getByRole('button', { name: 'Select', exact: true }).click();
  const base = artist.getByRole('group', { name: 'Layers the selection acts on' }).getByRole('button', { name: 'Base' });
  await expect(base).toBeDisabled();
  await expect(base).toHaveAttribute('aria-pressed', 'false');
  await expect(base).toHaveAttribute('title', ONLY_HOST);
  for (const name of ['Merge up', 'Merge down']) {
    const button = artist.locator('.edit-toolbar button.text').filter({ hasText: name });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('title', ONLY_HOST);
  }

  // Saving stays.
  await expect(artist.locator('.edit-toolbar')).toBeVisible();
  await artist.keyboard.press('ControlOrMeta+s');
  await expect(artist.getByRole('dialog')).toBeVisible();
});

test('host: Open, New image, Blank canvas, restore and Clear are off while an artist is connected', async ({ page: host, context }) => {
  const room = fakeRoom();
  await together(host, context, room);
  await typeAt(host, 1, 1, 'h');

  const clear = host.locator('.edit-toolbar .desktop-only button.primary').nth(2);
  await expect(clear).toBeDisabled();
  await expect(clear).toHaveAttribute('title', NOT_WHILE);
  const undone = host.locator('.edit-toolbar .desktop-only button.primary').nth(1);
  await expect(undone).toBeEnabled();   // Merge isn't: it warns instead

  const panel = host.locator('aside.control-panel');
  for (const name of ['Start New Project', 'Versions']) {
    await expect(panel.getByRole('button', { name })).toBeDisabled();
    await expect(panel.getByRole('button', { name })).toHaveAttribute('title', NOT_WHILE);
  }

  // Dropping a file opens nothing, and says why.
  const id = await store(host, 'project', (p) => p.documentId);
  const dropped = await host.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['x'], 'other.png', { type: 'image/png' }));
    return data;
  });
  await host.dispatchEvent('.drop-zone', 'drop', { dataTransfer: dropped });
  await expect(host.getByText(NOT_WHILE)).toBeVisible();
  expect(await store(host, 'project', (p) => p.documentId)).toBe(id);
});

test('host: Merge warns, and afterward undo can\'t take it back', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await typeAt(host, 2, 2, 'M');
  await expect.poll(() => chars(artist, 2, 2, 2)).toBe('M');
  await expect(undoButton(host)).toBeEnabled();

  await host.locator('.edit-toolbar .desktop-only button.primary').nth(1).click();
  const dialog = host.getByRole('dialog', { name: 'Merge down' });
  await expect(dialog.getByText(MERGE_WARNING)).toBeVisible();
  await dialog.getByRole('button', { name: /Exactly as is/ }).click();
  await expect(undoButton(host)).toBeDisabled();
  await expect.poll(() => store(host, 'project', (p) => p.editCells.size)).toBe(0);
  await expect.poll(() => store(artist, 'project', (p) => p.editCells.size), { timeout: 10_000 }).toBe(0);
  await expect.poll(() => chars(artist, 2, 2, 2)).toBe('M');
});

test('host: Bake warns too, while others are connected', async ({ page: host, context }) => {
  const room = fakeRoom();
  await together(host, context, room);
  await store(host, 'project', (p) => { p.setSlider('brightness', 120); p.commitSliders('brightness'); });
  await host.locator('.edit-toolbar .desktop-only button.primary').first().click();
  const dialog = host.getByRole('dialog', { name: 'Bake' });
  await expect(dialog.getByText(MERGE_WARNING)).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await store(host, 'project', (p) => p.brightness)).toBe(120);
});

test('host alone again has its normal controls', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await typeAt(host, 1, 1, 'h');
  await fromMenu(host, 'Back to watching');
  await mayDraw(artist).toBe(false);

  const clear = host.locator('.edit-toolbar .desktop-only button.primary').nth(2);
  await expect(clear).toBeEnabled();
  await expect(clear).toHaveAttribute('title', /^Clear edit layer/);
  await expect(undoButton(host)).toBeEnabled();
  await host.locator('.edit-toolbar .desktop-only button.primary').nth(1).click();
  const dialog = host.getByRole('dialog', { name: 'Merge down' });
  await expect(dialog.getByText(MERGE_WARNING)).toHaveCount(0);
  await dialog.getByRole('button', { name: /Exactly as is/ }).click();
  await expect(undoButton(host)).toBeEnabled();   // undoable again, as alone
  await expect(host.locator('aside.control-panel').getByRole('button', { name: 'Versions' })).toBeEnabled();
});

test('an artist who dropped out holds nothing up: the host\'s controls come back, and opening something empties the list', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await artist.close();
  await expect.poll(() => store(host, 'drawing', (d) => d.othersHere)).toBe(false);
  expect(await store(host, 'drawing', (d) => d.artists)).toEqual([ARTIST.id]);
  const clear = host.locator('.edit-toolbar .desktop-only button.primary').nth(2);
  await expect(clear).not.toHaveAttribute('title', NOT_WHILE);
  host.on('dialog', (dialog) => dialog.accept());
  await host.locator('aside.control-panel').getByRole('button', { name: 'Start New Project' }).click();
  await expect.poll(() => store(host, 'drawing', (d) => d.artists)).toEqual([]);
});

test('End room says it ends for everyone, ends it for artists too, and the art stays open to save', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await typeAt(artist, 6, 3, 'k');
  await expect.poll(() => chars(host, 3, 6, 6)).toBe('k');

  await tab(host, 'SOCIAL').click();
  await shown(host, 'host-room').getByRole('button', { name: 'End room' }).click();
  const asked = host.getByRole('dialog', { name: 'End the room?' });
  await expect(asked.getByText('Everyone leaves, including anyone drawing, and the chat is gone.')).toBeVisible();
  await asked.getByRole('button', { name: 'End room' }).click();

  await expect.poll(() => store(artist, 'room', (r) => r.role)).toBe(null);
  await expect(artist.getByText('The host ended the room')).toBeVisible();   // said where they are: on ANSI
  await selected(artist, 'ANSI');
  expect(await store(artist, 'project', (p) => [!!p.image, p._sharing, p.canUndo])).toEqual([true, null, false]);
  expect(await chars(artist, 3, 6, 6)).toBe('k');
  await expect(artist.locator('.edit-toolbar .desktop-only button.primary').nth(2)).toBeEnabled();   // an ordinary document
  const download = await saveAs(artist, 'Save Project (.phosphor)');
  expect(download.suggestedFilename()).toMatch(/^neon harbor.*\.phosphor$/);
});

test('paused: the layer shows and takes presses, and scrolling and zoom still work', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room, { image: 'images/tall.png' });
  await store(artist, 'workspace', (w) => { w.ansiZoom = 1; });
  await toTopOfArt(artist);
  await typeAt(artist, 2, 2, 'q');
  await expect.poll(() => chars(host, 2, 2, 2)).toBe('q');
  const before = await edits(artist);

  const release = await hostAway(host);
  await expect(pauseLayer(artist)).toContainText(WAITING_WORDS);
  const view = artist.locator('.ansi-editor > article');
  const [box, seen] = await Promise.all([pauseLayer(artist).boundingBox(), view.boundingBox()]);
  expect(box.x).toBe(seen.x);
  expect(box.y).toBe(seen.y);
  expect(Math.abs(box.height - seen.height)).toBeLessThan(20);   // up to the scrollbar

  // A press lands on the layer and draws nothing, with the tool still lit.
  await artist.getByRole('button', { name: 'Pencil' }).click();
  await expect(artist.getByRole('button', { name: 'Pencil' })).toBeEnabled();
  const at = await cellPoint(artist, 10, 10);
  await artist.mouse.move(at.x, at.y);
  expect(await artist.evaluate(({ x, y }) => !!document.elementFromPoint(x, y).closest('.pause-layer'), at)).toBe(true);
  await artist.mouse.down();
  await artist.mouse.move(at.x + 40, at.y, { steps: 3 });
  await artist.mouse.up();
  expect(await edits(artist)).toBe(before);
  expect(await store(artist, 'project', (p) => p.hasPaint)).toBe(false);

  const scroll = () => view.evaluate((el) => el.scrollTop);
  const top = await scroll();
  await artist.mouse.wheel(0, 300);
  await expect.poll(scroll).toBeGreaterThan(top);
  await artist.keyboard.down('Control');
  await artist.mouse.wheel(0, 200);
  await artist.keyboard.up('Control');
  await expect.poll(() => store(artist, 'workspace', (w) => w.ansiZoom)).toBeLessThan(1);

  release();
  await expect(pauseLayer(artist)).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(() => store(artist, 'drawing', (d) => d.artists)).toEqual([ARTIST.id]);
  await expect.poll(() => store(host, 'drawing', (d) => d.artists)).toEqual([ARTIST.id]);

  // Drawing again reaches the host, after its reload.
  await toTopOfArt(artist);
  await typeAt(artist, 8, 8, 'b');
  await tab(host, 'ANSI').click();
  await expect.poll(() => edits(host), { timeout: 10_000 }).toContain('"char":"b"');
  await sameArt(artist, host);
});

test('paused: typing, Delete, paste, undo and redo change nothing', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await typeAt(artist, 2, 2, 'abc');
  await expect.poll(() => chars(host, 2, 2, 4)).toBe('abc');
  await artist.getByRole('button', { name: 'Select', exact: true }).click();
  await artist.keyboard.press('ControlOrMeta+a');
  await artist.keyboard.press('ControlOrMeta+c');
  await store(artist, 'project', (p) => p.commitPending());   // the run that's open would end by itself in the middle
  const state = () => store(artist, 'project', (p) => ({
    cells: JSON.stringify([...p.editCells]), version: p.history.version, waiting: p._sharing.pending.size, paint: p.hasPaint,
  }));
  const before = await state();
  const selection = await store(artist, 'workspace', (w) => w.selection);

  const release = await hostAway(host);
  await expect(pauseLayer(artist)).toBeVisible();

  await artist.keyboard.press('Delete');
  await artist.keyboard.press('ControlOrMeta+x');
  await artist.keyboard.press('ControlOrMeta+v');
  await artist.waitForTimeout(100);   // a paste with no paste event goes after 50 ms
  await artist.keyboard.press('ArrowRight');
  await artist.keyboard.press('s');
  await artist.keyboard.press(undoKey);
  await artist.keyboard.press(redoKey);
  expect(await state()).toEqual(before);
  expect(await store(artist, 'workspace', (w) => w.selection)).toEqual(selection);

  await artist.keyboard.press('Escape');   // letting go of a selection is an undo step of its own
  await artist.getByRole('button', { name: 'Edit Mode' }).click();
  await store(artist, 'workspace', (w) => { w.textCursor = { col: 2, row: 2 }; });
  await artist.waitForFunction(() => document.activeElement?.dataset?.textInput !== undefined);
  const typing = await state();
  await artist.keyboard.type('zz');
  await artist.keyboard.press('Backspace');
  await artist.keyboard.press('Delete');
  await artist.keyboard.press('Enter');
  expect(await state()).toEqual(typing);
  expect(typing.cells).toBe(before.cells);
  await expect(artist.locator('.waiting')).toHaveCount(0);   // nothing's waiting

  release();
  await expect(pauseLayer(artist)).toHaveCount(0, { timeout: 20_000 });
});

test('paused: a stroke held down ends, shows as waiting, and goes out when the host is back', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await typeAt(host, 20, 12, 'u');   // host's own, kept through it
  await expect.poll(() => chars(artist, 12, 20, 20)).toBe('u');

  // The host hears nothing more from them, so what's drawn stays unechoed.
  await store(host, 'room', (r) => { r._host.heardBefore = r._host.heard; r._host.heard = () => {}; });
  await artist.keyboard.press('Escape');
  await artist.getByRole('button', { name: 'Pencil' }).click();
  const a = await cellPoint(artist, 5, 5), b = await cellPoint(artist, 15, 5);
  await artist.mouse.move(a.x, a.y);
  await artist.mouse.down();
  await artist.mouse.move(b.x, b.y, { steps: 6 });
  await expect.poll(() => store(artist, 'project', (p) => p.hasPaint)).toBe(true);
  expect(await store(host, 'project', (p) => p.hasPaint)).toBe(false);

  await hostSaysAway(host);
  await expect(pauseLayer(artist)).toContainText(WAITING_WORDS);
  await expect.poll(() => store(artist, 'workspace', (w) => w.isPainting)).toBe(false);   // the press has ended
  const waiting = artist.locator('.waiting');
  await expect(waiting).toHaveCount(1);
  await expect(waiting).toBeVisible();
  await expect(waiting).toHaveCSS('outline-style', 'dashed');
  const mark = await waiting.boundingBox(), from = await cellPoint(artist, 5, 5), to = await cellPoint(artist, 15, 5);
  expect(mark.width).toBeGreaterThan((to.x - from.x) * 0.8);   // the whole stroke, on the art
  expect(mark.x).toBeLessThanOrEqual(from.x + 1);
  expect(mark.y).toBeLessThanOrEqual(from.y);
  expect(mark.y + mark.height).toBeGreaterThanOrEqual(from.y);
  const c = await cellPoint(artist, 25, 5);
  await artist.mouse.move(c.x, c.y, { steps: 3 });   // moving on draws nothing
  const drawn = await shownCells(artist);
  await artist.mouse.up();
  expect(await shownCells(artist)).toBe(drawn);
  expect(await store(artist, 'project', (p) => p._sharing.pending.size)).toBeGreaterThan(0);

  // Back on a new connection, what never reached the host goes, once.
  await store(host, 'room', (r) => { r._host.heard = r._host.heardBefore; });
  await expect(pauseLayer(artist)).toHaveCount(0, { timeout: 20_000 });
  await expect(artist.locator('.waiting')).toHaveCount(0);
  await expect.poll(() => store(artist, 'project', (p) => p._sharing.pending.size), { timeout: 10_000 }).toBe(0);
  await expect.poll(() => store(host, 'project', (p) => p.hasPaint)).toBe(true);
  await expect.poll(() => shownCells(artist), { timeout: 10_000 }).toBe(await shownCells(host));

  // And drawing goes on, numbered once.
  await artist.getByRole('button', { name: 'Edit Mode' }).click();
  await typeAt(artist, 30, 12, 'n');
  await expect.poll(() => chars(host, 12, 30, 30), { timeout: 10_000 }).toBe('n');
  expect(await store(host, 'project', (p) => p._ledger.sum === p.editLayerSum())).toBe(true);
});

test('back to watching: the art stays open, and drawing on it reaches nobody', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await typeAt(artist, 4, 4, 'a');
  await expect.poll(() => chars(host, 4, 4, 4)).toBe('a');
  await expect(rowOf(host).getByText('artist', { exact: true })).toBeVisible();

  await fromMenu(host, 'Back to watching');
  await mayDraw(artist).toBe(false);
  await expect(rowOf(host).getByText('artist', { exact: true })).toHaveCount(0);
  await expect(chat(artist).getByText('You\'re back to watching.')).toBeVisible();
  expect(await store(artist, 'project', (p) => [!!p.image, p._sharing, p.canUndo])).toEqual([true, null, false]);
  expect(await chars(artist, 4, 4, 4)).toBe('a');
  await expect(artist.locator('aside.control-panel #cols')).toBeEnabled();

  const hostEdits = await edits(host);
  await typeAt(artist, 9, 9, 'n');
  expect(await chars(artist, 9, 9, 9)).toBe('n');
  await artist.waitForTimeout(300);
  expect(await edits(host)).toBe(hostEdits);
  expect(await store(artist, 'room', (r) => r.role)).toBe('watch');
});

test('reload as an artist rejoins, shows everything, and has no undo steps', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await typeAt(artist, 4, 4, 'r');
  await expect.poll(() => chars(host, 4, 4, 4)).toBe('r');
  await artist.waitForTimeout(1200);   // autosave has what's open, under this id
  const id = await store(artist, 'project', (p) => p.documentId);
  await typeAt(host, 6, 6, 'w');
  await expect.poll(() => chars(artist, 6, 6, 6)).toBe('w');

  artist.on('dialog', (dialog) => dialog.accept());
  await artist.reload();
  await mayDraw(artist).toBe(true);
  await settled(artist);
  await typeAt(host, 7, 6, 'x');   // said while it was back, as much as before
  await expect.poll(() => chars(artist, 6, 6, 7), { timeout: 10_000 }).toBe('wx');
  expect(await chars(artist, 4, 4, 4)).toBe('r');
  expect(await store(artist, 'project', (p) => p.canUndo)).toBe(false);
  expect(await store(artist, 'project', (p) => p.documentId)).toBe(id);   // the same in the list: no copy to pile up
  await hash(artist, `/ansi?room=${ROOM_ID}`);
  await expect(invitation(artist)).toHaveCount(0);

  await typeAt(artist, 8, 4, 'y');
  await expect.poll(() => chars(host, 4, 8, 8), { timeout: 10_000 }).toBe('y');
  expect(await store(host, 'drawing', (d) => d.artists)).toEqual([ARTIST.id]);
  await expect.poll(() => store(host, 'room', (r) => r.watchers.filter((w) => w.connected).length)).toBe(1);
});

test('reporting a person and a room still works for an artist', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  const box = chat(host).getByRole('textbox', { name: 'Message' });
  await box.fill('hello from the host');
  await box.press('Enter');
  const message = chat(artist).getByRole('log').locator('.message').filter({ hasText: 'hello from the host' });
  await message.hover();
  await message.getByRole('button', { name: 'Report message from ansi-fan' }).click();
  const asked = artist.getByRole('dialog', { name: 'Report ansi-fan?' });
  await asked.getByRole('radio', { name: 'Spam or flooding' }).check();
  await asked.getByRole('button', { name: 'Report', exact: true }).click();
  await expect.poll(() => room.from('p_1').filter((m) => m.type === 'report').length).toBe(1);

  await expect(asked).toHaveCount(0);
  await chat(artist).getByRole('button', { name: 'Report room' }).click();
  const roomAsked = artist.getByRole('dialog', { name: 'Report this room?' });
  await roomAsked.getByRole('radio', { name: 'Spam or flooding' }).check();
  await roomAsked.getByRole('button', { name: 'Report', exact: true }).click();
  await expect.poll(() => room.from('p_1').filter((m) => m.type === 'report-room').length).toBe(1);
  expect(await store(artist, 'drawing', (d) => d.mayDraw)).toBe(true);
});

test('others\' cursors show with a name, and Show others\' cursors turns them off', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  const toggle = chat(artist).getByRole('checkbox', { name: 'Show others\' cursors' });
  await expect(toggle).toBeChecked();

  const at = await cellPoint(host, 10, 10);
  await host.mouse.move(at.x, at.y);
  await host.mouse.move(at.x + 8, at.y);
  const theirs = artist.locator('.artist-cursor');
  await expect(theirs).toHaveCount(1);
  await expect(theirs).toContainText('ansi-fan');
  await expect(host.locator('.artist-cursor')).toHaveCount(0);   // never your own

  await toggle.uncheck();
  await expect(theirs).toHaveCount(0);
  await toggle.check();
  await expect(theirs).toHaveCount(1);

  const mine = await cellPoint(artist, 20, 12);
  await artist.mouse.move(mine.x, mine.y);
  await artist.mouse.move(mine.x + 8, mine.y);
  await expect(host.locator('.artist-cursor')).toContainText('tin_owl');
});

test('a stranger\'s cursor that isn\'t one is ignored', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await store(host, 'room', (r) => {
    for (const w of r._host.open()) {
      r._host.sendTo(w, { t: 'cursors', x: { at: { col: '10;background:url(//evil)', row: 1 }, view: null, name: 'x' }, y: { at: { col: 1, row: 1 }, view: null, name: 7 }, z: 'no' });
    }
  });
  await artist.waitForTimeout(100);
  expect(await store(artist, 'drawing', (d) => d.cursors)).toEqual({});
  await expect(artist.locator('.artist-cursor')).toHaveCount(0);
});

test('pressing the tag of an artist off screen goes to where they are', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room, { image: 'images/tall.png' });
  await store(host, 'workspace', (w) => { w.ansiZoom = 1; });
  await store(artist, 'workspace', (w) => { w.ansiZoom = 1; });
  const view = (page) => page.locator('.ansi-editor > article');
  await view(artist).evaluate((el) => { el.scrollTop = el.scrollHeight - el.clientHeight; });
  await expect.poll(() => store(artist, 'workspace', (w) => w.ansiViewOrigin.row)).toBeGreaterThan(400);
  await view(host).evaluate((el) => { el.scrollTop = 0; });

  const box = await view(artist).boundingBox();
  await artist.mouse.move(box.x + 200, box.y + 200);
  await artist.mouse.move(box.x + 210, box.y + 200);
  const tag = host.getByRole('button', { name: 'Go to tin_owl' });
  await expect(tag).toBeInViewport();
  const editsBefore = await edits(host);
  await tag.click();
  await expect.poll(() => view(host).evaluate((el) => el.scrollTop)).toBeGreaterThan(1000);
  await expect(host.locator('.artist-cursor').filter({ hasText: 'tin_owl' })).toBeInViewport();
  await expect(tag).toHaveCount(0);
  expect(await edits(host)).toBe(editsBefore);   // the press drew nothing
});

test('a project saved by an artist opens as an ordinary project, with no names in it', async ({ page: host, context, browser }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await typeAt(host, 2, 2, 'h');
  await typeAt(artist, 3, 3, 'a');
  await expect.poll(() => chars(artist, 2, 2, 2)).toBe('h');
  const download = await saveAs(artist, 'Save Project (.phosphor)');
  const file = await readFile(await download.path());
  const text = file.toString('latin1');
  for (const name of ['tin_owl', 'ansi-fan', ARTIST.id, member().id]) expect(text).not.toContain(name);

  const fresh = await (await browser.newContext()).newPage();
  await fresh.goto('/');
  await imageInput(fresh).setInputFiles({ name: 'ours.phosphor', mimeType: 'application/octet-stream', buffer: file });
  await settled(fresh);
  expect(await chars(fresh, 2, 2, 2)).toBe('h');
  expect(await chars(fresh, 3, 3, 3)).toBe('a');
  expect(await store(fresh, 'project', (p) => [p._sharing, p.canUndo])).toEqual([null, false]);
  await fresh.context().close();
});

test('the pause layer follows the view: folding the chat and narrowing the window', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  const release = await hostAway(host);
  await expect(pauseLayer(artist)).toBeVisible();
  const view = artist.locator('.ansi-editor > article');
  const follows = async () => {
    const size = await view.evaluate((el) => ({ width: el.clientWidth, height: el.clientHeight }));
    await expect.poll(async () => (await pauseLayer(artist).boundingBox()).width).toBe(size.width);
    expect((await pauseLayer(artist).boundingBox()).height).toBe(size.height);
    return size.width;
  };
  const opened = await follows();

  await chat(artist).getByRole('button', { name: 'Fold the chat' }).click();
  await expect.poll(() => view.evaluate((el) => el.clientWidth)).toBeGreaterThan(opened);
  const wide = await follows();

  await artist.getByRole('button', { name: /Unfold|Open the chat/ }).click();
  const { height } = artist.viewportSize();
  await artist.setViewportSize({ width: 1000, height });
  await expect.poll(() => view.evaluate((el) => el.clientWidth)).toBeLessThan(wide);
  await follows();

  // Over the chat it isn't: Exit takes a press.
  const exit = chat(artist).getByRole('button', { name: 'Exit', exact: true });
  const at = await exit.boundingBox();
  expect(await artist.evaluate(({ x, y }) => !document.elementFromPoint(x, y).closest('.pause-layer'), { x: at.x + 2, y: at.y + 2 })).toBe(true);
  release();
});

test('a host back from a reload still has both invitations, and either can accept', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const second = member({ id: 'u_3', username: 'grim_reaper', name: 'grim_reaper', email: 'reaper@example.com' });
  const owl = await invitedPage(context, host, room);
  const reaper = await invitedPage(context, host, room, { me: second });

  const release = await hostAway(host);
  release();
  await expect.poll(() => store(host, 'drawing', (d) => [...d.invited].sort()), { timeout: 20_000 }).toEqual([ARTIST.id, second.id].sort());
  await expect(invitation(owl)).toBeVisible({ timeout: 20_000 });
  await expect(invitation(reaper)).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => store(host, 'drawing', (d) => d.connected.length), { timeout: 20_000 }).toBe(2);
  expect((await store(host, 'drawing', (d) => [...d.invited])).length).toBe(2);

  await invitation(reaper).getByRole('button', { name: 'Accept' }).click();
  await mayDraw(reaper).toBe(true);
  await invitation(owl).getByRole('button', { name: 'Accept' }).click();
  await mayDraw(owl).toBe(true);
});

test('someone gone takes their mark off every other artist\'s screen, with no pointer moving', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  const second = await artistPage(context, host, room, { me: member({ id: 'u_3', username: 'grim_reaper', name: 'grim_reaper', email: 'reaper@example.com' }) });
  await tab(second, 'ANSI').click();
  const at = await cellPoint(second, 10, 10);
  await second.mouse.move(at.x, at.y);
  await second.mouse.move(at.x + 20, at.y + 20);
  await tab(artist, 'ANSI').click();
  const mark = artist.locator('.artist-cursor').filter({ hasText: 'grim_reaper' });
  await expect(mark).toBeVisible();
  await second.close();
  await expect(mark).toHaveCount(0, { timeout: 10_000 });
});

