// The SAUCE tab (SauceEditor.vue): a count on each short field as the record counts characters, a line under a field
// saying how many characters fit when an edit went past it, and the fields off for an artist in a room.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import SauceEditor from '@/components/SauceEditor.vue';
import { CP437_BLOCKS } from '@/lib/BitmapFont.js';
import { closeToast, toastMessage } from '@/composables/useToast';

// The system's reduced-motion setting, as matchMedia answers it; every other query the browser's own.
const realMatchMedia = window.matchMedia.bind(window);
const reducedMotion = (on) => vi.spyOn(window, 'matchMedia').mockImplementation((query) => (query === '(prefers-reduced-motion: reduce)' ? { matches: on, media: query } : realMatchMedia(query)));

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

async function mount(before = () => {}) {
  const stores = await createTestApp();
  await stores.project.setBlankCanvas({ withLayer: true, cols: 20, rows: 10 });
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

test('a paste past the width keeps what fits, and a line under the field says how many fit until the next change', async () => {
  const { project } = await mount();
  await edit('sauce-title', 'Café € 🎨 Restaurée par Walt, été 1996 xyz');
  expect(project.sauceTitle).toBe('Café € 🎨 Restaurée par Walt, été 19');
  expect(field('sauce-title').value).toBe('Café € 🎨 Restaurée par Walt, été 19');
  expect(noteOf('sauce-title').textContent.trim()).toBe('Only 35 characters fit.');
  expect(noteOf('sauce-title').getAttribute('aria-live')).toBe('polite');
  expect(field('sauce-title').getAttribute('aria-describedby')).toContain('sauce-title-note');

  await edit('sauce-title', project.sauceTitle.slice(0, -1), project.sauceTitle.length - 1, 'deleteContentBackward');
  expect(noteOf('sauce-title').textContent.trim()).toBe('');
});

test('keys typed one by one past a full field say only how many fit, never just the last key', async () => {
  const { project } = await mount(({ project }) => { project.sauceTitle = 'Restored by Walt from the 1996 pack'; });
  for (const key of '!XYZW') await edit('sauce-title', `${project.sauceTitle}${key}`, 36, 'insertText');
  expect(project.sauceTitle).toBe('Restored by Walt from the 1996 pack');
  expect(noteOf('sauce-title').textContent.trim()).toBe('Only 35 characters fit.'); // not Left out: "W"
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
  expect(noteOf('sauce-author').textContent.trim()).toBe('Only 20 characters fit.');
});

test('for an artist in a room, the fields are off and the counts still show', async () => {
  await mount(({ project }) => { project._sharing = { role: 'artist' }; project.sauceTitle = 'Host\'s'; });
  expect(field('sauce-title').matches(':disabled')).toBe(true);
  expect(host.querySelector('fieldset').title).toBe('Only the room\'s host can change this.');
  expect(countOf('sauce-title').textContent.trim()).toBe('6 / 35');
});

test('control characters typed or pasted are left out, and the line under the field says so', async () => {
  const { project } = await mount();
  await edit('sauce-author', 'A\tB\u0007C\u001b[31mD');
  expect(project.sauceAuthor).toBe('ABC[31mD');
  expect(field('sauce-author').value).toBe('ABC[31mD');
  expect(noteOf('sauce-author').textContent.trim()).toBe('Control characters, like tab or ESC, can\'t be in SAUCE and were left out.');

  await edit('sauce-group', `${'g'.repeat(19)}\u001bxy`);
  expect(project.sauceGroup).toBe(`${'g'.repeat(19)}x`);
  expect(noteOf('sauce-group').textContent.trim()).toBe('Only 20 characters fit.\nControl characters, like tab or ESC, can\'t be in SAUCE and were left out.');
});

test('Comments keep their line breaks, CR LF as LF, and lose their other control characters', async () => {
  const { project } = await mount();
  const comments = host.querySelector('#sauce-comments');
  comments.value = 'one\r\ntwo\u001b[0m\tthree';
  comments.setSelectionRange(comments.value.length, comments.value.length);
  comments.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
  await nextTick();
  expect(project.sauceUserComments).toBe('one\ntwo[0mthree');
  expect(noteOf('sauce-comments').textContent.trim()).toBe('Control characters, like tab or ESC, can\'t be in SAUCE and were left out.');
});

// Walt's paste: 300 lines, each two record lines long.
const LONG = Array.from({ length: 300 }, (_, i) => `${String(i + 1).padStart(3, '0')} greets: the crew, the board, and everyone who kept these files alive`).join('\n');
const linesOf = () => host.querySelector('#sauce-comments-count');
const paste = async (text) => {
  const comments = field('sauce-comments');
  comments.value = text;
  comments.setSelectionRange(text.length, text.length);
  comments.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
  await nextTick();
};

test('Comments count the record lines the export writes, Phosphor\'s own included and said so', async () => {
  const { project } = await mount();
  expect(linesOf()).toBeNull(); // nothing typed: no count
  await paste('one\ntwo');
  const own = project.sauceCommentFit().own;
  expect(own).toBeGreaterThanOrEqual(5); // Created with, Params, Adjust, Effects (wrapped), and the blank line
  expect(linesOf().textContent.trim()).toBe(`${own + 2} of 255 SAUCE lines (${own} are Phosphor's own)`);
  expect(field('sauce-comments').getAttribute('aria-describedby')).toContain('sauce-comments-count');

  project.sauceRecord = 'none'; // an opened file: none of Phosphor's
  await nextTick();
  expect(linesOf().textContent.trim()).toBe('2 of 255 SAUCE lines');
});

test('past 255 the count says from which line comments won\'t be in the file; the paste itself is kept whole', async () => {
  const { project } = await mount(({ project }) => { project.sauceRecord = 'none'; });
  const spoken = () => host.querySelector('#sauce-comments-spoken').textContent.trim();
  await paste('fits');
  expect(spoken()).toBe('');
  await paste(LONG);
  expect(project.sauceUserComments).toBe(LONG); // not cut by characters
  expect(noteOf('sauce-comments').textContent.trim()).toBe('');
  const over = '600 of 255 SAUCE lines. From line 128 ("files alive") on, comments won\'t be in the file.';
  expect(linesOf().textContent.trim()).toBe(over);
  expect(linesOf().classList.contains('over')).toBe(true);
  expect(spoken()).toBe(over); // said once, as it crosses

  await paste(`${LONG}\nmore`); // still over: not said again
  expect(spoken()).toBe(over);
  await paste('short again');
  expect(spoken()).toBe('1 of 255 SAUCE lines');
});

test('a paste past the field\'s ceiling is cut, and the line under it says where', async () => {
  const { project } = await mount();
  await paste(`${'x'.repeat(32 * 1024)}tail end`);
  expect(project.sauceUserComments).toBe('x'.repeat(32 * 1024));
  expect(noteOf('sauce-comments').textContent.trim()).toBe('Only 32,768 characters fit.');
});

test('Date comes after Group, takes digits only, and a date that isn\'t a real YYYYMMDD gets a quiet note', async () => {
  const { project } = await mount();
  const ids = [...host.querySelectorAll('input, textarea')].map((el) => el.id).filter(Boolean);
  expect(ids.slice(0, 5)).toEqual(['sauce-title', 'sauce-author', 'sauce-group', 'sauce-date', 'sauce-comments']);
  expect(host.querySelector('label[for="sauce-date"]').textContent.trim()).toBe('Date (YYYYMMDD)');
  expect(field('sauce-date').getAttribute('inputmode')).toBe('numeric');
  expect(field('sauce-date').placeholder).toBe('The day you export'); // a new drawing's
  const dateNote = () => host.querySelector('#sauce-date-format');

  await edit('sauce-date', '1996-11-13');
  expect(project.sauceDate).toBe('19961113');
  expect(dateNote()).toBeNull();
  await edit('sauce-date', '19961313');
  expect(dateNote().textContent.trim()).toBe('SAUCE dates are YYYYMMDD, like 19961113.');
  await edit('sauce-date', '1996');
  expect(dateNote()).not.toBeNull();
  await edit('sauce-date', '199611134');
  expect(project.sauceDate).toBe('19961113');
  expect(noteOf('sauce-date').textContent.trim()).toBe('Only 8 characters fit.');
});

test('For other viewers: Font name (20, counted) and Letter spacing, with a line saying what they\'re for', async () => {
  const { project } = await mount();
  expect(host.textContent).toContain('For other viewers');
  expect(host.textContent).toContain('These tell other viewers how to show the file. Phosphor\'s view keeps your display font, except that with a bitmap font Letter spacing is the width it\'s drawn at.');
  expect(field('sauce-font').value).toBe('IBM VGA'); // what a new drawing's export writes
  expect(countOf('sauce-font').textContent.trim()).toBe('7 / 20');
  await edit('sauce-font', 'Amiga Topaz 1+ and then some');
  expect(project.sauceFontName).toBe('Amiga Topaz 1+ and t');
  expect(noteOf('sauce-font').textContent.trim()).toBe('Only 20 characters fit.');

  const spacing = () => [...host.querySelectorAll('[aria-label="Letter spacing"] button')].map((b) => `${b.textContent.trim()}${b.getAttribute('aria-pressed') === 'true' ? '*' : ''}`);
  expect(spacing()).toEqual(['Not set', '8px*', '9px']); // a new drawing's: 8px
  host.querySelectorAll('[aria-label="Letter spacing"] button')[2].click();
  await nextTick();
  expect(project.sauceLetterSpacing).toBe('9');
  expect(spacing()).toEqual(['Not set', '8px', '9px*']);
  expect(project.sauceFields().flags & 6).toBe(4);
});

test('an opened file\'s empty date and font name say they\'re empty in the file, and its letter spacing shows', async () => {
  await mount(({ project }) => Object.assign(project, { sauceRecord: '17 80 25 80 25', sauceDate: '', sauceFontName: '' })); // flags 17: iCE colors and a bit of its own, no spacing
  expect(field('sauce-date').placeholder).toBe('Empty in the file');
  expect(field('sauce-font').placeholder).toBe('Empty in the file');
  expect([...host.querySelectorAll('[aria-label="Letter spacing"] button')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
});

test('for an artist in a room, Date, Font name and Letter spacing are off too', async () => {
  await mount(({ project }) => { project._sharing = { role: 'artist' }; });
  for (const id of ['sauce-date', 'sauce-font']) expect(field(id).matches(':disabled'), id).toBe(true);
  expect([...host.querySelectorAll('[aria-label="Letter spacing"] button')].every((b) => b.matches(':disabled'))).toBe(true);
});

const SLIM = () => ({ name: 'Slim', height: 7, bytes: Uint8Array.from({ length: 256 * 7 }, (_, i) => (i % 251) & 0xfe), blocks: [...CP437_BLOCKS] });
const pick = async (index) => { host.querySelectorAll('[aria-label="Letter spacing"] button')[index].click(); await nextTick(); };

test('choosing 9px on the SAUCE tab widens the drawing to 9, and the Fonts page shows 9', async () => {
  const { project } = await mount();
  await project.setDrawingFont({ ...SLIM(), width: 8 });
  await pick(2);
  expect(project.sauceLetterSpacing).toBe('9');
  expect(project.drawingFont.cellWidth).toBe(9); // what the Fonts page's Width switch reads
});

test('choosing 8px while drawn narrow sets it not narrow', async () => {
  const { project } = await mount();
  await project.setDrawingFont({ ...SLIM(), width: 7 });
  expect(project.drawingFont.cellWidth).toBe(7);
  expect([...host.querySelectorAll('[aria-label="Letter spacing"] button')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false']);
  await pick(1);
  expect(project.fontWidth).toBe('');
  expect(project.sauceLetterSpacing).toBe('8');
  expect(project.drawingFont.cellWidth).toBe(8);
});

test('with a bitmap font, Not set is an undo step like 8px and 9px: 9px, then Not set, then undo walks the width and Letter spacing back together', async () => {
  const { project } = await mount();
  await project.setDrawingFont({ ...SLIM(), width: 8 });
  await pick(2);
  expect([project.sauceLetterSpacing, project.drawingFont.cellWidth]).toEqual(['9', 9]);
  await pick(0);
  expect([project.sauceLetterSpacing, project.fontWidth, project.drawingFont.cellWidth]).toEqual(['none', '', 8]);
  project.undo();
  await nextTick();
  expect([project.sauceLetterSpacing, project.drawingFont.cellWidth]).toEqual(['9', 9]);
  project.undo();
  await nextTick();
  expect([project.sauceLetterSpacing, project.drawingFont.cellWidth]).toEqual(['', 8]); // a new drawing's, unchosen
});

test('with a bitmap font drawn narrow, Not set leaves narrow in one undo step', async () => {
  const { project } = await mount();
  await project.setDrawingFont({ ...SLIM(), width: 7 });
  await pick(0);
  expect([project.sauceLetterSpacing, project.fontWidth, project.drawingFont.cellWidth]).toEqual(['none', '', 8]);
  project.undo();
  await nextTick();
  expect([project.fontWidth, project.drawingFont.cellWidth]).toEqual(['7', 7]);
});

test('iCE colors is a checkbox in a 16-color drawing, on for a new one; in any other it\'s off with a note, and keeps its value', async () => {
  const { project } = await mount(({ project }) => { project.quantize = 'cga'; });
  const box = field('sauce-ice'), help = () => host.querySelector('#sauce-ice-help').textContent;
  expect([box.checked, box.disabled, project.sauceIceColors]).toEqual([true, false, true]);
  expect(help()).toBe('On: bright backgrounds. Off: they blink, as on DOS.');
  box.click();
  await nextTick();
  expect(project.sauceIceColors).toBe(false);
  project.quantize = 'vga';
  await nextTick();
  expect([box.checked, box.disabled, help()]).toEqual([false, true, 'Only for 16-color drawings.']);
  project.quantize = 'palette';
  project.palette = Array.from({ length: 16 }, (_, i) => `#${i.toString(16).repeat(6)}`).join(' '); // a list of 16, as an XBin's own
  await nextTick();
  expect([box.checked, box.disabled]).toEqual([false, false]);
});

test('turning iCE colors off where the system asks for reduced motion says the ANSI view won\'t blink; elsewhere, or turned on, nothing', async () => {
  let motion = reducedMotion(false);
  try {
    await mount(({ project }) => { project.quantize = 'cga'; });
    const box = field('sauce-ice');
    closeToast();
    box.click(); // off, with motion
    await nextTick();
    expect(toastMessage.value).toBeFalsy();
    box.click(); // on again
    motion.mockRestore();
    motion = reducedMotion(true);
    box.click(); // off, with reduced motion
    await nextTick();
    expect(toastMessage.value).toBe('Your system asks for reduced motion, so Phosphor shows blinking cells without blinking: dark backgrounds, letters steady. Exported .ans and .xb files still blink.');
    closeToast();
    box.click(); // on: nothing to say
    await nextTick();
    expect(toastMessage.value).toBeFalsy();
  } finally {
    motion.mockRestore();
    closeToast();
  }
});
