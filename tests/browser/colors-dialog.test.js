// The Colors dialog (docs/layers.md): the shipped palettes under Library and the starred ones under Favorites, as cards,
// searched by name or author; Use making a palette the drawing's Custom color list, Put back undoing every Use since the
// dialog opened, ★ keeping a palette, .hex saving one, and Use and Put back off while the settings are locked.
import { afterEach, expect, test, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { i18n } from '@/i18n';
import ColorsDialog from '@/components/ColorsDialog.vue';
import { createTestApp } from '../support/app.js';
import { SHIPPED } from '@/store/ColorLibraryStore';
import '@/assets/global.css';

let app, host, project;
afterEach(() => {
  project?.stopSharing();
  app?.unmount();
  host?.remove();
  app = host = project = null;
  vi.restoreAllMocks();
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
