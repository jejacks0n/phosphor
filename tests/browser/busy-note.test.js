// Opening and saving put a note at the bottom of the screen (BusyNote) as they start, which fades in only past half a
// second, by CSS, so it shows on time while the page is too busy to run a timer. The work waits for a frame first, so
// the note is drawn before anything heavy starts.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, nextTick, watch } from 'vue';
import { createTestApp } from '../support/app.js';
import BusyNote from '@/components/BusyNote.vue';
import { busyMessage, busyWhile } from '@/composables/useBusy';
import { toast, closeToast } from '@/composables/useToast';

let mounted = null, host = null;
afterEach(() => {
  mounted?.unmount();
  host?.remove();
  mounted = host = null;
  closeToast();
  vi.restoreAllMocks();
});

// Every note shown while `run` runs.
async function notesWhile(run) {
  const seen = [];
  const stop = watch(busyMessage, (now) => { if (now) seen.push(now); }, { flush: 'sync' });
  try {
    await run();
  } finally {
    stop();
  }
  return seen;
}

test('the note is up from the start of the work, drawn before it, and gone after; work inside work keeps the first', async () => {
  let framesBefore = null;
  const frames = { n: 0 };
  const count = () => { frames.n++; requestAnimationFrame(count); };
  requestAnimationFrame(count);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const start = frames.n;
  const result = await busyWhile('Opening a.ans…', async () => {
    framesBefore = frames.n - start;
    expect(busyMessage.value).toBe('Opening a.ans…');
    await busyWhile('Opening b.ans…', async () => expect(busyMessage.value).toBe('Opening a.ans…'));
    return 7;
  });
  expect(result).toBe(7);
  expect(framesBefore).toBeGreaterThan(0);
  expect(busyMessage.value).toBe(null);

  await expect(busyWhile('Saving c.phosphor…', async () => { throw new Error('no'); })).rejects.toThrow('no');
  expect(busyMessage.value).toBe(null);
});

test('the note fades in after half a second, over a modal dialog, and gives way to a toast', async () => {
  host = document.body.appendChild(document.createElement('div'));
  const dialog = document.body.appendChild(document.createElement('dialog'));
  dialog.showModal();
  mounted = createApp(BusyNote);
  mounted.mount(host);
  busyMessage.value = 'Saving long.phosphor…';
  await nextTick();
  const note = document.querySelector('.busy-note');
  expect(note.textContent).toBe('Saving long.phosphor…');
  expect(note.matches(':popover-open')).toBe(true); // in the top layer, over the dialog
  const style = getComputedStyle(note);
  expect(style.animationDelay).toBe('0.5s');
  expect(style.opacity).toBe('0');

  toast('Could not save the file.');
  await nextTick();
  expect(document.querySelector('.busy-note')).toBe(null);
  closeToast();
  await nextTick();
  expect(document.querySelector('.busy-note')).not.toBe(null);

  busyMessage.value = null;
  await nextTick();
  expect(document.querySelector('.busy-note')).toBe(null);
  dialog.remove();
});

test('opening an art file, a project and a picture say which file, and so do saving and exporting (autosave\'s copy: autosave.test.js)', async () => {
  const { project } = await createTestApp();
  const art = new File([Uint8Array.from([0x41, 0x42, 0x0d, 0x0a])], 'tiny.ans');
  expect(await notesWhile(() => project.openArtFile(art, { layer: 'edit' }))).toEqual(['Opening tiny.ans…']);

  const downloads = vi.spyOn(URL, 'createObjectURL');
  expect(await notesWhile(() => project.saveProject('night'))).toEqual(['Saving night.phosphor…']);
  const blob = downloads.mock.calls.at(-1)[0];
  expect(await notesWhile(() => project.loadProject(new File([blob], 'night.phosphor')))).toEqual(['Opening night.phosphor…']);
  expect(await notesWhile(() => project.exportFile('ans', { filename: 'night' }))).toEqual(['Saving night.ans…']);
  expect(await notesWhile(() => project.exportFile('png', { filename: 'night' }))).toEqual(['Saving night.png…']);

  const png = await (await fetch('/tests/fixtures/images/gradient.png')).blob();
  expect(await notesWhile(() => project.setImageFromFile(new File([png], 'sky.png', { type: 'image/png' })))).toEqual(['Opening sky.png…']);
});
