// ModalDialog is a modal <dialog>: open (the page behind it inert) before its slot mounts, so a field the slot focuses
// on mounting has the focus; a close request or the backdrop cancels, and the dialog stays until whoever shows it
// takes it away, even when the browser closes it itself. ReadingDialog, over it, is one too.
import { afterEach, expect, test, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, onMounted, ref, vModelText, withDirectives } from 'vue';
import { i18n } from '@/i18n';
import ModalDialog from '@/components/ModalDialog.vue';
import ReadingDialog from '@/components/ReadingDialog.vue';

let app, host;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

// A field that focuses itself as it mounts, as TwoFactorPage's does.
const SelfFocusing = defineComponent({
  setup() {
    const input = ref(null);
    onMounted(() => input.value.focus());
    return () => h('input', { ref: input, class: 'self' });
  },
});

// ModalDialog shown while `shown`; a cancel takes it away unless `refuse`.
async function mount(props = {}, slot = () => h('button', { class: 'first' }, 'OK')) {
  const shown = ref(true), refuse = ref(false), cancels = ref(0);
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({
    render: () => (shown.value ? h(ModalDialog, { title: 'Ask', ...props, onCancel: () => { cancels.value++; if (!refuse.value) shown.value = false; } }, slot) : null),
  }).use(i18n);
  app.mount(host);
  await nextTick();
  return { shown, refuse, cancels, dialog: () => document.querySelector('dialog.modal-dialog') };
}

test('it opens modal, its first control focused, and a field the slot focuses on mounting keeps the focus', async () => {
  const { dialog } = await mount();
  expect(dialog().matches(':modal')).toBe(true);
  expect(document.activeElement).toBe(dialog().querySelector('button.first'));
  app.unmount();
  host.remove();
  await mount({ focus: false, long: true }, () => h(SelfFocusing));
  expect(document.activeElement).toBe(document.querySelector('input.self'));
});

test('an [autofocus] field with v-model has its text when it takes focus, as the save dialog\'s selects its name', async () => {
  const name = ref('art');
  await mount({}, () => withDirectives(h('input', { autofocus: true, 'onUpdate:modelValue': (v) => { name.value = v; }, onFocus: (e) => e.target.select() }), [[vModelText, name.value]]));
  const input = document.querySelector('dialog input');
  expect(document.activeElement).toBe(input);
  expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3]);
});

test('a close request cancels and leaves it open; the backdrop cancels a short one, not a long one', async () => {
  const { refuse, cancels, dialog } = await mount();
  refuse.value = true;
  dialog().dispatchEvent(new Event('cancel', { cancelable: true }));
  dialog().click(); // at 0, 0: the backdrop
  await nextTick();
  expect(cancels.value).toBe(2);
  expect(dialog().open).toBe(true);
  dialog().querySelector('button.first').click(); // in the box
  expect(cancels.value).toBe(2);
  refuse.value = false;
  dialog().click();
  await nextTick();
  expect(dialog()).toBe(null);
  app.unmount();
  host.remove();
  const long = await mount({ long: true });
  long.dialog().click();
  await nextTick();
  expect(long.cancels.value).toBe(0);
});

test('closed by the browser, it cancels, and opens again when whoever shows it says no', async () => {
  const { refuse, cancels, dialog } = await mount();
  refuse.value = true;
  dialog().close(); // its close event comes as a task of its own
  await vi.waitUntil(() => dialog().open, { interval: 5 });
  expect(cancels.value).toBe(1);
  expect(dialog().matches(':modal')).toBe(true);
  refuse.value = false;
  dialog().close();
  await vi.waitUntil(() => !dialog(), { interval: 5 });
  expect(cancels.value).toBe(2);
});

test('taken away by whoever shows it, it doesn\'t cancel', async () => {
  const { shown, cancels } = await mount();
  shown.value = false;
  await new Promise((resolve) => setTimeout(resolve, 20)); // past any close event
  expect(cancels.value).toBe(0);
});

test('a reading dialog opens over it, modal, and closes on its backdrop', async () => {
  await mount();
  const read = ref(true);
  const readingHost = document.createElement('div');
  document.body.append(readingHost);
  const reading = createApp({ render: () => (read.value ? h(ReadingDialog, { label: 'Terms', onClose: () => { read.value = false; } }, () => 'Text') : null) }).use(i18n);
  reading.mount(readingHost);
  await nextTick();
  try {
    const dialog = document.querySelector('dialog.reading-dialog');
    expect(dialog.matches(':modal')).toBe(true);
    expect(document.activeElement).toBe(dialog.querySelector('button.close'));
    dialog.click(); // at 0, 0: the backdrop
    await nextTick();
    expect(document.querySelector('dialog.reading-dialog')).toBe(null);
    expect(document.querySelector('dialog.modal-dialog').open).toBe(true);
  } finally {
    reading.unmount();
    readingHost.remove();
  }
});
