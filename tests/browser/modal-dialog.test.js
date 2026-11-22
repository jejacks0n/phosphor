// ModalDialog is a modal <dialog>: open (the page behind it inert) before its slot mounts, so a field the slot focuses
// on mounting has the focus; a close request or the backdrop cancels, and the dialog stays until whoever shows it
// takes it away, even when the browser closes it itself. Its first line (a title, or tabs, and the ×) stays while its
// body scrolls, the big ones fill a phone's window, and a reading one (About, the legal pages) opens over another.
import { afterEach, expect, onTestFinished, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, defineComponent, h, nextTick, onMounted, ref, vModelText, withDirectives } from 'vue';
import { i18n } from '@/i18n';
import ModalDialog from '@/components/ModalDialog.vue';
import AppToast from '@/components/AppToast.vue';
import '@/assets/global.css'; // the app's buttons and titles
import { toast, closeToast } from '@/composables/useToast';
import { cancelTopDialog } from '@/lib/focus';

// The browser tests' window is a phone's (414 wide), where a big dialog is the whole window: a claim about one in its
// box is made in a desktop's.
async function desktop() {
  await page.viewport(1200, 800);
  onTestFinished(() => page.viewport(414, 896));
  await vi.waitFor(() => expect(innerWidth).toBe(1200));
}

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

test('focus starts in its first field to type in that shows, ahead of an [autofocus] button and a checkbox before it', async () => {
  await mount({}, () => [h('label', [h('input', { type: 'checkbox' })]), h('button', { autofocus: true }, 'Cancel'), h('input', { class: 'hidden', hidden: true }), h('input', { class: 'name' })]);
  expect(document.activeElement).toBe(document.querySelector('dialog input.name'));
});

test('a close request cancels and leaves it open; the backdrop cancels a short one, not a long one', async () => {
  await desktop();
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

const many = () => Array.from({ length: 60 }, (_, i) => h('p', `Line ${i}`));
const closeOf = (dialog) => dialog.querySelector(':scope > .head > button.close');

test('a closable one has the thin × inside its top right corner, on a first line the body scrolls under', async () => {
  await desktop();
  const { cancels, dialog } = await mount({ closable: true, long: true }, many);
  const close = closeOf(dialog()), box = dialog().getBoundingClientRect(), at = close.getBoundingClientRect();
  expect(close.getAttribute('aria-label')).toBe('Close');
  expect(close.querySelector('svg')).toBeTruthy();          // the Palettes and Fonts layer's ×, drawn: not a letter
  expect(close.textContent.trim()).toBe('');
  expect([Math.round(box.right - at.right), Math.round(at.top - box.top)]).toEqual([7, 7]); // 6px in, past the 1px border
  const title = dialog().querySelector(':scope > .head > h3#modal-dialog-title');
  expect(title.textContent).toBe('Ask');
  const body = dialog().querySelector(':scope > .body');
  expect(body.contains(title)).toBe(false);
  expect(body.getBoundingClientRect().top).toBeGreaterThanOrEqual(at.bottom); // nothing of the body passes under the ×
  body.scrollTop = 400;
  expect(body.scrollTop).toBeGreaterThan(0);
  expect(close.getBoundingClientRect().top).toBe(at.top);
  expect(Math.round(title.getBoundingClientRect().top - box.top)).toBe(19); // where it was: 18px in, past the border
  close.click();
  expect(cancels.value).toBe(1);
});

test('one with neither a title nor tabs keeps a line for its ×, and one with no × has no first line', async () => {
  const { dialog } = await mount({ title: '', label: 'Sign in', closable: true, long: true }, many);
  const close = closeOf(dialog());
  expect(dialog().querySelector(':scope > .body').getBoundingClientRect().top).toBeGreaterThanOrEqual(close.getBoundingClientRect().bottom);
  expect(dialog().getAttribute('aria-label')).toBe('Sign in');
  app.unmount();
  host.remove();
  const bare = await mount({ title: '', label: 'Stats' });
  expect(bare.dialog().querySelector(':scope > .head')).toBe(null);
});

const TABS = [{ key: 'about', label: 'About' }, { key: 'licenses', label: 'Licenses', count: 3, id: 'tab-licenses', controls: 'panel-licenses' }];
// ModalDialog with tabs, the chosen one kept by whoever shows it.
async function mountTabs(props = {}) {
  const tab = ref('about');
  const mounted = await mount({ title: '', label: 'About Phosphor', tabs: TABS, ...props, get tab() { return tab.value; }, 'onUpdate:tab': (key) => { tab.value = key; } }, many);
  return { ...mounted, tab, tabs: () => [...mounted.dialog().querySelectorAll(':scope > .head [role=tablist] [role=tab]')] };
}

test('tabs are its first line in a title\'s place: the chosen one marked, a press and the arrow keys choosing', async () => {
  const { dialog, tab, tabs } = await mountTabs({ closable: true });
  expect(dialog().querySelector('h3')).toBe(null);
  expect(dialog().querySelector('[role=tablist]').getAttribute('aria-label')).toBe('About Phosphor');
  expect(tabs().map((el) => el.textContent.replace(/\s+/g, ' ').trim())).toEqual(['About', 'Licenses 3']);
  expect(tabs()[1].querySelector('span.count').textContent).toBe('3');
  expect(tabs().map((el) => [el.getAttribute('aria-selected'), el.tabIndex, el.classList.contains('on')])).toEqual([['true', 0, true], ['false', -1, false]]);
  expect([tabs()[1].id, tabs()[1].getAttribute('aria-controls')]).toEqual(['tab-licenses', null]); // its panel isn't there until it's chosen
  tabs()[1].click();
  await nextTick();
  expect(tab.value).toBe('licenses');
  expect(tabs().map((el) => el.getAttribute('aria-selected'))).toEqual(['false', 'true']);
  expect(tabs()[1].getAttribute('aria-controls')).toBe('panel-licenses');
  tabs()[1].focus();
  tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); // past the last: round to the first
  await nextTick();
  expect(tab.value).toBe('about');
  expect(document.activeElement).toBe(tabs()[0]);
  tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  await nextTick();
  expect(tab.value).toBe('licenses');
  expect(document.activeElement).toBe(tabs()[1]);
});

test('the tabs\' line is the Palettes and Fonts layer\'s: 38px over a rule, the × at its right end, the body from its top on a new tab', async () => {
  await desktop();
  const { dialog, tab, tabs } = await mountTabs({ closable: true, long: true });
  const head = dialog().querySelector(':scope > .head'), close = closeOf(dialog());
  expect(Math.round(head.getBoundingClientRect().height)).toBe(39); // 38px and its rule
  expect(getComputedStyle(head).borderBottomWidth).toBe('1px');
  const style = getComputedStyle(tabs()[0]);
  expect([style.fontSize, style.textTransform, style.fontWeight]).toEqual(['11px', 'uppercase', '600']);
  expect(getComputedStyle(tabs()[1]).fontWeight).toBe('400');
  const strip = head.getBoundingClientRect(), at = close.getBoundingClientRect();
  expect(Math.round(strip.right - at.right)).toBe(6);
  expect(Math.abs(at.top + at.height / 2 - (strip.top + (strip.height - 1) / 2))).toBeLessThanOrEqual(0.5); // in the middle of the line
  expect(tabs()[0].getBoundingClientRect().left).toBeLessThan(at.left);
  const body = dialog().querySelector(':scope > .body');
  body.scrollTop = 300;
  tab.value = 'licenses';
  await nextTick();
  expect(body.scrollTop).toBe(0);
});

test('a big one (long, wide, reading or full) is a phone\'s whole window, and a small one keeps its margin', async () => {
  for (const props of [{ long: true }, { wide: true }, { reading: true }, { full: true }]) {
    const { dialog } = await mount(props);
    const box = dialog().getBoundingClientRect();
    expect([props, box.left, box.top, box.width, box.height]).toEqual([props, 0, 0, innerWidth, innerHeight]);
    expect(getComputedStyle(dialog()).borderTopWidth).toBe('0px');
    app.unmount();
    host.remove();
  }
  const small = await mount();
  expect(small.dialog().getBoundingClientRect().width).toBe(innerWidth - 40);
  app.unmount();
  host.remove();
  await desktop();
  const boxed = await mount({ long: true });
  expect(boxed.dialog().getBoundingClientRect().width).toBe(600);
});

test('a big one is the whole window of a phone on its side too (a short window), as the Palettes and Fonts layer is', async () => {
  await page.viewport(844, 390);
  onTestFinished(() => page.viewport(414, 896));
  await vi.waitFor(() => expect([innerWidth, innerHeight]).toEqual([844, 390]));
  for (const props of [{ long: true }, { wide: true }, { reading: true }, { full: true }]) {
    const { dialog } = await mount(props);
    const box = dialog().getBoundingClientRect();
    expect([props, box.left, box.top, box.width, box.height]).toEqual([props, 0, 0, 844, 390]);
    app.unmount();
    host.remove();
  }
  const small = await mount();
  expect(small.dialog().getBoundingClientRect().width).toBe(478); // a small box keeps its size and its margin
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

test('a reading one (About, the legal pages) opens over it, modal, wider, its × focused, and closes on its backdrop', async () => {
  await desktop();
  await mount();
  const read = ref(true);
  const readingHost = document.createElement('div');
  document.body.append(readingHost);
  const reading = createApp({ render: () => (read.value ? h(ModalDialog, { reading: true, closable: true, back: false, label: 'Terms', onCancel: () => { read.value = false; } }, () => 'Text') : null) }).use(i18n);
  reading.mount(readingHost);
  await nextTick();
  try {
    const dialog = document.querySelector('dialog.modal-dialog.reading');
    expect(dialog.matches(':modal')).toBe(true);
    expect(dialog.getAttribute('aria-label')).toBe('Terms');
    expect(dialog.getBoundingClientRect().width).toBe(802);
    expect(document.activeElement).toBe(closeOf(dialog));
    dialog.click(); // at 0, 0: the backdrop
    await nextTick();
    expect(document.querySelector('dialog.modal-dialog.reading')).toBe(null);
    expect(document.querySelector('dialog.modal-dialog').open).toBe(true);
    expect(cancelTopDialog()).toBe(true); // the one under it: a reading one with back false left Back alone
  } finally {
    reading.unmount();
    readingHost.remove();
  }
});

// The top layer's order can't be read, and what's under a modal is inert, so it isn't hit either: a toast that's
// shown again goes to the top of the top layer.
test('a toast is a popover, over a dialog: shown when said, again when a dialog opens, and again on a new message', async () => {
  const toastHost = document.createElement('div');
  document.body.append(toastHost);
  const toasts = createApp(AppToast).use(i18n);
  toasts.mount(toastHost);
  const shows = vi.spyOn(HTMLElement.prototype, 'showPopover');
  try {
    toast('Saved.');
    await nextTick();
    expect(document.querySelector('div.app-toast').matches(':popover-open')).toBe(true);
    expect(shows).toHaveBeenCalledTimes(1);
    await mount(); // the dialog shows it again, over itself
    expect(shows).toHaveBeenCalledTimes(2);
    expect(shows.mock.contexts[1]).toBe(document.querySelector('div.app-toast'));
    expect(document.querySelector('dialog.modal-dialog').open).toBe(true);
    toast('Autosave is failing.'); // and a new message, over a dialog opened since
    await nextTick();
    expect(shows).toHaveBeenCalledTimes(3);
    expect(shows.mock.contexts[2]).toBe(document.querySelector('div.app-toast'));
    expect(document.querySelector('div.app-toast').matches(':popover-open')).toBe(true);
  } finally {
    shows.mockRestore();
    closeToast();
    toasts.unmount();
    toastHost.remove();
  }
});

// And the browser's Back: a dialog over the page is canceled by it, as by Escape, the last opened first; one the
// address shows or asks about (back false: SOCIAL's pages, its question, ending a room) is left to the router.
const backApps = [];
afterEach(() => backApps.splice(0).forEach((each) => each.unmount()));

function show(props = {}) {
  const cancel = vi.fn();
  const each = createApp({ render: () => h(ModalDialog, { title: 'A dialog', onCancel: cancel, ...props }) }).use(i18n);
  each.mount(document.createElement('div'));
  backApps.push(each);
  return { cancel, close: () => backApps.splice(backApps.indexOf(each), 1)[0].unmount() };
}

test('Back cancels the dialog on top, then the one under it; with none open it has nothing to cancel', () => {
  const under = show(), top = show();
  expect(cancelTopDialog()).toBe(true);
  expect(top.cancel).toHaveBeenCalledTimes(1);
  expect(under.cancel).not.toHaveBeenCalled();
  top.close();
  expect(cancelTopDialog()).toBe(true);
  expect(under.cancel).toHaveBeenCalledTimes(1);
  under.close();
  expect(cancelTopDialog()).toBe(false);
});

test('a dialog with back false is left to the router', () => {
  const page = show({ back: false });
  expect(cancelTopDialog()).toBe(false);
  expect(page.cancel).not.toHaveBeenCalled();
});
