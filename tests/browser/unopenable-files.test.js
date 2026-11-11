// A file Phosphor can't open says so, naming it, whether it's dropped or chosen.
import { test, expect, afterEach } from 'vitest';
import { createApp } from 'vue';
import { createTestApp } from '../support/app.js';
import EditWorkspace from '@/components/EditWorkspace.vue';
import { i18n } from '@/i18n';
import { toastMessage, closeToast } from '@/composables/useToast.js';

let mounted = null;
afterEach(() => { mounted?.unmount(); mounted = null; closeToast(); });

async function startScreen() {
  const { project } = await createTestApp();
  const host = document.createElement('div');
  document.body.append(host);
  mounted = createApp(EditWorkspace).use(i18n);
  mounted.mount(host);
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { project, host };
}

const filesOf = (file) => { const data = new DataTransfer(); data.items.add(file); return data; };
const message = () => toastMessage.value;

test('a file chosen that Phosphor cannot open is refused with its name, and nothing opens', async () => {
  const { project, host } = await startScreen();
  const input = host.querySelector('input[type=file]');
  input.files = filesOf(new File([new Uint8Array(8)], 'theme.sue')).files;
  input.dispatchEvent(new Event('change'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(message()).toContain("Phosphor can't open theme.sue");
  expect(project.image).toBeFalsy();
});

test('a file dropped that Phosphor cannot open is refused with its name', async () => {
  const { host } = await startScreen();
  const event = new Event('drop', { bubbles: true, cancelable: true });
  event.dataTransfer = filesOf(new File([new Uint8Array(8)], 'font.ttf'));
  host.querySelector('article.drop-zone').dispatchEvent(event);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(message()).toContain("Phosphor can't open font.ttf");
});

test('an .nfo is not refused', async () => {
  const { host } = await startScreen();
  const input = host.querySelector('input[type=file]');
  input.files = filesOf(new File([Uint8Array.from([0xb0, 0xdb, 0x0d, 0x0a, 0x41])], 'release.nfo')).files;
  input.dispatchEvent(new Event('change'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect((message() ?? '')).not.toContain("can't open");
});

// Some phones give a photo no type: it is tried as a picture, and refused only if it won't decode.
const choose = async (host, file) => {
  const input = host.querySelector('input[type=file]');
  input.files = filesOf(file).files;
  input.dispatchEvent(new Event('change'));
  await new Promise((resolve) => setTimeout(resolve, 300));
};

test('a file with no type that holds a picture opens', async () => {
  const { project, host } = await startScreen();
  await choose(host, new File([await (await fetch('/tests/fixtures/images/gradient.png')).arrayBuffer()], 'photo.heic', { type: '' }));
  expect(project.image).toBeTruthy();
  expect(message() ?? '').not.toContain("can't open");
});

test('a file with no type that is not a picture is refused with its name', async () => {
  const { project, host } = await startScreen();
  await choose(host, new File([new Uint8Array(64).fill(7)], 'mystery.xb', { type: '' }));
  expect(message()).toContain("Phosphor can't open mystery.xb");
  expect(project.image).toBeFalsy();
});
