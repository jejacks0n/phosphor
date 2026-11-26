// A file Phosphor can't open says so, naming it, whether it's dropped or chosen.
import { test, expect, vi, afterEach } from 'vitest';
import { createApp } from 'vue';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import EditWorkspace from '@/components/EditWorkspace.vue';
import { i18n } from '@/i18n';
import { toastMessage, closeToast } from '@/composables/useToast.js';

let mounted = null;
afterEach(() => { mounted?.unmount(); mounted = null; closeToast(); });

async function startScreen() {
  const { project, workspace } = await createTestApp();
  const host = document.createElement('div');
  document.body.append(host);
  mounted = createApp(EditWorkspace).use(i18n);
  mounted.mount(host);
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { project, workspace, host };
}

const filesOf = (file) => { const data = new DataTransfer(); data.items.add(file); return data; };
const message = () => toastMessage.value;
// Whether a file opens is known only after it's read, and one with no type after the browser has tried it as a picture,
// which on a busy machine takes longer than any fixed wait: each test waits for what the file comes to.
const PATIENT = { interval: 10, timeout: 10_000 };
const refused = (name) => vi.waitFor(() => expect(message()).toContain(`Phosphor cannot open ${name}`), PATIENT);
const opened = (project) => vi.waitFor(() => expect(project.image).toBeTruthy(), PATIENT);

test('a file chosen that Phosphor cannot open is refused with its name, and nothing opens', async () => {
  const { project, host } = await startScreen();
  const input = host.querySelector('input[type=file]');
  input.files = filesOf(new File([new Uint8Array(8)], 'theme.sue')).files;
  input.dispatchEvent(new Event('change'));
  await refused('theme.sue');
  expect(project.image).toBeFalsy();
});

test('a file dropped that Phosphor cannot open is refused with its name', async () => {
  const { host } = await startScreen();
  const event = new Event('drop', { bubbles: true, cancelable: true });
  event.dataTransfer = filesOf(new File([new Uint8Array(8)], 'font.ttf'));
  host.querySelector('article.drop-zone').dispatchEvent(event);
  await refused('font.ttf');
});

test('an .nfo is not refused', async () => {
  const { workspace, host } = await startScreen();
  const ask = vi.spyOn(workspace, 'askArt');
  const input = host.querySelector('input[type=file]');
  input.files = filesOf(new File([Uint8Array.from([0xb0, 0xdb, 0x0d, 0x0a, 0x41])], 'release.nfo')).files;
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(ask).toHaveBeenCalled(), PATIENT); // asked how to open it, as art files are
  expect(message() ?? '').not.toContain('cannot open');
});

// Some phones give a photo no type: it is tried as a picture, and refused only if it won't decode.
const choose = async (host, file) => {
  const input = host.querySelector('input[type=file]');
  input.files = filesOf(file).files;
  input.dispatchEvent(new Event('change'));
};

test('a file with no type that holds a picture opens', async () => {
  const { project, host } = await startScreen();
  await choose(host, new File([await (await fetch('/tests/fixtures/images/gradient.png')).arrayBuffer()], 'photo.heic', { type: '' }));
  await opened(project);
  expect(message() ?? '').not.toContain('cannot open');
});

test('a file with no type that is not a picture is refused with its name', async () => {
  const { project, host } = await startScreen();
  await choose(host, new File([new Uint8Array(64).fill(7)], 'mystery.dat', { type: '' }));
  await refused('mystery.dat');
  expect(project.image).toBeFalsy();
});

test('the start screen\'s chooser is a named button, reachable by Tab, and it opens the file input', async () => {
  const { host } = await startScreen();
  const button = host.querySelector('article.zero-state button.browse');
  expect(button.tabIndex).toBe(0);
  expect(button.textContent.trim().length).toBeGreaterThan(0);
  let clicked = 0;
  host.querySelector('input[type=file]').addEventListener('click', (e) => { clicked++; e.preventDefault(); });
  button.click();
  expect(clicked).toBe(1);
});

// A .pho renamed to .png is still a project: it opens as one, never as a picture.
test('a .pho renamed to .png opens as its project, not as a picture', async () => {
  const { project, workspace, host } = await startScreen();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 10 });
  await settle(project);
  project.typeAt(2, 2, 'Z', { fg: '#ffffff', bg: '#000000' });
  project.commitPending();
  const saved = new Promise((resolve) => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { resolve(this.href); });
  });
  await project.saveProject();
  const blob = await (await fetch(await saved)).blob();
  vi.restoreAllMocks();
  const cells = cellsKey(project);
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 8, rows: 8 }); // a different drawing is open
  await settle(project);
  project.markSaved();
  const ask = vi.spyOn(workspace, 'askArt');
  await choose(host, new File([blob], 'renamed.png', { type: 'image/png' }));
  await vi.waitFor(() => expect(cellsKey(project)).toEqual(cells), PATIENT);
  expect(ask).not.toHaveBeenCalled();
  expect(project.cols).toBe(20);
});

test('a plain .png still opens as a picture', async () => {
  const { project, host } = await startScreen();
  await choose(host, new File([await (await fetch('/tests/fixtures/images/gradient.png')).arrayBuffer()], 'plain.png', { type: 'image/png' }));
  await opened(project);
  expect(project.fileExt).not.toBe('pho');
});

test('a .png with a broken phPr chunk says it is not a project', async () => {
  const { project, host } = await startScreen();
  const png = new Uint8Array(await (await fetch('/tests/fixtures/images/gradient.png')).arrayBuffer());
  const out = new Uint8Array(png.length + 12);
  out.set(png.subarray(0, 33));
  out.set([0, 0, 0, 0, 0x70, 0x68, 0x50, 0x72, 0, 0, 0, 0], 33); // an empty phPr chunk with a bad CRC
  out.set(png.subarray(33), 45);
  const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
  await choose(host, new File([out], 'broken.png', { type: 'image/png' }));
  await vi.waitFor(() => expect(alert).toHaveBeenCalled(), PATIENT);
  expect(project.image).toBeFalsy();
});
