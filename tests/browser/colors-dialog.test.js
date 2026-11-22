// The Colors dialog (docs/layers.md): the shipped palettes under Library and the starred ones under Favorites, as cards,
// searched by name or author; Use making a palette the drawing's Custom color list, Put back undoing every Use since the
// dialog opened, ★ keeping a palette, .hex saving one, Use and Put back off while the settings are locked, and Get from
// Lospec, with fetch stubbed: nothing asked until it's pressed, the palette kept under Favorites, or what went wrong.
import { afterEach, expect, test, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { i18n } from '@/i18n';
import ColorsDialog from '@/components/ColorsDialog.vue';
import { createTestApp } from '../support/app.js';
import { SHIPPED } from '@/store/ColorLibraryStore';
import { getPalette } from '@/lib/lospec';
import '@/assets/global.css';

vi.mock('@/lib/lospec', { spy: true }); // the real one, but one test makes it fail in a way it can't today

let app, host, project;
afterEach(() => {
  project?.stopSharing();
  app?.unmount();
  host?.remove();
  app = host = project = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const mount = async ({ quantize = 'cga', palette = '' } = {}) => {
  const made = await createTestApp();
  project = made.project;
  await project.setBlankCanvas({ cols: 20, rows: 10 });
  project.quantize = quantize;
  project.palette = palette;
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(ColorsDialog).use(made.pinia).use(i18n);
  app.mount(host);
  await nextTick();
  return project;
};

const dialog = () => document.querySelector('dialog');
const cards = () => [...dialog().querySelectorAll('ul.cards > li.card')];
const card = (name) => cards().find((li) => li.querySelector('a.name').textContent === name);
const names = () => cards().map((li) => li.querySelector('a.name').textContent);
const tab = (key) => document.getElementById(`colors-tab-${key}`);
const show = async (key) => { tab(key).click(); await nextTick(); };
const press = async (button) => { button.click(); await nextTick(); };
const search = async (words) => {
  const field = dialog().querySelector('input[type=search]');
  field.value = words;
  field.dispatchEvent(new Event('input'));
  await nextTick();
};
// Focus on something of the dialog's that's still there and on, so keys stay the dialog's rather than the page's.
const focusKept = () => dialog().contains(document.activeElement) && !document.activeElement.disabled;
const SWEETIE = SHIPPED.find((p) => p.slug === 'sweetie-16');

test('Library lists the shipped palettes: colors, name linking to its Lospec page, author or "on Lospec", and how many colors', async () => {
  await mount();
  expect(dialog().getAttribute('aria-label')).toBe('Color palettes');
  expect(tab('library').getAttribute('aria-selected')).toBe('true');
  const panel = dialog().querySelector('#colors-panel-library[role=tabpanel]');
  expect(panel.getAttribute('aria-labelledby')).toBe('colors-tab-library');
  expect(panel.querySelector('p.intro').textContent).toBe("Sixteen-color palettes from Lospec, each by its author. Using one replaces this drawing's Custom color list.");
  expect(cards()).toHaveLength(29);
  const sweetie = card('Sweetie 16');
  const band = [...sweetie.querySelectorAll('div.art > i')];
  expect(band).toHaveLength(16);
  expect(band[0].style.background).toBe('rgb(26, 28, 44)');
  const link = sweetie.querySelector('a.name');
  expect([link.href, link.target, link.rel]).toEqual(['https://lospec.com/palette-list/sweetie-16', '_blank', 'noopener noreferrer']);
  expect(sweetie.querySelector('span.author').textContent).toBe('on Lospec');
  expect(sweetie.querySelector('div.foot > span').textContent).toBe('16 colors');
  expect(sweetie.querySelector('button.hex').getAttribute('aria-label')).toBe('Save Sweetie 16 as a .hex file');
  expect(sweetie.querySelector('button.star').getAttribute('aria-label')).toBe('Favorite Sweetie 16');
  expect(card('Endesga 16').querySelector('span.author').textContent).toBe('by ENDESGA');
});

test('the search narrows by name or author on both tabs', async () => {
  await mount();
  await search('SURREAL');
  expect(names()).toEqual(['Lost Century', 'Fading 16']);
  await search('zzz');
  expect(cards()).toHaveLength(0);
  expect(dialog().querySelector('p.none').textContent).toBe('No palettes match.');
  await search('');
  await press(card('Lost Century').querySelector('button.star'));
  await press(card('Sweetie 16').querySelector('button.star'));
  await show('favorites');
  expect(names()).toEqual(['Sweetie 16', 'Lost Century']); // newest first
  await search('century');
  expect(names()).toEqual(['Lost Century']);
  await search('zzz');
  expect(dialog().querySelector('p.none').textContent).toBe('No palettes match.');
});

test('Use makes the palette this drawing\'s Custom color list and its card says In use', async () => {
  await mount();
  const button = card('Sweetie 16').querySelector('button.use');
  button.focus();
  await press(button);
  await nextTick();
  expect(focusKept()).toBe(true);
  expect(project.quantize).toBe('palette');
  expect(project.palette).toBe(SWEETIE.colors.join(' '));
  const use = card('Sweetie 16').querySelector('button.use');
  expect([use.textContent, use.disabled]).toEqual(['In use', true]);
  expect(cards().filter((li) => li !== card('Sweetie 16')).every((li) => li.querySelector('button.use').textContent === 'Use')).toBe(true);
  expect(dialog()).not.toBe(null); // it stays open
});

test('Put back restores the Color palette and the list as they were when the dialog opened, however many were tried', async () => {
  await mount({ quantize: 'cga', palette: '#111111 #222222' });
  expect(dialog().querySelector('p.put-back')).toBe(null);
  await press(card('Sweetie 16').querySelector('button.use'));
  await press(card('Endesga 16').querySelector('button.use'));
  const line = dialog().querySelector('p.put-back');
  expect(line.textContent).toContain("This drawing's colors were replaced.");
  await show('favorites');
  const back = dialog().querySelector('p.put-back > button');
  back.focus();
  await press(back);
  expect([project.quantize, project.palette]).toEqual(['cga', '#111111 #222222']);
  expect(dialog().querySelector('p.put-back')).toBe(null);
  await nextTick();
  expect(focusKept()).toBe(true);
});

test('★ keeps a palette under Favorites, which counts it, and takes it out again', async () => {
  await mount();
  await show('favorites');
  expect(dialog().querySelector('#colors-panel-favorites p.intro').textContent).toBe('The palettes you starred, kept in this browser, with any you got from Lospec.');
  expect(dialog().querySelector('p.none').textContent).toBe('Nothing kept yet. ★ on a palette keeps it here.');
  await show('library');
  const star = card('Sweetie 16').querySelector('button.star');
  expect(star.getAttribute('aria-pressed')).toBe('false');
  await press(star);
  expect(star.getAttribute('aria-pressed')).toBe('true');
  expect(tab('favorites').querySelector('.count').textContent).toBe('1');
  await show('favorites');
  expect(names()).toEqual(['Sweetie 16']);
  const unstar = card('Sweetie 16').querySelector('button.star');
  unstar.focus();
  await press(unstar);
  expect(cards()).toHaveLength(0);
  await nextTick();
  expect(focusKept()).toBe(true);
  expect(dialog().querySelector('p.none').textContent).toBe('Nothing kept yet. ★ on a palette keeps it here.');
  expect(tab('favorites').querySelector('.count').textContent).toBe('0');
});

test('.hex saves that palette as <slug>.hex', async () => {
  await mount();
  const saved = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { saved.push({ blob }); return 'blob:x'; });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { saved.at(-1).name = this.download; });
  await press(card('Sweetie 16').querySelector('button.hex'));
  expect(saved[0].name).toBe('sweetie-16.hex');
  const text = await saved[0].blob.text();
  expect(text.startsWith('1a1c2c\n')).toBe(true);
  expect(text.split('\n')).toHaveLength(17);
});

test('a lock arriving while it is open turns Use and Put back off, with the reason', async () => {
  await mount({ quantize: 'cga', palette: '#111111' });
  await press(card('Sweetie 16').querySelector('button.use'));
  project.startSharing({ send: () => {}, role: 'artist', me: 'ann' }); // only the host's now
  await nextTick();
  const use = card('Endesga 16').querySelector('button.use'), back = dialog().querySelector('p.put-back > button');
  const reason = i18n.global.t('social.drawing.onlyHost');
  for (const button of [use, back]) {
    expect(button.disabled).toBe(true);
    expect(button.title).toBe(reason);
    expect(button.hasAttribute('data-off-reason')).toBe(true);
  }
});

// fetch stubbed with a fresh answer each call (a body reads once); `calls` holds the addresses asked.
const stubFetch = (answer) => {
  const fetch = vi.fn(async () => answer());
  vi.stubGlobal('fetch', fetch);
  return fetch;
};
const answer = (data, status = 200) => () => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const SWEETIE_ANSWER = answer({ name: 'Sweetie 16', author: '', colors: SWEETIE.colors.map((c) => c.slice(1)) });
const getForm = () => dialog().querySelector('form.get');
const problem = () => dialog().querySelector('p.get-problem');
// Type into Get's field and submit the form, as Enter or the button does.
const get = async (typed) => {
  const field = getForm().querySelector('input.get-name');
  field.value = typed;
  field.dispatchEvent(new Event('input'));
  getForm().querySelector('button[type=submit]').click();
  await nextTick();
};

test('opening the dialog, browsing, starring and using ask nothing of Lospec', async () => {
  const fetch = stubFetch(SWEETIE_ANSWER);
  await mount();
  await search('sweetie');
  await press(card('Sweetie 16').querySelector('button.star'));
  await press(card('Sweetie 16').querySelector('button.use'));
  await show('favorites');
  await search('');
  await show('library');
  expect(getForm()).not.toBe(null);
  expect(fetch).not.toHaveBeenCalled();
});

test('Get from Lospec keeps the palette under Favorites and shows it there', async () => {
  const fetch = stubFetch(answer({ name: 'Lospec Five', author: 'Someone', colors: ['000000', '111111', '222222', '333333', 'FFFFFF'] }));
  await mount();
  await press(card('Endesga 16').querySelector('button.star'));
  const form = getForm();
  expect(form.querySelector('span').textContent).toBe('Not here?');
  const field = form.querySelector('input.get-name[type=text]');
  expect(field.placeholder).toBe("A palette's name or lospec.com link");
  expect(form.querySelector('button[type=submit]').textContent).toBe('Get from Lospec');
  await search('endesga'); // a search that would hide what's got is cleared
  field.focus();
  await get('Lospec Five');
  expect(form.querySelector('button[type=submit]').textContent).toBe('Getting…');
  await vi.waitFor(() => expect(tab('favorites').getAttribute('aria-selected')).toBe('true'));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('https://lospec.com/palette-list/lospec-five.json');
  expect(names()).toEqual(['Lospec Five', 'Endesga 16']);
  expect(card('Lospec Five').querySelector('span.author').textContent).toBe('by Someone');
  expect(card('Lospec Five').querySelector('div.foot > span').textContent).toBe('5 colors');
  expect(dialog().querySelector('input[type=search]').value).toBe('');
  expect(dialog().querySelector('p.get-note')).toBe(null);
  await nextTick();
  expect(document.activeElement).toBe(card('Lospec Five').querySelector('button.use')); // the kept card's Use
  await show('library');
  expect(getForm().querySelector('input.get-name').value).toBe('');
  expect(problem()).toBe(null);
});

test('nothing typed, or only punctuation, asks nothing and says what to type', async () => {
  const fetch = stubFetch(SWEETIE_ANSWER);
  await mount();
  for (const typed of ['', '   ', '!!! ---', 'https://example.com/palette-list/sweetie-16']) {
    await get(typed);
    expect(problem().textContent).toBe("Type a palette's name or paste its lospec.com link.");
    expect(problem().getAttribute('role')).toBe('alert');
  }
  expect(fetch).not.toHaveBeenCalled();
  expect(tab('library').getAttribute('aria-selected')).toBe('true');
});

test('a palette Lospec doesn\'t have, Lospec out of reach and an answer that isn\'t a palette each say so, and nothing is kept', async () => {
  await mount();
  const cases = [
    [answer({ error: 'file not found' }, 404), 'Lospec has no palette called sweetie-17.'],
    [() => { throw new TypeError('Failed to fetch'); }, "Couldn't get sweetie-17 from Lospec. Check its name or link, or try again."],
    [() => new Response('<!DOCTYPE html><title>Lospec</title>'), "That isn't a palette Phosphor can read."],
  ];
  for (const [failure, says] of cases) {
    stubFetch(failure);
    await get('https://lospec.com/palette-list/sweetie-17');
    await vi.waitFor(() => expect(problem()?.textContent).toBe(says));
    expect(getForm().querySelector('button[type=submit]').textContent).toBe('Get from Lospec');
    expect(getForm().querySelector('input.get-name').value).toBe('https://lospec.com/palette-list/sweetie-17'); // kept, to try again
    expect(tab('library').getAttribute('aria-selected')).toBe('true');
    expect(tab('favorites').querySelector('.count').textContent).toBe('0');
  }
  stubFetch(SWEETIE_ANSWER);
  await get('sweetie 16');
  await vi.waitFor(() => expect(tab('favorites').getAttribute('aria-selected')).toBe('true'));
  await show('library');
  expect(problem()).toBe(null); // gone once a Get works
});

test('a failure Get doesn\'t know reads as Lospec out of reach, never as a raw key', async () => {
  vi.mocked(getPalette).mockRejectedValueOnce(new Error('changed'));
  await mount();
  await get('sweetie 17');
  await vi.waitFor(() => expect(problem()?.textContent).toBe("Couldn't get sweetie-17 from Lospec. Check its name or link, or try again."));
  expect(tab('favorites').querySelector('.count').textContent).toBe('0');
});

test('a palette of 300 colors is kept as its first 256, and says so', async () => {
  const colors = Array.from({ length: 300 }, (_, i) => i.toString(16).padStart(6, '0'));
  stubFetch(answer({ name: 'Big', author: '', colors }));
  await mount();
  await get('big');
  await vi.waitFor(() => expect(tab('favorites').getAttribute('aria-selected')).toBe('true'));
  expect(card('Big').querySelector('div.foot > span').textContent).toBe('256 colors');
  expect(card('Big').querySelectorAll('div.art > i')).toHaveLength(256);
  expect(dialog().querySelector('p.get-note').textContent).toBe('Kept the first 256 of its 300 colors.');
  await press(card('Big').querySelector('button.star')); // taken out, the note goes with it
  expect(dialog().querySelector('p.get-note')).toBe(null);
});

test('Get works while the settings are locked, since it changes nothing of the drawing, and focus stays in the dialog', async () => {
  stubFetch(SWEETIE_ANSWER);
  await mount({ quantize: 'cga', palette: '#111111' });
  project.startSharing({ send: () => {}, role: 'artist', me: 'ann' }); // only the host's now
  await nextTick();
  getForm().querySelector('input.get-name').focus();
  await get('Sweetie 16');
  await vi.waitFor(() => expect(tab('favorites').getAttribute('aria-selected')).toBe('true'));
  expect(names()).toEqual(['Sweetie 16']);
  expect(card('Sweetie 16').querySelector('button.use').disabled).toBe(true);
  expect([project.quantize, project.palette]).toEqual(['cga', '#111111']);
  await nextTick();
  expect(focusKept()).toBe(true); // Use is off, so not there
});

// A window that browsed on the start screen and then opened a file (the desktop app's menu) is another drawing: Put
// back would write the first one's choice and list onto it.
test('what Put back would bring back is forgotten when another drawing opens', async () => {
  await mount({ quantize: 'cga', palette: '#111111 #222222' });
  await press(card('Sweetie 16').querySelector('button.use'));
  expect(dialog().querySelector('p.put-back')).not.toBe(null);
  project.documentId = 'another';
  await nextTick();
  expect(dialog().querySelector('p.put-back')).toBe(null);
  expect([project.quantize, project.palette]).toEqual(['palette', SWEETIE.colors.join(' ')]);
});

test('a Get that fails after a switch to Favorites shows Library, where its message is', async () => {
  let fail;
  vi.stubGlobal('fetch', vi.fn(() => new Promise((_, reject) => { fail = reject; })));
  await mount();
  await press(card('Endesga 16').querySelector('button.star'));
  await get('sweetie 17');
  await show('favorites');
  card('Endesga 16').querySelector('button.use').focus();
  fail(new TypeError('Failed to fetch'));
  await vi.waitFor(() => expect(tab('library').getAttribute('aria-selected')).toBe('true'));
  expect(problem().textContent).toBe("Couldn't get sweetie-17 from Lospec. Check its name or link, or try again.");
  await nextTick();
  expect(focusKept()).toBe(true);
});
