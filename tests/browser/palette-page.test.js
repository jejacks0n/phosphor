// The palette layer's Palettes page: the drawing's font's palettes first, a palette's font shown and changed,
// palettes for fonts not loaded, and palette files in and out.
import { test, expect, vi, afterEach, onTestFinished } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import CharPaletteLayer from '@/components/CharPaletteLayer.vue';
import { createTestApp } from '../support/app.js';
import { usePaletteStore } from '@/store/PaletteStore.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { fontId, CP437_BLOCKS } from '@/lib/BitmapFont.js';
import { readPaletteFile, writePaletteFile } from '@/lib/PaletteFile.js';
import { toastMessage } from '@/composables/useToast.js';

const fontA = () => ({ name: 'A', height: 8, bytes: new Uint8Array(2048).fill(1), blocks: CP437_BLOCKS }); // no block can be found in these bytes, so they're given
let app = null, host = null;

afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
  vi.restoreAllMocks();
  localStorage.removeItem('phosphor.charPaletteGroups'); // the folds, remembered in this browser
});

// The layer mounted over a blank canvas, with font A unless font is false; setup makes palettes first.
async function mount({ font = true, setup } = {}) {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  if (font) project.setDrawingFont(fontA());
  const palettes = usePaletteStore();
  setup?.(palettes);
  host = document.body.appendChild(document.createElement('div'));
  app = createApp({ render: () => h(CharPaletteLayer) }).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  return { project, palettes };
}
const named = (palettes, name) => {
  const id = palettes.create();
  palettes.rename(id, name);
  return id;
};
const headers = () => [...host.querySelectorAll('.group .label')].map((e) => e.textContent.trim());
const group = (label) => [...host.querySelectorAll('.group')].find((g) => g.querySelector('.label').textContent.trim() === label);
const button = (text, within = host) => [...within.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const row = (name) => [...host.querySelectorAll('.row')].find((r) => r.querySelector('.name span').textContent === name);
const tieButton = () => host.querySelector('.head .tie > button');
const yours = async (text) => { // an action in Yours' … menu
  await press(group('Yours').querySelector('.more > button'));
  return button(text, group('Yours').querySelector('.menu'));
};
const moreButton = () => host.querySelector('.head .more > button');
const press = async (el) => {
  el.click();
  await nextTick();
};
const edit = async (name) => {
  await press(row(name));
  if (!host.querySelector('.edit-side')) await press(button('Edit'));
};

test('the drawing\'s font\'s palettes come first', async () => {
  await mount({ setup: (p) => named(p, 'Frogs') });
  expect(host.querySelector('button.dismiss')).toBeNull(); // the narrow list closes by a press outside it
  expect(headers()).toEqual(['For A', 'Built-in', 'Yours']);
  expect(row('Frogs')).toBeTruthy();
  app.unmount();
  host.remove();
  await mount({ font: false });
  expect(headers()).toEqual(['Built-in', 'Yours']);
  expect((await yours('Export')).disabled).toBe(true); // none of yours to export
});

test('+ New under the font\'s group makes a tied palette', async () => {
  const { palettes } = await mount();
  await press(button('＋ New', group('For A')));
  expect(palettes.userPalettes.at(-1).font.id).toBe(fontId(fontA()));
  await press(await yours('New palette'));
  expect(palettes.userPalettes).toHaveLength(2);
  expect(group('Yours').querySelector('.menu')).toBeNull(); // the menu shuts on its choice
  expect(palettes.userPalettes.at(-1).font).toBeNull();
});

test('each group\'s title counts the palettes the filter leaves; Built-in has no Hide; Yours\' actions are in a … menu', async () => {
  await mount({ setup: (p) => named(p, 'Frogs') });
  const counts = () => [...host.querySelectorAll('.group')].map((g) => g.querySelector('.group-head').textContent.replace(/\s+/g, ' ').trim());
  expect(counts()).toEqual(['For A · 1', 'Built-in · 9', 'Yours · 0']);
  expect(button('Hide', group('Built-in'))).toBeUndefined();
  expect(button('Show', group('Built-in'))).toBeUndefined();
  expect([...group('Yours').querySelectorAll('button')].map((b) => b.textContent.trim())).toEqual(['Yours · 0', '…']);
  const filter = host.querySelector('.top input');
  expect(filter.type).toBe('search'); // its × clears it
  filter.value = 'lines';
  filter.dispatchEvent(new Event('input'));
  await nextTick();
  expect(counts()).toEqual(['For A · 0', 'Built-in · 2', 'Yours · 0']); // Single lines, Double lines
  expect([...(await yours('Import')).parentElement.querySelectorAll('button')].map((b) => b.textContent.trim())).toEqual(['New palette', 'Import', 'Export']);
  host.querySelector('.list').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await nextTick();
  expect(group('Yours').querySelector('.menu')).toBeNull(); // a press elsewhere shuts it
});

test('every group folds on its title, as the Fonts page\'s do, remembered; For fonts not loaded starts folded', async () => {
  const setup = (p) => {
    named(p, 'Frogs');
    p.tie(named(p, 'Toads'), { id: 'bitmap-deadbeef', name: 'TEST', height: 16 });
  };
  const { palettes } = await mount({ setup });
  const head = (label) => group(label).querySelector('button.group-head');
  expect(['For A', 'Built-in', 'Yours', 'For fonts not loaded'].map((label) => head(label)?.getAttribute('aria-expanded')))
    .toEqual(['true', 'true', 'true', 'false']);
  expect(head('Built-in').querySelector('svg.chevron')).toBeTruthy();
  await press(head('Built-in'));
  expect(row('Shades & blocks')).toBeUndefined();
  expect(palettes.shown.some((p) => p.builtin)).toBe(true); // folding only tidies the list: the strip still steps through them
  await press(head('For A'));
  expect(row('Frogs')).toBeUndefined(); // made with A in use, so tied to it
  await press(head('For fonts not loaded'));
  expect(row('Toads · TEST')).toBeTruthy();
  const kept = localStorage.getItem('phosphor.charPaletteGroups');
  expect(JSON.parse(kept)).toEqual(['builtin', 'tied']);
  app.unmount();
  host.remove();
  await mount({ setup: (p) => { setup(p); localStorage.setItem('phosphor.charPaletteGroups', kept); } }); // the test app starts with storage cleared
  expect(['For A', 'Built-in', 'Yours', 'For fonts not loaded'].map((label) => head(label).getAttribute('aria-expanded'))).toEqual(['false', 'false', 'true', 'true']);
});

test('the sources draw as the Fonts page\'s sheet does, and a long press shows a glyph large without picking it', async () => {
  const { palettes } = await mount();
  await press(button('Edit'));
  const glyphs = () => host.querySelectorAll('.pane .grid button.g');
  const pane = host.querySelector('.pane .grid');
  expect(getComputedStyle(glyphs()[65].querySelector('.glyph-cell')).fontSize).toBe('16px'); // an 8-line font, twice its size
  expect(getComputedStyle(pane).gridTemplateColumns.split(' ')).toHaveLength(16);
  const before = [...palettes.active.glyphs];
  const cell = glyphs()[65];
  cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await vi.waitFor(() => expect(document.querySelector('.glyph-zoom')?.matches(':popover-open')).toBe(true), { timeout: 2000 });
  expect(document.querySelector('.glyph-zoom .glyph').textContent).toBe('A');
  expect(getComputedStyle(document.querySelector('.glyph-zoom .glyph')).fontSize).toBe('96px');
  cell.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  await press(cell); // the click that ends the press
  expect(palettes.all.find((p) => p.id === palettes.active.id).glyphs).toEqual(before); // nothing picked
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await nextTick();
  expect(document.querySelector('.glyph-zoom')).toBeNull();
  await press(glyphs()[66]); // a click still picks
  expect(host.querySelector('.slots .slot .glyph-cell').textContent).toBe('B');
});

test('a wide but short window shrinks the editor before it becomes a dialog over the page', async () => {
  await page.viewport(1400, 600);
  onTestFinished(() => page.viewport(414, 896));
  await mount();
  await press(button('Edit'));
  const layer = host.querySelector('.palette-layer');
  await vi.waitFor(() => expect(getComputedStyle(layer).position).toBe('absolute')); // still floating
  expect(layer.getBoundingClientRect().height).toBeLessThanOrEqual(440 + 2); // the window less the toolbar's room
  await page.viewport(1400, 500);
  await vi.waitFor(() => expect(getComputedStyle(layer).position).toBe('fixed')); // too short: a dialog
  expect(layer.getBoundingClientRect().top).toBe(20); // 20px clear of the window's edges, as the About dialog
  await vi.waitFor(() => expect(host.querySelector('.scrim')).toBeTruthy());
});

test('going full window grows out of the floating layer, and coming back fades it in', async () => {
  await mount();
  const animate = vi.spyOn(Element.prototype, 'animate');
  await press(button('Edit')); // a phone's width: the editor takes the whole window
  await vi.waitFor(() => expect(animate).toHaveBeenCalledTimes(1));
  const [grow] = animate.mock.calls[0][0];
  expect(grow.clipPath).toMatch(/^inset\([\d.]+px [\d.]+px [\d.]+px [\d.]+px round 10px\)$/); // from where the layer floated
  await press(button('Done'));
  await vi.waitFor(() => expect(animate).toHaveBeenCalledTimes(2));
  expect(animate.mock.calls[1][0][0].opacity).toBe(0);
});

test('the editor shows the tie and changes it', async () => {
  let id;
  const { palettes } = await mount({ setup: (p) => { id = named(p, 'Frogs'); } });
  await edit('Frogs');
  expect(tieButton().textContent.trim()).toBe('For A');
  await press(tieButton());
  expect(button('Tie to A')).toBeUndefined(); // already tied to it
  await press(button('Use with any font'));
  expect(palettes.general.map((p) => p.id)).toContain(id);
  expect(tieButton().textContent.trim()).toBe('Any font');
  await press(tieButton());
  button('Tie to A').focus(); // the menu, and its focused item, go away once chosen
  await press(button('Tie to A'));
  expect(palettes.tied.map((p) => p.id)).toEqual([id]);
  await expect.poll(() => host.contains(document.activeElement)).toBe(true); // the layer keeps the keys
  expect(tieButton().textContent.trim()).toBe('For A');
  await press(row('Shades & blocks'));
  expect(tieButton()).toBeNull(); // built-ins show no tie
});

test('Duplicate, Export and Delete sit in the head\'s … menu', async () => {
  const { palettes } = await mount({ setup: (p) => named(p, 'Frogs') });
  await edit('Frogs');
  const head = () => host.querySelector('.head');
  expect(button('Duplicate', head())).toBeUndefined();
  expect(moreButton().getAttribute('aria-label')).toBe('More palette actions');
  await press(moreButton());
  expect(moreButton().getAttribute('aria-expanded')).toBe('true');
  expect(button('Export', head())).toBeTruthy();
  host.querySelector('[tabindex]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await nextTick();
  expect(button('Export', head())).toBeUndefined(); // Escape shuts the menu first, the editor stays
  expect(host.querySelector('.edit-side')).toBeTruthy();
  await press(moreButton());
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await nextTick();
  expect(button('Export', head())).toBeUndefined(); // a press elsewhere shuts it too
  await press(moreButton());
  await press(button('Duplicate', head()));
  expect(palettes.userPalettes.map((p) => p.name)).toContain('Frogs copy');
  expect(button('Duplicate', head())).toBeUndefined();
  await press(moreButton());
  await press(button('Delete', head())); // the copy, now the one in the editor
  expect(palettes.userPalettes.map((p) => p.name)).toEqual(['Frogs']);
  await expect.poll(() => host.contains(document.activeElement)).toBe(true); // the layer keeps the keys
  await press(row('Shades & blocks'));
  await press(moreButton());
  expect(button('Duplicate', head())).toBeTruthy();
  expect(button('Delete', head())).toBeUndefined(); // a built-in can't be deleted
});

test('with a TrueType or built-in font in use, the tie menu ties a palette to it', async () => {
  const { palettes } = await mount({ font: false, setup: (p) => named(p, 'Frogs') });
  expect(headers()).toEqual(['Built-in', 'Yours']); // no group for the font until a palette is tied to it
  await edit('Frogs');
  expect(tieButton().textContent.trim()).toBe('Any font');
  expect(tieButton().disabled).toBe(false);
  await press(tieButton());
  await press(button('Tie to JetBrains Mono'));
  expect(palettes.tied.map((p) => p.name)).toEqual(['Frogs']);
  expect(headers()).toEqual(['For JetBrains Mono', 'Built-in', 'Yours']);
  expect(tieButton().textContent.trim()).toBe('For JetBrains Mono');
  await press(button('＋ New', group('For JetBrains Mono')));
  expect(palettes.tied).toHaveLength(2); // + New there ties the new one too
  expect(button('CP437')).toBeTruthy(); // the sources stay a TrueType font's
});

test('a font drawing\'s sources are the font', async () => {
  const tabs = () => [...host.querySelectorAll('.sources .tabs button')].map((b) => b.textContent.trim());
  await mount();
  await press(button('Edit'));
  expect(tabs()).toEqual(['All 256', 'In this drawing', 'Recent']);
  app.unmount();
  host.remove();
  await mount({ font: false });
  await press(button('Edit'));
  expect(tabs()).toEqual(['CP437', 'Unicode', 'In this drawing', 'Recent']);
});

test('the sources have no legend: a glyph that does not fit in a cell says so when hovered', async () => {
  await mount({ font: false });
  await press(button('Edit'));
  expect(host.querySelector('.legend')).toBeNull();
  const find = host.querySelector('input[aria-label="Find or paste characters"]');
  find.value = 'U+0378'; // unassigned, so no cell holds it
  find.dispatchEvent(new Event('input'));
  await nextTick();
  const glyph = [...host.querySelectorAll('.grid button.g')].find((b) => b.textContent === '\u0378');
  expect(glyph.classList.contains('bad')).toBe(true);
  expect([glyph.disabled, glyph.getAttribute('aria-disabled')]).toEqual([false, 'true']); // Safari sends a disabled button no hover
  await userEvent.hover(glyph);
  await expect.poll(() => host.querySelector('.info').textContent).toContain('does not fit in one cell');
});

test('a font slot whose character a block took says why it can\u2019t be used, and a click on it puts nothing in the palette', async () => {
  const { project, palettes } = await mount();
  project.setDrawingFont({ ...fontA(), blocks: [220, ...CP437_BLOCKS.slice(1)] }); // Full drawn from Lower's slot: 219 has no character left
  await nextTick();
  await press(button('Edit'));
  const before = [...palettes.active.glyphs];
  const glyph = host.querySelectorAll('.grid button.g')[219];
  expect([glyph.classList.contains('bad'), glyph.disabled, glyph.getAttribute('aria-disabled')]).toEqual([true, false, 'true']);
  await userEvent.hover(glyph);
  await expect.poll(() => host.querySelector('.info').textContent).toBe(`Slot 219 ${glyph.textContent} · \u2588 is drawn from slot 220, so this slot has no character of its own`);
  await press(glyph);
  expect(palettes.active.glyphs).toEqual(before);
});

test('the Unicode tab gives way to the font tab when the drawing gets a font', async () => {
  const on = () => host.querySelector('.sources .tabs button.on')?.textContent.trim();
  const glyphs = () => [...host.querySelectorAll('.grid button.g')].map((b) => b.textContent);
  const { project } = await mount({ font: false });
  await press(button('Edit'));
  await press(button('Unicode'));
  expect(on()).toBe('Unicode');
  project.setDrawingFont(fontA());
  await nextTick();
  expect(on()).toBe('All 256');
  expect(glyphs()).toHaveLength(256);
  const find = host.querySelector('.sources input');
  find.value = 'Blocks'; // a block find still works, on the font's glyphs, under the font tab
  find.dispatchEvent(new Event('input'));
  await nextTick();
  expect(on()).toBe('All 256');
  expect(glyphs()).toContain('▄');
  expect(glyphs().filter((c) => '▙▚▞'.includes(c))).toEqual([]);
});

test('tying keeps what the font lacks, marked', async () => {
  let id;
  const { palettes } = await mount({
    setup: (p) => {
      id = named(p, 'Stars');
      p.tie(id, null);
      p.setSlot(id, 0, '★'); // not one of a bitmap font's 256
    },
  });
  await edit('Stars');
  await press(tieButton());
  button('Tie to A').focus(); // the menu, and its focused item, go away once chosen
  await press(button('Tie to A'));
  expect(palettes.tied.map((p) => p.id)).toEqual([id]);
  await expect.poll(() => host.contains(document.activeElement)).toBe(true); // the layer keeps the keys
  const slot = host.querySelectorAll('.slots .slot')[0];
  expect(slot.querySelector('.glyph-cell').textContent).toBe('★');
  expect(slot.classList.contains('bad')).toBe(true);
  expect(host.querySelectorAll('.slots .slot.bad')).toHaveLength(1);
});

test('palettes for fonts not loaded are reachable', async () => {
  let id;
  const { palettes } = await mount({
    setup: (p) => {
      id = named(p, 'Frogs');
      p.tie(id, { id: 'bitmap-deadbeef', name: 'TEST', height: 16 });
    },
  });
  expect(headers()).toEqual(['For A', 'Built-in', 'Yours', 'For fonts not loaded']);
  expect(row('Frogs · TEST')).toBeUndefined();
  await press(group('For fonts not loaded').querySelector('.label'));
  await edit('Frogs · TEST');
  expect(tieButton().textContent.trim()).toBe('For TEST');
  await press(tieButton());
  expect(button('Tie to A')).toBeTruthy();
  await press(button('Use with any font'));
  expect(palettes.general.map((p) => p.id)).toContain(id);
  expect(headers()).toEqual(['For A', 'Built-in', 'Yours']);
  await press(moreButton());
  await press(button('Delete', host.querySelector('.head')));
  expect(palettes.userPalettes.map((p) => p.id)).not.toContain(id);
});

test('export and import', async () => {
  const { palettes } = await mount({
    setup: (p) => {
      named(p, 'Frogs');
      p.tie(named(p, 'Toads'), null);
    },
  });
  const saved = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { saved.push({ blob }); return 'blob:x'; });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { saved.at(-1).name = this.download; });
  await press(await yours('Export'));
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0].name).toBe('Yours.palettes.json');
  const text = await saved[0].blob.text();
  const read = readPaletteFile(text, saved[0].name);
  expect(read.map((p) => [p.name, p.font?.id ?? null])).toEqual([['Frogs', fontId(fontA())], ['Toads', null]]);

  const input = host.querySelector('input[type="file"]');
  expect(input.accept).toBe('.json,application/json');
  const choose = (body, name) => {
    const files = new DataTransfer();
    files.items.add(new File([body], name));
    input.files = files.files;
    input.dispatchEvent(new Event('change'));
  };
  toastMessage.value = null;
  choose(text, 'Yours.palettes.json');
  await expect.poll(() => toastMessage.value).toBe('Added 2 palettes.');
  expect(palettes.userPalettes).toHaveLength(4);
  toastMessage.value = null;
  choose('not json', 'junk.json');
  await expect.poll(() => toastMessage.value).toBe('“junk.json” isn\'t a Phosphor palette file.');
  expect(palettes.userPalettes).toHaveLength(4);

  await edit('Frogs');
  await press(moreButton());
  await press(button('Export', host.querySelector('.head')));
  await expect.poll(() => saved.length).toBe(2);
  expect(saved[1].name).toBe('Frogs.palettes.json');
  expect(readPaletteFile(await saved[1].blob.text(), saved[1].name).map((p) => p.name)).toEqual(['Frogs']);
});

test('import says where palettes for other fonts went', async () => {
  await mount();
  useWorkspaceStore().userFonts = [{ id: 'bitmap-b', name: 'B', kind: 'bitmap', height: 8 }]; // kept, not in use
  const topaz = { id: 'bitmap-topaz', name: 'Topaz', height: 8 }, b = { id: 'bitmap-b', name: 'B', height: 8 };
  const input = host.querySelector('input[type="file"]');
  const choose = async (list) => {
    toastMessage.value = null;
    const files = new DataTransfer();
    files.items.add(new File([writePaletteFile(list.map((font, i) => ({ name: `P${i}`, glyphs: [], font })))], 'p.palettes.json'));
    input.files = files.files;
    input.dispatchEvent(new Event('change'));
    await expect.poll(() => toastMessage.value).not.toBeNull();
    return toastMessage.value;
  };
  expect(await choose([topaz])).toBe('Added 1 palette for Topaz. Load that font to see it.');
  expect(await choose([b, b])).toBe('Added 2 palettes for B. Use that font to see them.');
  expect(await choose([topaz, b])).toBe('Added 1 palette for Topaz. Load that font to see it. Added 1 palette for B. Use that font to see it.');
});

test('Escape leaves the editor for the list, and closes the layer from the editor reached from Fonts', async () => {
  await mount({ font: false });
  const workspace = useWorkspaceStore(), layer = () => host.querySelector('.palette-layer');
  const escape = async () => {
    layer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
  };
  await edit('Shades & blocks');
  await escape();
  expect(layer().classList.contains('editing')).toBe(false); // the list, still open
  const close = vi.fn();
  app.unmount();
  app = createApp({ render: () => h(CharPaletteLayer, { onClose: close }) }).use(getActivePinia()).use(i18n);
  workspace.paletteLayerPage = 'fonts';
  app.mount(host);
  await nextTick();
  workspace.paletteLayerPage = 'palettes';
  await nextTick();
  expect(layer().classList.contains('editing')).toBe(true); // the editor, as wide as Fonts
  await escape();
  expect(close).toHaveBeenCalledOnce();
});
