// The color layer's Palettes page (docs/layers.md), laid out as the Fonts page: This drawing, Favorites and Library in one
// list searched by name or author, the chosen palette on the right. Use makes a palette the drawing's Custom color list,
// Put back undoes every Use since the layer opened, ☆ Favorite keeps a palette, Save .hex saves one, Use and Put back are
// off while the settings are locked, and Get from Lospec, with fetch stubbed: nothing asked until it's pressed, the
// palette kept under Favorites and chosen, or what went wrong under the field.
import { afterEach, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { i18n } from '@/i18n';
import ColorLayer from '@/components/ColorLayer.vue';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { SHIPPED, useColorLibraryStore } from '@/store/ColorLibraryStore';
import { PALETTES } from '@/lib/ColorUtils';
import { listColors } from '@/lib/colorList';
import { closeToast, toastAction, toastMessage } from '@/composables/useToast';
import { getPalette } from '@/lib/lospec';
import '@/assets/global.css';

vi.mock('@/lib/lospec', { spy: true }); // the real one, but one test makes it fail in a way it can't today

let app, host, project, workspace, library;
afterEach(() => {
  project?.stopSharing();
  app?.unmount();
  host?.remove();
  app = host = project = workspace = library = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// The layer opened on Palettes (as the settings column's Palettes link opens it), over a blank canvas, or with no
// drawing over the start screen's anchor; mounted while the color box is open, as EditToolbar and EditWorkspace mount it.
const mount = async ({ quantize = 'cga', palette = '', drawing = true, picture } = {}) => {
  const made = await createTestApp();
  ({ project, workspace } = made);
  library = useColorLibraryStore();
  if (picture) await loadImage(project, picture, { cols: 20, rows: 10 });
  else if (drawing) await project.setBlankCanvas({ cols: 20, rows: 10 });
  project.quantize = quantize;
  project.palette = palette;
  if (drawing) await settle(project);
  workspace.openColors('fg', 'palettes');
  host = document.body.appendChild(document.createElement('div'));
  app = createApp({ render: () => (workspace.colorBox ? h(ColorLayer) : null) }).use(made.pinia).use(i18n);
  app.mount(host);
  await nextTick();
  await nextTick();
};

const layer = () => document.querySelector('.color-layer');
const page = () => layer().querySelector('div.page.colors-palettes');
const nameOf = (row) => row.querySelector('div.name > span').textContent;
// The list as { group label: [row names] }, in order.
const listed = () => {
  const groups = {};
  let at;
  for (const el of page().querySelector('div.list').children) {
    if (el.matches('div.group')) groups[at = el.querySelector('span.label').textContent] = [];
    else if (el.matches('div.row')) groups[at].push(nameOf(el));
  }
  return groups;
};
const groupRows = (label) => {
  const out = [];
  let inside = false;
  for (const el of page().querySelector('div.list').children) {
    if (el.matches('div.group')) inside = el.querySelector('span.label').textContent.startsWith(label);
    else if (inside && el.matches('div.row')) out.push(el);
  }
  return out;
};
const row = (name, group = 'Library') => groupRows(group).find((r) => nameOf(r) === name);
const details = () => page().querySelector('div.edit-side');
const title = () => details().querySelector('div.head span.title').textContent;
const meta = () => details().querySelector('div.head span.meta')?.textContent;
const action = (name) => details().querySelector(`div.actions .${name}`);
const swatches = () => [...details().querySelectorAll('div.swatches > div.swatch')];
const press = async (el) => { el.click(); await nextTick(); await nextTick(); };
const choose = (name, group) => press(row(name, group));
const key = async (k) => {
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  await nextTick();
};
const search = async (words) => {
  const field = page().querySelector('div.top input[type=search]');
  field.value = words;
  field.dispatchEvent(new Event('input'));
  await nextTick();
};
// Focus on something of the layer's that's still there and on, so keys stay the layer's rather than the page's.
const focusKept = () => layer().contains(document.activeElement) && !document.activeElement.disabled;
const SWEETIE = SHIPPED.find((p) => p.slug === 'sweetie-16');

test('the list: This drawing, Favorites and Library with their counts; search narrows Favorites and Library, never This drawing', async () => {
  await mount();
  expect(listed()).toEqual({ 'This drawing': ['CGA (16 colors)'], 'Favorites · 0': [], 'Library · 29': SHIPPED.map((p) => p.name) });
  expect(page().querySelector('p.empty').textContent).toBe('Nothing kept yet. ☆ Favorite on a palette keeps it here.');
  expect(row('CGA (16 colors)', 'This drawing').querySelectorAll('div.strip > i')).toHaveLength(16);
  const sweetie = row('Sweetie 16');
  const strip = [...sweetie.querySelectorAll('div.strip > i')];
  expect(strip).toHaveLength(16);
  expect(strip[0].style.background).toBe('rgb(26, 28, 44)');
  expect(sweetie.querySelector('div.name > em').textContent).toBe(''); // Lospec names no author
  expect(row('Endesga 16').querySelector('div.name > em').textContent).toBe('ENDESGA');

  library.toggle(SHIPPED.find((p) => p.name === 'Lost Century'));
  library.toggle(SWEETIE);
  await nextTick();
  expect(listed()['Favorites · 2']).toEqual(['Sweetie 16', 'Lost Century']); // newest first
  expect(page().querySelector('p.empty')).toBe(null);

  await search('SURREAL');
  expect(listed()).toEqual({ 'This drawing': ['CGA (16 colors)'], 'Favorites · 2': ['Lost Century'], 'Library · 29': ['Lost Century', 'Fading 16'] });
  await search('century');
  expect(listed()['Favorites · 2']).toEqual(['Lost Century']);
  await search('zzz');
  expect(listed()).toEqual({ 'This drawing': ['CGA (16 colors)'], 'Favorites · 2': [], 'Library · 29': [] });
  expect(page().querySelector('p.none').textContent).toBe('No palettes match.');
});

test('its fields suit a phone\'s keyboard: no capitals, no corrections, and a key that says what Enter does', async () => {
  await mount();
  const attrs = (el) => ['autocapitalize', 'autocorrect', 'spellcheck', 'enterkeyhint'].map((name) => el.getAttribute(name));
  expect(attrs(page().querySelector('input[type=search]'))).toEqual(['off', 'off', 'false', 'search']);
  expect(attrs(page().querySelector('input.get-name'))).toEqual(['off', 'off', 'false', 'go']);
});

test('choosing a row shows its palette and uses nothing; Up and Down walk the rows', async () => {
  await mount();
  expect(title()).toBe('CGA (16 colors)'); // This drawing, chosen as it opens
  expect(row('CGA (16 colors)', 'This drawing').classList.contains('current')).toBe(true);
  await choose('Sweetie 16');
  expect(title()).toBe('Sweetie 16');
  expect(row('Sweetie 16').classList.contains('current')).toBe(true);
  expect([project.quantize, project.palette]).toEqual(['cga', '']);
  layer().focus();
  await key('ArrowDown');
  expect(title()).toBe(SHIPPED[SHIPPED.indexOf(SWEETIE) + 1].name);
  await key('ArrowUp');
  await key('ArrowUp'); // Favorites is empty: back to This drawing
  expect(title()).toBe('CGA (16 colors)');
  await key('ArrowUp'); // and no further
  expect(title()).toBe('CGA (16 colors)');

  // Far down the list, the chosen row is scrolled into view.
  for (let i = 0; i < 25; i++) await key('ArrowDown');
  await nextTick();
  const list = page().querySelector('div.list').getBoundingClientRect(), current = page().querySelector('div.row.current').getBoundingClientRect();
  expect(current.top).toBeGreaterThanOrEqual(list.top - 1);
  expect(current.bottom).toBeLessThanOrEqual(list.bottom + 1);
  expect([project.quantize, project.palette]).toEqual(['cga', '']);
});

test('a favorite from the Library is two rows: Down from its Library row goes on down the Library', async () => {
  await mount();
  library.toggle(SWEETIE);
  await nextTick();
  await choose('Sweetie 16', 'Library');
  layer().focus();
  await key('ArrowDown');
  expect(title()).toBe(SHIPPED[SHIPPED.indexOf(SWEETIE) + 1].name);
  await choose('Sweetie 16', 'Favorites');
  await key('ArrowUp');
  expect(title()).toBe('CGA (16 colors)');
});

test('a palette\'s details: name, colors and author or on Lospec, its swatches with hex, On Lospec opening a new tab', async () => {
  await mount();
  await choose('Sweetie 16');
  expect(title()).toBe('Sweetie 16');
  expect(meta()).toBe('16 colors · on Lospec');
  expect([...details().querySelectorAll('div.actions > *')].map((el) => el.textContent.trim())).toEqual(['Use this palette', '☆ Favorite', 'Save .hex', 'On Lospec (opens in a new tab)']);
  const link = action('lospec');
  expect([link.tagName, link.href, link.target, link.rel]).toEqual(['A', 'https://lospec.com/palette-list/sweetie-16', '_blank', 'noopener noreferrer']);
  expect(link.querySelector('svg.arrow-icon').getAttribute('width')).toBe('12');
  expect(link.querySelector('.visually-hidden').textContent).toBe(' (opens in a new tab)');
  expect(swatches()).toHaveLength(16);
  expect(swatches()[0].querySelector('i').style.background).toBe('rgb(26, 28, 44)');
  expect(swatches()[0].querySelector('span').textContent).toBe('#1a1c2c');
  expect(details().querySelector('p.use-note').textContent).toBe("Using this palette replaces this drawing's Custom color list.");
  await choose('Endesga 16');
  expect(meta()).toBe('16 colors · by ENDESGA');
});

test('Use this palette makes it the Custom color list; its own button then says In use', async () => {
  await mount();
  await choose('Sweetie 16');
  const button = action('use');
  button.focus();
  await press(button);
  await nextTick();
  expect(focusKept()).toBe(true);
  expect(project.quantize).toBe('palette');
  expect(project.palette).toBe(SWEETIE.colors.join(' '));
  expect([action('use').textContent, action('use').disabled]).toEqual(['In use', true]);
  expect(listed()['This drawing']).toEqual(['Custom color list']);
  expect(row('Custom color list', 'This drawing').querySelectorAll('div.strip > i')).toHaveLength(16);
  await choose('Endesga 16');
  expect([action('use').textContent, action('use').disabled]).toEqual(['Use this palette', false]);
  expect(layer()).not.toBe(null); // it stays open
});

test('Put back after several Uses brings back the choice and list from before the first', async () => {
  await mount({ quantize: 'cga', palette: '#111111 #222222' });
  expect(details().querySelector('p.put-back')).toBe(null);
  await choose('Sweetie 16');
  await press(action('use'));
  await choose('Endesga 16');
  await press(action('use'));
  const line = details().querySelector('p.put-back');
  expect(line.textContent).toContain("This drawing's colors were replaced.");
  await choose('Custom color list', 'This drawing');
  const back = details().querySelector('p.put-back > button');
  back.focus();
  await press(back);
  expect([project.quantize, project.palette]).toEqual(['cga', '#111111 #222222']);
  expect(details().querySelector('p.put-back')).toBe(null);
  await nextTick();
  expect(focusKept()).toBe(true);
});

test('Put back outlasts a visit to the Colors page, and is forgotten when the layer closes', async () => {
  await mount({ quantize: 'cga', palette: '#111111' });
  await choose('Sweetie 16');
  await press(action('use'));
  const tab = (name) => [...layer().querySelectorAll('[role=tab]')].find((el) => el.textContent.trim() === name);
  await press(tab('Colors'));
  expect(layer().querySelector('.colors-palettes')).toBe(null);
  await press(tab('Palettes'));
  expect(details().querySelector('p.put-back')).not.toBe(null);
  expect(title()).toBe('Sweetie 16'); // where it was left, as the search would be
  layer().focus();
  await key('ArrowDown'); // the arrow keys still reach the page kept
  expect(title()).toBe(SHIPPED[SHIPPED.indexOf(SWEETIE) + 1].name);
  workspace.colorBox = null;
  await nextTick();
  workspace.openColors('fg', 'palettes');
  await nextTick();
  expect(details().querySelector('p.put-back')).toBe(null);
  expect(title()).toBe('Custom color list');
});

// Another drawing replacing this one while the toolbar stays mounted (the document id changes under the open layer) is
// another drawing: Put back would write the first one's choice and list onto it.
test('Put back is forgotten when another drawing opens', async () => {
  await mount({ quantize: 'cga', palette: '#111111 #222222' });
  await choose('Sweetie 16');
  await press(action('use'));
  expect(details().querySelector('p.put-back')).not.toBe(null);
  project.documentId = 'another';
  project.quantize = 'vga';
  await nextTick();
  expect(details().querySelector('p.put-back')).toBe(null);
  expect(project.palette).toBe(SWEETIE.colors.join(' '));
  expect(listed()['This drawing']).toEqual(['VGA (256 colors)']); // the drawing open now
});

test('☆ Favorite keeps it under Favorites, newest first; pressed again takes it out', async () => {
  await mount();
  await choose('Sweetie 16');
  expect(action('star').getAttribute('aria-pressed')).toBe('false');
  await press(action('star'));
  expect(action('star').getAttribute('aria-pressed')).toBe('true');
  expect(action('star').textContent.trim()).toBe('★ Favorite');
  expect(listed()['Favorites · 1']).toEqual(['Sweetie 16']);
  await choose('Lost Century');
  await press(action('star'));
  expect(listed()['Favorites · 2']).toEqual(['Lost Century', 'Sweetie 16']);
  const star = action('star');
  star.focus();
  await press(star);
  expect(listed()['Favorites · 1']).toEqual(['Sweetie 16']);
  expect(title()).toBe('Lost Century'); // still in the Library
  expect(focusKept()).toBe(true);
});

test('a palette got from Lospec and taken out of Favorites is gone: This drawing shows, and the keys stay in the layer', async () => {
  await mount();
  library.keep({ slug: 'lospec-five', name: 'Lospec Five', author: '', colors: ['#000000', '#ffffff'] });
  await nextTick();
  await choose('Lospec Five', 'Favorites');
  action('star').focus();
  await press(action('star'));
  await nextTick();
  expect(listed()['Favorites · 0']).toEqual([]);
  expect(title()).toBe('CGA (16 colors)');
  expect(row('CGA (16 colors)', 'This drawing').classList.contains('current')).toBe(true);
  expect(focusKept()).toBe(true);
});

test('Save .hex downloads <slug>.hex', async () => {
  await mount();
  const saved = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { saved.push({ blob }); return 'blob:x'; });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { saved.at(-1).name = this.download; });
  await choose('Sweetie 16');
  await press(action('save'));
  expect(saved[0].name).toBe('sweetie-16.hex');
  const text = await saved[0].blob.text();
  expect(text.startsWith('1a1c2c\n')).toBe(true);
  expect(text.split('\n')).toHaveLength(17);
});

test('Use and Put back are off while the settings are locked, and when a lock arrives', async () => {
  await mount({ quantize: 'cga', palette: '#111111' });
  expect(details().querySelector('p.locked')).toBe(null);
  await choose('Sweetie 16');
  await press(action('use'));
  await choose('Endesga 16');
  project.startSharing({ send: () => {}, role: 'artist', me: 'ann' }); // only the host's now
  await nextTick();
  const reason = i18n.global.t('social.drawing.onlyHost');
  for (const button of [action('use'), details().querySelector('p.put-back > button')]) {
    expect(button.disabled).toBe(true);
    expect(button.title).toBe(reason);
    expect(button.hasAttribute('data-off-reason')).toBe(true);
  }
  expect([...details().querySelectorAll('p.locked')].map((p) => p.textContent)).toEqual([reason]); // said once
  for (const name of ['star', 'save']) expect(action(name).disabled).toBe(false); // they change nothing of the drawing
  expect(page().querySelector('input[type=search]').disabled).toBe(false);
  expect(page().querySelector('form.get button[type=submit]').disabled).toBe(false);
  await press(action('use'));
  expect(project.palette).toBe(SWEETIE.colors.join(' '));
});

test('This drawing shows VGA\'s colors and Full color\'s note', async () => {
  await mount({ quantize: 'vga' });
  expect(title()).toBe('VGA (256 colors)');
  expect(meta()).toBe('256 colors');
  expect(swatches()).toHaveLength(256);
  expect(swatches()[1].querySelector('span').textContent).toBe('#aa0000');
  expect(row('VGA (256 colors)', 'This drawing').querySelectorAll('div.strip > i')).toHaveLength(256);
  expect([...details().querySelectorAll('div.actions button')].map((b) => b.className)).toEqual(['ghost edit']); // Edit as a Custom color list only
  expect(getComputedStyle(details()).overflowY).toBe('auto'); // 256 swatches scroll inside the details
  project.quantize = 'none';
  await nextTick();
  expect(title()).toBe('Full color (24-bit)');
  expect(meta()).toBe(undefined);
  expect(swatches()).toHaveLength(0);
  expect(details().querySelector('p.full-color').textContent).toBe('Full color shows every color as it is, so it has no list of colors.');
  expect(row('Full color (24-bit)', 'This drawing').querySelector('div.strip')).toBe(null);
});

test('with no drawing the group reads New drawings: VGA shows its colors, Limited count none', async () => {
  await mount({ quantize: 'vga', drawing: false });
  expect(Object.keys(listed())[0]).toBe('New drawings');
  expect(title()).toBe('VGA (256 colors)');
  expect(swatches()).toHaveLength(256);
  project.quantize = 'count';
  await nextTick();
  expect(listed()['New drawings']).toEqual(['Limited count']);
  expect(row('Limited count', 'New drawings').querySelector('div.strip')).toBe(null);
  expect(swatches()).toHaveLength(0);
});

test('Limited count over a picture shows its current colors', async () => {
  await mount({ quantize: 'count', picture: '/tests/fixtures/images/gradient.png' });
  const colors = project.activePalette.map((p) => p.hex.toLowerCase());
  expect(colors.length).toBeGreaterThan(1);
  expect(title()).toBe('Limited count');
  expect(meta()).toBe(`${colors.length} colors`);
  expect(swatches().map((swatch) => swatch.querySelector('span').textContent)).toEqual(colors);
  expect(row('Limited count', 'This drawing').querySelectorAll('div.strip > i')).toHaveLength(colors.length);
});

test('with no drawing the Colors page shows too, and Escape there closes the layer', async () => {
  await mount({ drawing: false });
  [...layer().querySelectorAll('[role=tab]')].find((tab) => tab.textContent.trim() === 'Colors').click();
  await nextTick();
  expect(layer().querySelector('.color-popover')).not.toBe(null);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await nextTick();
  expect(workspace.colorBox).toBe(null);
  expect(layer()).toBe(null);
});

test('opening on Palettes it is the big size; Colors narrows it back', async () => {
  await mount();
  const tabs = () => [...layer().querySelectorAll('[role=tab]')];
  expect(tabs().map((tab) => [tab.textContent.trim(), tab.getAttribute('aria-selected')])).toEqual([['Colors', 'false'], ['Palettes', 'true']]);
  expect(layer().classList.contains('editing')).toBe(true);
  await press(tabs()[0]);
  expect(workspace.colorLayerPage).toBe('colors');
  expect(layer().classList.contains('editing')).toBe(false);
  expect(layer().querySelector('.color-popover')).not.toBe(null);
  expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false']);
  await press(tabs()[1]);
  expect(layer().classList.contains('editing')).toBe(true);
  expect(layer().querySelector('.color-popover')).toBe(null);
});

test('Escape in the search clears or blurs it and the layer stays; Escape again closes it', async () => {
  await mount();
  for (const selector of ['div.top input[type=search]', 'input.get-name']) {
    const field = page().querySelector(selector);
    await userEvent.click(field);
    await userEvent.keyboard('sweet');
    await userEvent.keyboard('{Escape}');
    expect(workspace.colorBox).toBe('fg');
    expect(document.activeElement !== field || field.value === '').toBe(true);
    expect(layer().contains(document.activeElement)).toBe(true); // the keys stay the layer's
  }
  await userEvent.keyboard('{Escape}');
  expect(workspace.colorBox).toBe(null);
  expect(layer()).toBe(null);
});

// fetch stubbed with a fresh answer each call (a body reads once).
const stubFetch = (answer) => {
  const fetch = vi.fn(async () => answer());
  vi.stubGlobal('fetch', fetch);
  return fetch;
};
const answer = (data, status = 200) => () => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const SWEETIE_ANSWER = answer({ name: 'Sweetie 16', author: '', colors: SWEETIE.colors.map((c) => c.slice(1)) });
const getForm = () => page().querySelector('form.get');
const problem = () => page().querySelector('p.get-problem');
// Type into Get's field and submit the form, as Enter or the button does.
const get = async (typed) => {
  const field = getForm().querySelector('input.get-name');
  field.value = typed;
  field.dispatchEvent(new Event('input'));
  getForm().querySelector('button[type=submit]').click();
  await nextTick();
};

test('opening the page, browsing, starring and using ask nothing of Lospec', async () => {
  const fetch = stubFetch(SWEETIE_ANSWER);
  await mount();
  await search('sweetie');
  await choose('Sweetie 16');
  await press(action('star'));
  await press(action('use'));
  await search('');
  expect(getForm()).not.toBe(null);
  expect(fetch).not.toHaveBeenCalled();
});

test('Get asks nothing until pressed, then keeps the palette and chooses it', async () => {
  const fetch = stubFetch(answer({ name: 'Lospec Five', author: 'Someone', colors: ['000000', '111111', '222222', '333333', 'FFFFFF'] }));
  await mount();
  library.toggle(SHIPPED.find((p) => p.name === 'Endesga 16'));
  await nextTick();
  const form = getForm();
  expect(form.querySelector('span').textContent).toBe('Not here?');
  const field = form.querySelector('input.get-name[type=text]');
  expect(field.placeholder).toBe("A palette's name or lospec.com link");
  expect(form.querySelector('button[type=submit]').textContent).toBe('Get from Lospec');
  expect(fetch).not.toHaveBeenCalled();
  await search('endesga'); // a search that would hide what's got is cleared
  field.focus();
  await get('Lospec Five');
  expect(form.querySelector('button[type=submit]').textContent).toBe('Getting…');
  await vi.waitFor(() => expect(title()).toBe('Lospec Five'));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('https://lospec.com/palette-list/lospec-five.json');
  expect(listed()['Favorites · 2']).toEqual(['Lospec Five', 'Endesga 16']);
  expect(row('Lospec Five', 'Favorites').classList.contains('current')).toBe(true);
  expect(meta()).toBe('5 colors · by Someone');
  expect(page().querySelector('input[type=search]').value).toBe('');
  expect(field.value).toBe('');
  expect(problem()).toBe(null);
  expect(page().querySelector('p.get-note')).toBe(null);
  expect([project.quantize, project.palette]).toEqual(['cga', '']); // kept, not used
  await nextTick();
  expect(focusKept()).toBe(true);
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
});

test('a palette Lospec doesn\'t have, Lospec out of reach and an answer that isn\'t a palette each say so under the field, and nothing is kept', async () => {
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
    expect(getForm().nextElementSibling).toBe(problem()); // under the field
    expect(getForm().querySelector('button[type=submit]').textContent).toBe('Get from Lospec');
    expect(getForm().querySelector('input.get-name').value).toBe('https://lospec.com/palette-list/sweetie-17'); // kept, to try again
    expect(Object.keys(listed())).toContain('Favorites · 0');
  }
  stubFetch(SWEETIE_ANSWER);
  await get('sweetie 16');
  await vi.waitFor(() => expect(title()).toBe('Sweetie 16'));
  expect(problem()).toBe(null); // gone once a Get works
});

test('a failure Get doesn\'t know reads as Lospec out of reach, never as a raw key', async () => {
  vi.mocked(getPalette).mockRejectedValueOnce(new Error('changed'));
  await mount();
  await get('sweetie 17');
  await vi.waitFor(() => expect(problem()?.textContent).toBe("Couldn't get sweetie-17 from Lospec. Check its name or link, or try again."));
  expect(Object.keys(listed())).toContain('Favorites · 0');
});

test('a palette of 300 colors is kept as its first 256, and says so', async () => {
  const colors = Array.from({ length: 300 }, (_, i) => i.toString(16).padStart(6, '0'));
  stubFetch(answer({ name: 'Big', author: '', colors }));
  await mount();
  await get('big');
  await vi.waitFor(() => expect(title()).toBe('Big'));
  expect(meta()).toBe('256 colors · on Lospec');
  expect(row('Big', 'Favorites').querySelectorAll('div.strip > i')).toHaveLength(256);
  expect(page().querySelector('p.get-note').textContent).toBe('Kept the first 256 of its 300 colors.');
  await press(action('star')); // taken out, the note goes with it
  expect(page().querySelector('p.get-note')).toBe(null);
});

test('Get works while the settings are locked, since it changes nothing of the drawing', async () => {
  stubFetch(SWEETIE_ANSWER);
  await mount({ quantize: 'cga', palette: '#111111' });
  project.startSharing({ send: () => {}, role: 'artist', me: 'ann' }); // only the host's now
  await nextTick();
  getForm().querySelector('input.get-name').focus();
  await get('Sweetie 16');
  await vi.waitFor(() => expect(title()).toBe('Sweetie 16'));
  expect(listed()['Favorites · 1']).toEqual(['Sweetie 16']);
  expect(action('use').disabled).toBe(true);
  expect([project.quantize, project.palette]).toEqual(['cga', '#111111']);
  await nextTick();
  expect(focusKept()).toBe(true);
});

// This drawing with the Custom color list chosen is the list's editor (ColorList); with any other choice it shows the
// colors and Edit as a Custom color list makes them the list.
const editor = () => details().querySelector('div.color-list');
const hexField = () => editor().querySelector('input#palette');
const typeHex = async (text, k = 'Enter') => {
  hexField().focus();
  hexField().value = text;
  hexField().dispatchEvent(new Event('input', { bubbles: true }));
  await key(k);
};

test('with a Custom color list, This drawing is the editor; its edits write the list', async () => {
  await mount({ quantize: 'palette', palette: '#FFFFFF #000000' });
  expect(title()).toBe('Custom color list');
  expect(meta()).toBe('2 colors');
  expect(editor().querySelectorAll('div.swatches button.swatch')).toHaveLength(2);
  expect(hexField().value).toBe('#ffffff');
  expect(details().querySelector('div.actions button.import').textContent).toBe('Import .hex');
  expect(details().querySelector('.actions .edit')).toBe(null);
  await typeHex('#00ff00');
  expect(project.palette).toBe('#00ff00 #000000');
  expect(project.quantize).toBe('palette');
  expect(listed()['This drawing']).toEqual(['Custom color list']);
  expect(row('Custom color list', 'This drawing').querySelectorAll('div.strip > i')).toHaveLength(2);
});

test('a hand edit after a Use ends Put back', async () => {
  await mount({ quantize: 'cga', palette: '#111111' });
  await choose('Sweetie 16');
  await press(action('use'));
  await choose('Custom color list', 'This drawing');
  expect(details().querySelector('p.put-back')).not.toBe(null);
  await typeHex('#123456');
  expect(project.palette).toBe(`#123456 ${SWEETIE.colors.slice(1).join(' ')}`);
  expect(details().querySelector('p.put-back')).toBe(null);
  expect(project.quantize).toBe('palette');
});

test('Edit as a Custom color list from VGA makes VGA\'s colors the list; from Full color the kept list; Put back undoes it', async () => {
  await mount({ quantize: 'vga', palette: '#111111 #222222' });
  expect(action('edit').textContent).toBe('Edit as a Custom color list');
  expect(action('edit').disabled).toBe(false);
  await press(action('edit'));
  expect(project.quantize).toBe('palette');
  expect(listColors(project.palette)).toEqual(PALETTES.vga.map((p) => p.hex.toLowerCase()));
  expect(editor()).not.toBe(null);
  await press(details().querySelector('p.put-back > button'));
  expect([project.quantize, project.palette]).toEqual(['vga', '#111111 #222222']);

  project.quantize = 'cga';
  await nextTick();
  await press(action('edit'));
  expect(listColors(project.palette)).toEqual(PALETTES.cga.map((p) => p.hex.toLowerCase()));
  await press(details().querySelector('p.put-back > button'));

  project.quantize = 'none';
  await nextTick();
  await press(action('edit'));
  expect([project.quantize, project.palette]).toEqual(['palette', '#111111 #222222']); // the kept list, as it was
  await press(details().querySelector('p.put-back > button'));
  expect([project.quantize, project.palette]).toEqual(['none', '#111111 #222222']);
});

test('Edit as a Custom color list is off for Limited count with no picture, and for a locked drawing', async () => {
  await mount({ quantize: 'count', drawing: false });
  expect(action('edit').disabled).toBe(true);
  project.quantize = 'vga';
  await nextTick();
  expect(action('edit').disabled).toBe(false);
  project.startSharing({ send: () => {}, role: 'artist', me: 'ann' }); // only the host's now
  await nextTick();
  expect(action('edit').disabled).toBe(true);
  expect(action('edit').title).toBe(i18n.global.t('social.drawing.onlyHost'));
  await press(action('edit'));
  expect(project.quantize).toBe('vga');
});

test('the editor is off while the settings are locked, and writes nothing', async () => {
  await mount({ quantize: 'palette', palette: '#FFFFFF #000000' });
  project.startSharing({ send: () => {}, role: 'artist', me: 'ann' });
  await nextTick();
  const controls = [...editor().querySelectorAll('button, input')];
  expect(controls.length).toBeGreaterThan(8);
  expect(controls.filter((el) => !el.matches(':disabled'))).toEqual([]);
  expect([...details().querySelectorAll('p.locked')]).toHaveLength(1);
});

test('the editor\'s import toast goes when another drawing opens, so its Put back can\'t reach it', async () => {
  await mount({ quantize: 'palette', palette: '#FFFFFF #000000' });
  const input = editor().querySelector('input.hex-file'), files = new DataTransfer();
  files.items.add(new File(['1a1c2c\n5d275d\n'], 'sweetie.hex'));
  input.files = files.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(toastAction.value?.label).toBe('Put back'));
  expect(project.palette).toBe('#1a1c2c #5d275d');
  project.documentId = 'another';
  await nextTick();
  expect(toastMessage.value).toBe(null);
  closeToast();
});

test('Escape in the hex field puts back the color and the layer stays open; a second Escape closes it', async () => {
  await mount({ quantize: 'palette', palette: '#FFFFFF #000000' });
  hexField().focus();
  await userEvent.keyboard('#00FF00');
  await userEvent.keyboard('{Escape}');
  expect(hexField().value).toBe('#ffffff');
  expect(workspace.colorBox).toBe('fg');
  expect(layer().contains(document.activeElement)).toBe(true);
  hexField().blur(); // a click elsewhere
  expect(project.palette).toBe('#FFFFFF #000000'); // nothing rewritten
  layer().focus();
  await userEvent.keyboard('{Escape}');
  expect(workspace.colorBox).toBe(null);
});

test('Up and Down on a swatch of the editor stay the swatches\' and don\'t walk the page\'s rows', async () => {
  await mount({ quantize: 'palette', palette: Array.from({ length: 20 }, (_, i) => `#0000${i.toString(16).padStart(2, '0')}`).join(' ') });
  const swatch = editor().querySelector('button.swatch');
  swatch.focus();
  await key('ArrowDown');
  expect(title()).toBe('Custom color list');
  expect(editor().querySelectorAll('button.swatch')[8].getAttribute('aria-pressed')).toBe('true');
});

test('two hundred colors scroll inside the details, the actions still on screen', async () => {
  await mount({ quantize: 'palette', palette: Array.from({ length: 200 }, (_, i) => `#${(i + 1).toString(16).padStart(6, '0')}`).join(' ') });
  const grid = editor().querySelector('div.swatches');
  expect(grid.querySelectorAll('button.swatch')).toHaveLength(200);
  expect(getComputedStyle(grid).overflowY).toBe('auto');
  expect(grid.scrollHeight).toBeGreaterThan(grid.clientHeight);
  const bottom = (el) => el.getBoundingClientRect().bottom;
  for (const el of [details().querySelector('div.actions'), editor().querySelector('div.picked')]) {
    expect(bottom(el)).toBeLessThanOrEqual(innerHeight);
    expect(bottom(el)).toBeLessThanOrEqual(bottom(layer()) + 1);
  }
  expect(details().scrollHeight).toBeLessThanOrEqual(details().clientHeight + 1); // the details themselves don't scroll
});

test('a kept palette whose slug is drawing is its own row, not This drawing', async () => {
  await mount({ quantize: 'cga' });
  library.keep({ slug: 'drawing', name: 'Drawing', author: '', colors: ['#000000', '#ffffff'] });
  await nextTick();
  await choose('Drawing', 'Favorites');
  expect(title()).toBe('Drawing');
  expect(row('Drawing', 'Favorites').classList.contains('current')).toBe(true);
  expect(row('CGA (16 colors)', 'This drawing').classList.contains('current')).toBe(false);
  expect(action('use')).not.toBe(null);
});

// The editor's import toast (and its Put back) is the editor's: pressing it isn't a press outside the layer.
test('a press on a toast doesn\'t close the layer, a press elsewhere outside does', async () => {
  await mount({ quantize: 'palette', palette: '#FFFFFF #000000' });
  const toast = document.body.appendChild(document.createElement('div'));
  toast.className = 'app-toast';
  toast.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await nextTick();
  expect(workspace.colorBox).toBe('fg');
  toast.className = '';
  toast.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await nextTick();
  expect(workspace.colorBox).toBe(null);
  toast.remove();
});
