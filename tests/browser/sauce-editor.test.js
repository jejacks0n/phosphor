// The SAUCE tab (SauceEditor.vue): a count on each short field as the record counts characters, a line under a field
// naming what an edit left out, and the fields off for an artist in a room.
import { test, expect, afterEach } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import SauceEditor from '@/components/SauceEditor.vue';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

async function mount(before = () => {}) {
  const stores = await createTestApp();
  await stores.project.setBlankCanvas({ cols: 20, rows: 10 });
  await settle(stores.project);
  before(stores);
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(SauceEditor).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  return stores;
}

const field = (id) => host.querySelector(`#${id}`);
const countOf = (id) => host.querySelector(`#${id}-count`);
const noteOf = (id) => host.querySelector(`#${id}-note`);

// An edit as the browser makes one: the field's new text, the caret after what went in, then input.
async function edit(id, text, caret = text.length, inputType = 'insertFromPaste') {
  const input = field(id);
  input.value = text;
  input.setSelectionRange(caret, caret);
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType }));
  await nextTick();
}

test('each short field counts its characters as the record does, an emoji as one, and warns at its width', async () => {
  const { project } = await mount(({ project }) => { project.sauceTitle = 'Café 🎨'; });
  expect(countOf('sauce-title').textContent.trim()).toBe('6 / 35');
  expect(countOf('sauce-author').textContent.trim()).toBe('0 / 20');
  expect(countOf('sauce-group').textContent.trim()).toBe('0 / 20');
  expect(countOf('sauce-title').classList.contains('full')).toBe(false);

  project.sauceTitle = '🎨'.repeat(35);
  await nextTick();
  expect(countOf('sauce-title').textContent.trim()).toBe('35 / 35');
  expect(countOf('sauce-title').classList.contains('full')).toBe(true);
  expect(noteOf('sauce-title').textContent.trim()).toBe(''); // nothing typed was cut
});

test('a paste past the width keeps what fits, and a line under the field names the rest until the next change', async () => {
  const { project } = await mount();
  await edit('sauce-title', 'Café € 🎨 Restaurée par Walt, été 1996 xyz');
  expect(project.sauceTitle).toBe('Café € 🎨 Restaurée par Walt, été 19');
  expect(field('sauce-title').value).toBe('Café € 🎨 Restaurée par Walt, été 19');
  expect(noteOf('sauce-title').textContent.trim()).toBe('Only 35 characters fit. Left out: "96 xyz"');
  expect(noteOf('sauce-title').getAttribute('aria-live')).toBe('polite');
  expect(field('sauce-title').getAttribute('aria-describedby')).toContain('sauce-title-note');

  await edit('sauce-title', project.sauceTitle.slice(0, -1), project.sauceTitle.length - 1, 'deleteContentBackward');
  expect(noteOf('sauce-title').textContent.trim()).toBe('');
});

test('a key pressed in a full field is named, and a long left-out part is cut short', async () => {
  const { project } = await mount(({ project }) => { project.sauceAuthor = 'x'.repeat(20); });
  await edit('sauce-author', `${'x'.repeat(20)}Q`, 21, 'insertText');
  expect(project.sauceAuthor).toBe('x'.repeat(20));
  expect(noteOf('sauce-author').textContent.trim()).toBe('Only 20 characters fit. Left out: "Q"');

  await edit('sauce-group', 'g'.repeat(20) + 'abcdefghijklmnopqrstuvwxyz');
  expect(noteOf('sauce-group').textContent.trim()).toBe('Only 20 characters fit. Left out: "abcdefghijklmnopqrst…"');
});

test('a change from elsewhere (a file opened, a host\'s) clears the line, and raises none', async () => {
  const { project } = await mount();
  await edit('sauce-title', 't'.repeat(40));
  expect(noteOf('sauce-title').textContent.trim()).not.toBe('');
  project.sauceTitle = 'Opened';
  await nextTick();
  expect(field('sauce-title').value).toBe('Opened');
  expect(noteOf('sauce-title').textContent.trim()).toBe('');
});

test('IME text is fitted once it\'s committed, not while it\'s composed', async () => {
  const { project } = await mount(({ project }) => { project.sauceAuthor = 'x'.repeat(19); });
  const input = field('sauce-author');
  input.value = `${'x'.repeat(19)}かな`;
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', isComposing: true }));
  await nextTick();
  expect(input.value).toBe(`${'x'.repeat(19)}かな`); // left alone mid-composition
  input.setSelectionRange(21, 21);
  input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'かな' }));
  await nextTick();
  expect(project.sauceAuthor).toBe(`${'x'.repeat(19)}か`);
  expect(noteOf('sauce-author').textContent.trim()).toBe('Only 20 characters fit. Left out: "な"');
});

test('for an artist in a room, the fields are off and the counts still show', async () => {
  await mount(({ project }) => { project._sharing = { role: 'artist' }; project.sauceTitle = 'Host\'s'; });
  expect(field('sauce-title').matches(':disabled')).toBe(true);
  expect(host.querySelector('fieldset').title).toBe('Only the room\'s host can change this.');
  expect(countOf('sauce-title').textContent.trim()).toBe('6 / 35');
});
