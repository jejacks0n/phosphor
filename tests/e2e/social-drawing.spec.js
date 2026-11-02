// Drawing together: a host and an artist, each a real page in one fake Room, joined by real WebRTC. Art never
// passes through the server, so all of this is between the two pages; the room's socket only carries signals.
import { readFile } from 'node:fs/promises';
import { test, expect, tab, store, chars, editAt, cellPoint, settled, saveAs, openApp, imageInput, otherBrowser } from './support.js';
import { fakeRoom, member, ROOM_ID, goLive, shown, chat, hash, selected, ARTIST, people, rowOf, invitation, mayDraw, fromMenu, invitedPage, artistPage, watcherPage, joinFromCard, followLink } from './social-support.js';

const WAITING_WORDS = 'The host is reconnecting. Drawing is paused.';
const CHANGING_WORDS = 'The host is changing. Drawing is paused.';
const GETTING_WORDS = 'Getting the room\'s art. Drawing is paused.';
const ONLY_HOST = 'Only the host can do this.';
const NOT_WHILE = 'Not while others are drawing.';
const MERGE_WARNING = 'Strokes merged into the image can\'t be undone by anyone.';
const BAKE_WARNING = 'A bake can\'t be undone by anyone.';
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

  // Not now, then Accept, each half the row, and both the height of an ordinary button.
  const notNow = await invitation(person).getByRole('button', { name: 'Not now' }).boundingBox();
  const accept = await invitation(person).getByRole('button', { name: 'Accept' }).boundingBox();
  expect(notNow.x).toBeLessThan(accept.x);
  expect(accept.width).toBeCloseTo(notNow.width, 0);
  expect(accept.height).toBe(notNow.height);
  expect(accept.width + notNow.width).toBeGreaterThan((await invitation(person).boundingBox()).width * 0.8);
  const ordinary = await person.evaluate(() => {
    const button = document.body.appendChild(document.createElement('button'));
    button.textContent = 'Not now';
    const { height } = button.getBoundingClientRect();
    button.remove();
    return height;
  });
  expect(accept.height).toBe(ordinary);

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
  await expect(dialog.getByText(BAKE_WARNING)).toBeVisible();
  await expect(dialog.getByText(MERGE_WARNING)).toHaveCount(0);
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

test('someone whose cell is only partly out of view is marked where they are, and no tag lies over the art', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await settled(artist);
  await artist.locator('.ansi-editor > article').evaluate((el) => { el.scrollTop = 0; });
  const { height } = await artist.locator('.ansi-editor .display').boundingBox();
  const rowHeight = height / (await store(artist, 'project', (p) => Math.ceil(p.rows / 2)));
  await artist.locator('.ansi-editor > article').evaluate((el, by) => { el.scrollTop = by; }, rowHeight * 1.5);   // half of the second row is out of view
  expect(await artist.locator('.ansi-editor > article').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const at = await cellPoint(host, 1, 1);
  await host.mouse.move(at.x, at.y);
  await host.mouse.move(at.x + 1, at.y);
  await expect(artist.locator('.artist-cursor').or(artist.getByRole('button', { name: /^Go to / }))).toHaveCount(1);
  await expect(artist.getByRole('button', { name: /^Go to / })).toHaveCount(0);
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

  const fresh = await (await otherBrowser(browser)).newPage();
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

test('back from a reload with the room\'s art still on its way, the pause says that, not that the host is away', async ({ page: host, context }) => {
  const { artist } = await together(host, context, fakeRoom());
  await artist.waitForTimeout(1200);   // autosave has what's open, under this id
  await store(host, 'room', (r) => { r._host.sendProject = async () => {}; });   // it never comes
  artist.on('dialog', (dialog) => dialog.accept());
  await artist.reload();
  await expect(pauseLayer(artist)).toContainText(GETTING_WORDS, { timeout: 15_000 });
  await expect(pauseLayer(artist)).not.toContainText('reconnecting');
  expect(await store(artist, 'project', (p) => p._paused)).toBe(true);   // and nothing they'd draw is silently replaced
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


test('a watcher follows an artist from the people list, sees everyone only by asking, and goes back to the host when they are put back to watching', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  const watcher = await watcherPage(context, room);
  await watcher.goto('/');
  await joinFromCard(watcher);
  const art = shown(watcher, 'watch-room');
  const list = watcher.getByRole('list', { name: 'Who to follow' });
  const choice = (name) => list.getByRole('button', { name: `Follow ${name}` });
  await expect(choice('tin_owl')).toHaveAttribute('aria-pressed', 'false');
  await expect(choice('ansi-fan')).toHaveAttribute('aria-pressed', 'true');   // it starts on the host
  await expect(art.locator('.host-view')).toHaveCount(1);
  await expect(art.getByRole('button', { name: 'Track ansi-fan' })).toBeVisible();
  await expect(art.locator('.other-view')).toHaveCount(0);

  const box = await artist.locator('.ansi-editor > article').boundingBox();
  await artist.mouse.move(box.x + 100, box.y + 100);
  await artist.mouse.move(box.x + 110, box.y + 100);
  await choice('tin_owl').click();
  await expect(choice('tin_owl')).toHaveAttribute('aria-pressed', 'true');
  await expect(choice('ansi-fan')).toHaveAttribute('aria-pressed', 'false');
  await expect(art.getByRole('button', { name: 'Track tin_owl' })).toBeVisible();
  const theirs = async () => { const { col, row, cols, rows } = await store(artist, 'workspace', (w) => w.sharedView); return { col, row, cols, rows }; };
  await expect.poll(async () => { const { col, row, cols, rows } = (await store(watcher, 'room', (r) => r.followedView)) ?? {}; return { col, row, cols, rows }; }, { timeout: 10_000 }).toEqual(await theirs());
  await expect(art.locator('.host-view')).toHaveCount(1);
  await expect(art.locator('.other-view')).toHaveCount(0);   // only the followed one

  const everyone = list.locator('xpath=..').getByRole('checkbox', { name: 'Show everyone' });
  await everyone.check();
  await expect(art.locator('.other-view')).toHaveCount(1);
  await expect(art.locator('.other-view')).toContainText('ansi-fan');
  await everyone.uncheck();
  await expect(art.locator('.other-view')).toHaveCount(0);

  const showBox = list.locator('xpath=..').getByRole('checkbox', { name: 'Show box' });
  await showBox.uncheck();
  await expect(art.locator('.host-view')).toHaveCount(0);
  expect(await store(watcher, 'room', (r) => r.following)).toBe(ARTIST.id);   // still following
  await showBox.check();
  await expect(art.locator('.host-view')).toHaveCount(1);

  await fromMenu(host, 'Back to watching');
  await expect(list).toHaveCount(0);   // no one to choose between: the screen is quiet again
  await expect(art.getByRole('button', { name: 'Track ansi-fan' })).toBeVisible();
  expect(await store(watcher, 'room', (r) => r.following === r.room.hostSub)).toBe(true);
});

// A watcher following tin_owl on tall art, and tin_owl's view as the watcher has it.
async function followingOwl(host, context, room) {
  const { artist } = await together(host, context, room, { image: 'images/tall.png' });
  await store(artist, 'workspace', (w) => { w.ansiZoom = 1; });
  const watcher = await watcherPage(context, room);
  await watcher.goto('/');
  await joinFromCard(watcher);
  const view = artist.locator('.ansi-editor > article');
  const box = await view.boundingBox();
  await artist.mouse.move(box.x + 100, box.y + 100);
  await artist.mouse.move(box.x + 110, box.y + 100);
  await watcher.getByRole('list', { name: 'Who to follow' }).getByRole('button', { name: 'Follow tin_owl' }).click();
  const seen = () => store(watcher, 'room', (r) => r.followedView?.row ?? null);
  await expect.poll(seen, { timeout: 10_000 }).not.toBe(null);
  return { artist, watcher, view, box, seen };
}

test('a followed artist who scrolls with the pointer still is followed there', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist, view, seen } = await followingOwl(host, context, room);
  const before = await seen();
  await artist.mouse.wheel(0, 900);   // the pointer doesn't move
  await expect.poll(() => view.evaluate((el) => el.scrollTop)).toBeGreaterThan(400);
  const row = await store(artist, 'workspace', (w) => w.sharedView.row);
  expect(row).toBeGreaterThan(before);
  await expect.poll(seen, { timeout: 10_000 }).toBe(row);
});

test('a followed artist who was away is followed again once drawing resumes, without moving the pointer', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await followingOwl(host, context, room);
  await expect.poll(() => store(host, 'drawing', `(d) => d.cursors['${ARTIST.id}']?.view ?? null`), { timeout: 10_000 }).not.toBe(null);
  await hostSaysAway(host);
  await expect.poll(() => store(host, 'drawing', `(d) => d.cursors['${ARTIST.id}']?.view ?? null`), { timeout: 20_000 }).toBe(null);   // the host forgot where they were
  await expect.poll(() => store(artist, 'drawing', (d) => d.paused), { timeout: 20_000 }).toBe(false);
  await expect.poll(() => store(host, 'drawing', `(d) => d.cursors['${ARTIST.id}']?.view ?? null`), { timeout: 20_000 }).not.toBe(null);
});

// Handing over.
const REAPER = member({ id: 'u_3', username: 'grim_reaper', name: 'grim_reaper', email: 'reaper@example.com' });
const UNDO_RESET = 'The host changed, so undo starts over. All the drawing is still here.';
const agreed = (a, b) => expect.poll(async () => (await edits(a)) === (await edits(b)), { timeout: 15_000, intervals: [100] }).toBe(true);
const roleOf = (page) => store(page, 'room', (r) => r.role);
const isHost = (page) => expect.poll(() => roleOf(page), { timeout: 20_000, intervals: [100] });
const notDrawing = (page) => expect.poll(() => store(page, 'drawing', (d) => d.paused), { timeout: 20_000, intervals: [100] }).toBe(false);
const hereOn = (host, count) => expect.poll(() => store(host, 'drawing', (d) => d.connected.length), { timeout: 20_000, intervals: [100] }).toBe(count);
const makeHost = async (host, name = ARTIST.name) => {
  await fromMenu(host, 'Make host', name);
  const dialog = host.getByRole('dialog', { name: `Make ${name} the host?` });
  await expect(dialog).toContainText('You\'ll stay in the room as an artist.');
  await dialog.getByRole('button', { name: 'Make host' }).click();
};

test('Make host asks, the host stays an artist, and the new host can invite', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  const person = await watcherPage(context, room, { me: REAPER });
  await person.goto('/');
  await joinFromCard(person);
  await typeAt(host, 1, 1, 'h');
  await typeAt(artist, 2, 2, 'a');
  await agreed(host, artist);

  await fromMenu(host, 'Make host');
  await host.getByRole('dialog', { name: 'Make tin_owl the host?' }).getByRole('button', { name: 'Cancel' }).click();
  expect(await roleOf(host)).toBe('host');
  await host.keyboard.press('Escape');

  await makeHost(host);
  await isHost(artist).toBe('host');
  await isHost(host).toBe('watch');
  await mayDraw(host).toBe(true);
  await notDrawing(host);
  await notDrawing(artist);
  await expect(chat(person).getByRole('status').filter({ hasText: 'ansi-fan made tin_owl the host.' })).toBeVisible();
  await expect(chat(person).getByText('hosted by')).toContainText('tin_owl');
  await hash(host, `/ansi?room=${ROOM_ID}`);
  expect(await store(host, 'project', (p) => p.canUndo)).toBe(true);

  // Everyone draws on, and undo goes by who drew it.
  await typeAt(host, 3, 3, 'o');
  await typeAt(artist, 4, 4, 'n');
  await agreed(host, artist);
  await host.keyboard.press(undoKey);
  await expect.poll(() => chars(artist, 3, 3, 3)).not.toBe('o');
  await agreed(host, artist);

  // The new host hosts: the old one is listed as an artist, and someone else can be asked.
  await chat(artist).getByRole('button', { name: /^\d+ here$/ }).click();
  await expect(rowOf(artist, 'ansi-fan').getByText('artist', { exact: true })).toBeVisible({ timeout: 10_000 });
  await fromMenu(artist, 'Make artist', REAPER.name);
  await expect(invitation(person)).toBeVisible({ timeout: 10_000 });
  await invitation(person).getByRole('button', { name: 'Accept' }).click();
  await mayDraw(person).toBe(true);
  await settled(person);
  await agreed(person, artist);
});

test('a host\'s Make host the server never answers leaves it hosting', async ({ page: host, context }) => {
  const room = fakeRoom();
  room.ignoringHandOvers = true;
  const { artist } = await together(host, context, room);
  await makeHost(host);
  await expect(pauseLayer(host)).toContainText(CHANGING_WORDS);   // it's what's happening, to the host as to anyone
  await expect.poll(() => room.from('host').some((m) => m.type === 'hand-over'), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => store(host, 'drawing', (d) => d.paused), { timeout: 10_000 }).toBe(false);
  expect(await roleOf(host)).toBe('host');
  await typeAt(host, 1, 1, 'h');
  await expect.poll(() => chars(artist, 1, 1, 1), { timeout: 10_000 }).toBe('h');
});

test('the host going past the wait: "X left the room. Y is now the host." and drawing resumes', async ({ page: host, context }) => {
  const room = fakeRoom({ hostWaitMs: 500 });
  const { artist } = await together(host, context, room);
  const second = await artistPage(context, host, room, { me: REAPER });
  await typeAt(artist, 20, 12, 'a');
  await typeAt(second, 30, 12, 'b');
  await agreed(artist, second);
  host.on('dialog', (dialog) => dialog.accept());

  await host.close({ runBeforeUnload: false });
  await expect.poll(() => [...room.received.filter((r) => r.msg.type === 'last-change').map((r) => r.msg.n)].length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await roleOf(artist)) === 'host' || (await roleOf(second)) === 'host', { timeout: 20_000 }).toBe(true);
  const [next, other, nextName] = await roleOf(artist) === 'host' ? [artist, second, ARTIST.name] : [second, artist, REAPER.name];
  await expect(chat(other).getByRole('status').filter({ hasText: `ansi-fan left the room. ${nextName} is now the host.` })).toBeVisible({ timeout: 10_000 });
  await expect(chat(other).getByRole('status').filter({ hasText: UNDO_RESET })).toBeVisible();
  await expect(chat(next).getByRole('status').filter({ hasText: UNDO_RESET })).toBeVisible();
  await notDrawing(other);
  await expect(pauseLayer(other)).toHaveCount(0);
  expect(await store(other, 'project', (p) => p.canUndo)).toBe(false);
  expect(await chars(other, 12, 20, 20)).toBe('a');
  expect(await chars(next, 12, 30, 30)).toBe('b');

  await typeAt(other, 5, 5, 'x');
  await typeAt(next, 6, 6, 'y');
  await agreed(next, other);
  await other.keyboard.press(undoKey);
  await expect.poll(() => chars(next, 5, 5, 5), { timeout: 10_000 }).not.toBe('x');
  await agreed(next, other);
});

test('no artists left: the room ends as today', async ({ page: host, context }) => {
  const room = fakeRoom({ hostWaitMs: 200 });
  await goLive(host, room);
  const person = await watcherPage(context, room);
  await person.goto('/');
  await joinFromCard(person);
  host.on('dialog', (dialog) => dialog.accept());
  await host.close({ runBeforeUnload: false });
  await expect.poll(() => roleOf(person), { timeout: 10_000 }).toBe(null);
  expect(room.received.some((r) => r.msg.type === 'last-change')).toBe(false);
});

test('an artist reloading before autosave has their document comes back on the tab they were on when the art arrives', async ({ page: host, context }) => {
  const { artist } = await together(host, context, fakeRoom());
  await selected(artist, 'ANSI');
  await artist.evaluate(() => sessionStorage.setItem('phosphor-autosave-document', crypto.randomUUID()));   // what a slow first write leaves
  artist.on('dialog', (dialog) => dialog.accept());
  await artist.reload();
  await mayDraw(artist).toBe(true);
  await settled(artist);
  await selected(artist, 'ANSI');
  await hash(artist, `/ansi?room=${ROOM_ID}`);
  await typeAt(artist, 2, 2, 'b');
  await expect.poll(() => chars(host, 2, 2, 2), { timeout: 10_000 }).toBe('b');
});

test('someone who chose another tab while the art was coming stays there', async ({ page: host, context }) => {
  const { artist } = await together(host, context, fakeRoom());
  await artist.evaluate(() => sessionStorage.setItem('phosphor-autosave-document', crypto.randomUUID()));
  artist.on('dialog', (dialog) => dialog.accept());
  await artist.reload();
  await tab(artist, 'SOCIAL').click();
  await mayDraw(artist).toBe(true);
  await settled(artist);
  await selected(artist, 'SOCIAL');
});

test('an artist dropping out and returning stays an artist with no invitation', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await typeAt(artist, 1, 1, 'a');
  await agreed(host, artist);
  artist.on('dialog', (dialog) => dialog.accept());
  await artist.reload();
  await mayDraw(artist).toBe(true);
  await settled(artist);
  await expect(invitation(artist)).toHaveCount(0);
  expect(await store(host, 'drawing', (d) => d.artists)).toEqual([ARTIST.id]);
  await typeAt(artist, 2, 2, 'b');
  await agreed(host, artist);
});

test('a watcher never becomes host, and keeps watching through a handover', async ({ page: host, context }) => {
  const room = fakeRoom({ hostWaitMs: 200 });
  const { artist } = await together(host, context, room);
  const person = await watcherPage(context, room, { me: REAPER });
  await person.goto('/');
  await joinFromCard(person);
  await expect.poll(() => store(person, 'room', (r) => r.following)).toBe('u_1');   // the old host, until the role moves
  await typeAt(host, 1, 1, 'h');
  await agreed(host, artist);
  host.on('dialog', (dialog) => dialog.accept());

  await host.close({ runBeforeUnload: false });
  await isHost(artist).toBe('host');
  expect(await roleOf(person)).toBe('watch');
  await expect.poll(() => store(person, 'room', (r) => r.following)).toBe(ARTIST.id);
  await expect.poll(() => store(person, 'room', (r) => r.status), { timeout: 20_000 }).toBe('live');
  await expect.poll(() => store(person, 'room', (r) => r.room.hostSub)).toBe(ARTIST.id);
  await typeAt(artist, 3, 3, 'z');
  await expect.poll(() => store(person, 'room', (r) => r.art?.cells.some((c) => c.char === 'z')), { timeout: 10_000 }).toBe(true);
  await expect(person.getByLabel('The room\'s art')).toBeVisible();
});

// A room that names someone with no art: the host says they're on the list, and hands it to them.
const namedWithoutArt = async (host, room, subs, to) => {
  await store(host, 'room', `(r) => { r._connection.send({ type: 'artists', subs: ${JSON.stringify(subs)} }); r._connection.send({ type: 'hand-over', to: ${JSON.stringify(to)} }); }`);
};
const handedOverTo = (room, sub) => room.received.some((r) => r.msg.type === 'hand-over' && r.msg.to === sub);

test('someone named with no art passes the role to an artist who\'s here, and the room goes on', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  const person = await watcherPage(context, room, { me: REAPER });
  const errors = [];
  person.on('pageerror', (error) => errors.push(error.message));
  await person.goto('/');
  await joinFromCard(person);
  await expect.poll(() => store(person, 'room', (r) => r.status), { timeout: 20_000 }).toBe('live');
  await typeAt(host, 1, 1, 'h');
  await agreed(host, artist);

  await namedWithoutArt(host, room, [ARTIST.id, REAPER.id], REAPER.id);
  await isHost(artist).toBe('host');
  expect(handedOverTo(room, ARTIST.id)).toBe(true);
  await expect.poll(() => store(person, 'room', (r) => r.room?.hostSub), { timeout: 20_000 }).toBe(ARTIST.id);   // none between sockets
  expect(await roleOf(person)).toBe('watch');
  expect(room.received.some((r) => r.msg.type === 'end')).toBe(false);
  await expect.poll(() => store(person, 'room', (r) => r.status), { timeout: 20_000 }).toBe('live');
  await typeAt(artist, 20, 12, 'z');
  await expect.poll(() => chars(host, 12, 20, 20), { timeout: 20_000 }).toBe('z');
  expect(errors).toEqual([]);
});

test('someone named before their document is back waits for it, and with no art and no artist here the room ends', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const person = await watcherPage(context, room, { me: REAPER });
  await person.goto('/');
  await joinFromCard(person);
  await expect.poll(() => store(person, 'room', (r) => r.status), { timeout: 20_000 }).toBe('live');
  await store(person, 'workspace', '(w) => { w.documentAnswered = false; }');
  room.refusing = 'full';   // the old host isn't getting back in to be handed it

  await namedWithoutArt(host, room, [REAPER.id], REAPER.id);
  await expect.poll(() => room.received.some((r) => r.msg.type === 'hand-over' && r.msg.to === REAPER.id)).toBe(true);
  await person.waitForTimeout(300);
  expect(room.received.some((r) => r.msg.type === 'end')).toBe(false);
  await store(person, 'workspace', '(w) => { w.documentAnswered = true; }');
  await expect.poll(() => room.received.some((r) => r.msg.type === 'end'), { timeout: 10_000 }).toBe(true);
});

test('a host back too late without reloading keeps what it had as its own document, and joins with the room\'s', async ({ page: host, context }) => {
  const room = fakeRoom({ hostWaitMs: 100 });
  const { artist } = await together(host, context, room);
  await typeAt(host, 20, 12, 'm');
  await typeAt(artist, 30, 12, 'a');
  await agreed(host, artist);
  const before = await store(host, 'project', (p) => p.documentId);
  room.dropHost();
  await isHost(artist).toBe('host');
  await isHost(host).toBe('watch');
  await mayDraw(host).toBe(true);
  await expect.poll(() => store(host, 'project', (p) => p.documentId), { timeout: 20_000 }).not.toBe(before);
  const kept = await host.evaluate((id) => new Promise((resolve, reject) => {
    const open = indexedDB.open('phosphor-autosave', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const get = open.result.transaction('documents').objectStore('documents').get(id);
      get.onsuccess = () => { open.result.close(); resolve(!!get.result); };
    };
  }), before);
  expect(kept).toBe(true);
  await agreed(host, artist);
});

test('a host cut off who comes back as an artist is told who hosts now, with the chat folded, and finds what they drew in a new tab', async ({ page: host, context }) => {
  const room = fakeRoom({ hostWaitMs: 100 });
  const { artist } = await together(host, context, room);
  await typeAt(artist, 30, 12, 'a');
  await agreed(host, artist);
  await chat(host).getByRole('button', { name: 'Fold the chat' }).click();
  const before = await store(host, 'project', (p) => p.documentId);
  room.dropHost();
  await store(host, 'project', (p) => { p.typeAt(25, 12, 'o', { fg: '#ffffff', bg: '#000000' }); p.commitEdit(); });   // the page lives, and goes on drawing
  await isHost(artist).toBe('host');
  await mayDraw(host).toBe(true);
  const toast = host.locator('.app-toast');
  await expect(toast).toContainText('tin_owl is now the host.', { timeout: 20_000 });
  await expect(toast).toContainText('Continue where you left off');
  expect(await store(host, 'project', (p) => p.documentId)).not.toBe(before);

  const other = await context.newPage();
  await other.goto('/');
  const row = other.getByRole('list', { name: 'Continue where you left off' }).getByRole('listitem').filter({ hasText: 'gradient' });
  await row.getByRole('button', { name: /^Open/ }).click();
  await settled(other);
  await expect.poll(() => chars(other, 12, 25, 25)).toBe('o');
  await other.close();
});

test('signing out as host passes the role, and End room doesn\'t', async ({ page: host, context }) => {
  const room = fakeRoom({ hostWaitMs: 200 });
  const { artist } = await together(host, context, room);
  await store(host, 'social', '(s) => { s.signOut(); }');
  await isHost(artist).toBe('host');
  expect(room.from('host').some((m) => m.type === 'end')).toBe(false);
  await expect(chat(artist).getByRole('status').filter({ hasText: UNDO_RESET })).toBeVisible();

  // The new host's End room is what ends it.
  await store(artist, 'room', '(r) => { r.endRoom(); }');
  await expect.poll(() => room.from('host').some((m) => m.type === 'end')).toBe(true);
  await expect.poll(() => roleOf(artist)).toBe(null);
});

test('new host: chat continues, mutes are fresh, name and welcome carry over', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room, { welcome: 'hello all' });
  const artist = await artistPage(context, host, room);
  const person = await watcherPage(context, room, { me: REAPER });
  await person.goto('/');
  await joinFromCard(person);
  const say = async (page, text) => {
    const box = chat(page).getByRole('textbox', { name: 'Message' });
    await box.fill(text);
    await box.press('Enter');
  };
  await say(host, 'before the change');
  await expect(chat(artist).getByRole('log')).toContainText('before the change');
  await store(host, 'room', `(r) => r.mute('${REAPER.id}', true)`);

  await makeHost(host);
  await isHost(artist).toBe('host');
  await hereOn(artist, 2);
  expect(await store(artist, 'room', (r) => r.muted)).toEqual([]);
  expect(await store(artist, 'room', (r) => r.room.name)).toBe('neon harbor');
  expect(await store(artist, 'room', (r) => r.room.welcome)).toBe('hello all');
  await expect(chat(artist).getByRole('log')).toContainText('before the change');
  await expect(chat(person).getByRole('log')).toContainText('before the change');
  await expect(chat(person).getByRole('log').locator('.presence').filter({ hasText: 'tin_owl' }).filter({ hasText: 'joined' })).toHaveCount(1);   // only when they came

  await expect.poll(() => store(person, 'room', (r) => r.status), { timeout: 20_000 }).toBe('live');
  await say(person, 'said to the new host');
  await expect(chat(artist).getByRole('log')).toContainText('said to the new host');
  await expect(chat(host).getByRole('log')).toContainText('said to the new host', { timeout: 15_000 });
  expect((await store(artist, 'room', (r) => r.session.messages))).toBe(1);
});

test('artists-now without someone puts them back to watching, and no Make host for them', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  room.unqualified.push(ARTIST.id);
  room.relist();
  await mayDraw(artist).toBe(false);
  await expect.poll(() => store(host, 'drawing', (d) => d.artists)).toEqual([]);
  await rowOf(host).getByRole('button', { name: 'More for tin_owl' }).click();
  await expect(rowOf(host).getByRole('button', { name: 'Make host' })).toHaveCount(0);
});

test('a chosen artist whose socket drops comes back to the room as its host', async ({ page: host, context }) => {
  const room = fakeRoom({ hostWaitMs: 200 });
  const { artist } = await together(host, context, room);
  await typeAt(artist, 1, 1, 'a');
  await agreed(host, artist);
  await store(artist, 'room', (r) => { r._connection.socket.onmessage = null; });   // it hears nothing more on this one
  host.on('dialog', (dialog) => dialog.accept());
  await host.close({ runBeforeUnload: false });
  await expect.poll(() => room.info().hostSub, { timeout: 20_000 }).toBe(ARTIST.id);
  room.hostWaitMs = 60_000;
  await store(artist, 'room', (r) => r._connection.socket.close());
  await isHost(artist).toBe('host');
  await expect.poll(() => room.from('host').filter((m) => m.type === 'host').length, { timeout: 20_000 }).toBe(2);
  await expect.poll(() => store(artist, 'room', (r) => r.status), { timeout: 20_000 }).toBe('live');
  expect(await chars(artist, 1, 1, 1)).toBe('a');
});

test('an artist who reloads and is named through joined gathers first: it takes the room\'s numbers from whoever has them', async ({ page: host, context }) => {
  const room = fakeRoom({ hostWaitMs: 200 });
  const { artist } = await together(host, context, room);
  const second = await artistPage(context, host, room, { me: REAPER });
  await typeAt(second, 20, 12, 'b');
  await agreed(artist, second);
  const n = await store(artist, 'project', (p) => { p.flushHeard(); return p._sharing.pending.n; });
  await expect.poll(() => store(second, 'project', (p) => p._sharing.pending.n)).toBe(n);   // its own stroke's echo
  room.picking = ARTIST.id;
  await store(artist, 'room', (r) => { r._connection.socket.onmessage = null; });   // it hears nothing more on this one
  host.on('dialog', (dialog) => dialog.accept());
  await host.close({ runBeforeUnload: false });
  await expect.poll(() => room.info().hostSub, { timeout: 20_000 }).toBe(ARTIST.id);
  room.hostWaitMs = 60_000;

  artist.on('dialog', (dialog) => dialog.accept());
  await artist.reload();
  await isHost(artist).toBe('host');
  await expect.poll(() => store(artist, 'project', (p) => p._ledger.n), { timeout: 20_000 }).toBe(n);
  await expect.poll(() => store(artist, 'drawing', (d) => d.paused), { timeout: 20_000 }).toBe(false);
  await agreed(artist, second);
  expect(await chars(artist, 12, 20, 20)).toBe('b');
  await expect(chat(artist).getByRole('status').filter({ hasText: UNDO_RESET })).toBeVisible();
});

test('Make host is off while drawing is paused', async ({ page: host, context }) => {
  const room = fakeRoom();
  await together(host, context, room);
  await store(host, 'drawing', '(d) => { d.paused = true; }');
  if (!await people(host).isVisible()) await chat(host).getByRole('button', { name: /^\d+ here$/ }).click();
  await rowOf(host).getByRole('button', { name: 'More for tin_owl' }).click();
  const button = rowOf(host).getByRole('button', { name: 'Make host' });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('title', 'Not while drawing is paused.');
});

// What the SOCIAL tab shows of the room, as text, for a row of cells.
const artRow = (page, row, length = 8) => store(page, 'room', `(r) => r.art?.cells.slice(${row} * r.art.cols, ${row} * r.art.cols + ${length}).map((c) => c.char).join('') ?? null`);

test('an artist\'s SOCIAL tab shows their own document as it changes, and put back to watching they get the host\'s', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await typeAt(host, 1, 1, 'h');
  await typeAt(artist, 2, 2, 'a');
  await agreed(host, artist);
  await tab(artist, 'SOCIAL').click();
  await expect(artist.getByLabel('The room\'s art')).toBeVisible();
  await expect.poll(() => artRow(artist, 2)).toContain('a');
  await expect.poll(() => artRow(artist, 1)).toContain('h');

  await typeAt(host, 3, 3, 'n');   // what they hear
  await expect.poll(() => artRow(artist, 3)).toContain('n');
  const own = await store(artist, 'project', (p) => p.cells);
  expect(await store(artist, 'room', (r) => r.art.cells.length)).toBe(own.length);

  await fromMenu(host, 'Back to watching');
  await mayDraw(artist).toBe(false);
  await typeAt(host, 4, 4, 'w');   // only the host's art could say this now
  await expect.poll(() => artRow(artist, 4)).toContain('w');
});

test('a former host\'s SOCIAL tab shows the document it carries on with, and the new host has no art left over', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await typeAt(artist, 2, 2, 'a');
  await agreed(host, artist);
  await tab(artist, 'SOCIAL').click();
  await expect.poll(() => artRow(artist, 2)).toContain('a');

  await makeHost(host);
  await isHost(artist).toBe('host');
  await isHost(host).toBe('watch');
  await mayDraw(host).toBe(true);
  await notDrawing(host);
  expect(await store(artist, 'room', (r) => r.art)).toBe(null);
  await tab(host, 'SOCIAL').click();
  await expect.poll(() => artRow(host, 2)).toContain('a');
  await tab(artist, 'ANSI').click();
  await typeAt(artist, 3, 3, 'z');   // the new host's stroke, on the old host's own document
  await expect.poll(() => artRow(host, 3)).toContain('z');
});

test('an artist back from a reload in a password room is still an artist, with no new invitation', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room, { password: 'hunter22' });
  const person = await watcherPage(context, room, { me: ARTIST });
  await followLink(person);
  const enter = async () => {
    await person.getByLabel('Password').fill('hunter22');
    await person.getByRole('button', { name: 'Join', exact: true }).click();
  };
  await enter();
  await fromMenu(host, 'Make artist');
  await invitation(person).getByRole('button', { name: 'Accept' }).click();
  await mayDraw(person).toBe(true);

  person.on('dialog', (dialog) => dialog.accept());
  await person.reload();
  await enter();
  await mayDraw(person).toBe(true);
  await expect(invitation(person)).toHaveCount(0);
});

test('SAUCE fields are off for an artist, and say why; the host\'s still work', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await tab(artist, 'SAUCE').click();
  const title = artist.getByLabel('Title');
  await expect(title).toBeDisabled();
  await expect(artist.locator('.sauce-editor fieldset[title="Only the host can do this."]')).toContainText('Custom Comments');
  await tab(host, 'SAUCE').click();
  await host.getByLabel('Title').fill('Harbor');
  await expect.poll(() => store(artist, 'project', (p) => p.sauceTitle)).toBe('Harbor');
  await expect(title).toHaveValue('Harbor');
});

test('an artist going to the SOCIAL tab takes their cursor off the others\' screens', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  const at = await cellPoint(artist, 4, 4);
  await artist.mouse.move(at.x, at.y);
  await artist.mouse.move(at.x + 1, at.y);
  await expect(host.locator('.artist-cursor').filter({ hasText: ARTIST.name })).toHaveCount(1);
  await tab(artist, 'SOCIAL').focus();
  await artist.keyboard.press('Enter');   // the pointer stays where it was, so it never moves off the art
  await expect.poll(() => store(artist, 'workspace', (w) => w.editorTab)).toBe('social');
  await expect(host.locator('.artist-cursor').filter({ hasText: ARTIST.name })).toHaveCount(0);
});

test('Reset all is off for an artist, and says why', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  const reset = artist.getByRole('button', { name: 'RESET ALL' });
  await expect(reset).toBeDisabled();
  await expect(reset).toHaveAttribute('title', ONLY_HOST);
  await expect(host.getByRole('button', { name: 'RESET ALL' })).toBeEnabled();
});

test('asked again and accepting, "You\'re back to watching." goes', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await fromMenu(host, 'Back to watching');
  await expect(chat(artist).getByText('You\'re back to watching.')).toBeVisible();
  await fromMenu(host, 'Make artist');
  await invitation(artist).getByRole('button', { name: 'Accept' }).click();
  await mayDraw(artist).toBe(true);
  await expect(chat(artist).getByText('You\'re back to watching.')).toHaveCount(0);
});

test('Merge\'s warning doesn\'t come after the question it asks', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await typeAt(artist, 1, 1, 'a');
  await sameArt(host, artist);
  await host.getByRole('button', { name: 'Merge down', exact: false }).first().click();
  const sub = await host.getByRole('dialog', { name: 'Merge down' }).locator('p').first().innerText();
  expect(sub.startsWith(MERGE_WARNING)).toBe(true);
  expect(sub.endsWith(':')).toBe(true);
});

test('with the chat folded, what the chat panel would have said shows as a toast', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await chat(artist).getByRole('button', { name: 'Fold the chat' }).click();
  await fromMenu(host, 'Back to watching');
  await mayDraw(artist).toBe(false);
  await expect(artist.locator('.app-toast')).toHaveText('You\'re back to watching.');
});

test('with the chat open, what it says isn\'t said twice', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await fromMenu(host, 'Back to watching');
  await mayDraw(artist).toBe(false);
  await expect(chat(artist).getByRole('status').filter({ hasText: 'You\'re back to watching.' })).toBeVisible();
  await expect(artist.locator('.app-toast')).toHaveCount(0);
});

test('an artist\'s row in the people list says artist, and not that they\'re tracking the host', async ({ page: host, context }) => {
  const room = fakeRoom();
  await together(host, context, room);
  await expect(rowOf(host).getByText('artist', { exact: true })).toBeVisible();
  await expect(rowOf(host).getByText('tracking', { exact: true })).toHaveCount(0);
});

test('someone asked back after leaving isn\'t offered themselves to follow', async ({ page: host, context }) => {
  const room = fakeRoom();
  const { artist } = await together(host, context, room);
  await artist.close({ runBeforeUnload: false });
  const person = await watcherPage(context, room, { me: ARTIST });
  await person.goto('/');
  await joinFromCard(person);
  await expect(invitation(person)).toBeVisible();
  const list = chat(person).getByRole('list', { name: 'Who to follow' });
  await expect(person.getByRole('button', { name: `Follow ${ARTIST.name}` })).toHaveCount(0);
  await expect(list).toHaveCount(0);   // only the host left to follow
});
