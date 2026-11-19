// The palette layer's Palettes page: the drawing's font's palettes first, a palette's font shown and changed,
// palettes for fonts not loaded, and palette files in and out.
import { test, expect, vi, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import CharPaletteLayer from '@/components/CharPaletteLayer.vue';
import { createTestApp } from '../support/app.js';
import { usePaletteStore } from '@/store/PaletteStore.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { fontId } from '@/lib/BitmapFont.js';
import { readPaletteFile, writePaletteFile } from '@/lib/PaletteFile.js';
import { toastMessage } from '@/composables/useToast.js';

const fontA = () => ({ name: 'A', height: 8, bytes: new Uint8Array(2048).fill(1) });
let app = null, host = null;

afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
  vi.restoreAllMocks();
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
const press = async (el) => {
  el.click();
  await nextTick();
};
const edit = async (name) => {
  await press(row(name));
  if (!host.querySelector('.edit-side')) await press(button('Edit ▸'));
};

test('the drawing\'s font\'s palettes come first', async () => {
  await mount({ setup: (p) => named(p, 'Frogs') });
  expect(headers()).toEqual(['For A', 'Built-in', 'Yours']);
  expect(row('Frogs')).toBeTruthy();
  app.unmount();
  host.remove();
  await mount({ font: false });
  expect(headers()).toEqual(['Built-in', 'Yours']);
  expect(button('Export', group('Yours')).disabled).toBe(true); // none of yours to export
});

test('+ New under the font\'s group makes a tied palette', async () => {
  const { palettes } = await mount();
  await press(button('＋ New', group('For A')));
  expect(palettes.userPalettes.at(-1).font.id).toBe(fontId(fontA()));
  await press(button('＋ New', group('Yours')));
  expect(palettes.userPalettes).toHaveLength(2);
  expect(palettes.userPalettes.at(-1).font).toBeNull();
});

test('the editor shows the tie and changes it', async () => {
  let id;
  const { palettes } = await mount({ setup: (p) => { id = named(p, 'Frogs'); } });
  await edit('Frogs');
  expect(tieButton().textContent.trim()).toBe('For A ▾');
  await press(tieButton());
  expect(button('Tie to A')).toBeUndefined(); // already tied to it
  await press(button('Use with any font'));
  expect(palettes.general.map((p) => p.id)).toContain(id);
  expect(tieButton().textContent.trim()).toBe('Any font ▾');
  await press(tieButton());
  button('Tie to A').focus(); // the menu, and its focused item, go away once chosen
  await press(button('Tie to A'));
  expect(palettes.tied.map((p) => p.id)).toEqual([id]);
  await expect.poll(() => host.contains(document.activeElement)).toBe(true); // the layer keeps the keys
  expect(tieButton().textContent.trim()).toBe('For A ▾');
  await press(row('Shades & blocks'));
  expect(tieButton()).toBeNull(); // built-ins show no tie
});

test('a font drawing\'s sources are the font', async () => {
  const tabs = () => [...host.querySelectorAll('.sources .tabs button')].map((b) => b.textContent.trim());
  await mount();
  await press(button('Edit ▸'));
  expect(tabs()).toEqual(['A · 256', 'In this drawing', 'Recent']);
  expect(host.querySelector('.legend').textContent).not.toContain('not in CP437');
  app.unmount();
  host.remove();
  await mount({ font: false });
  await press(button('Edit ▸'));
  expect(tabs()).toEqual(['CP437', 'Unicode', 'In this drawing', 'Recent']);
  expect(host.querySelector('.legend').textContent).toContain('not in CP437');
});

test('the Unicode tab gives way to the font tab when the drawing gets a font', async () => {
  const on = () => host.querySelector('.sources .tabs button.on')?.textContent.trim();
  const glyphs = () => [...host.querySelectorAll('.grid button.g')].map((b) => b.textContent);
  const { project } = await mount({ font: false });
  await press(button('Edit ▸'));
  await press(button('Unicode'));
  expect(on()).toBe('Unicode');
  project.setDrawingFont(fontA());
  await nextTick();
  expect(on()).toBe('A · 256');
  expect(glyphs()).toHaveLength(256);
  const find = host.querySelector('.sources input');
  find.value = 'Blocks'; // a block find still works, on the font's glyphs, under the font tab
  find.dispatchEvent(new Event('input'));
  await nextTick();
  expect(on()).toBe('A · 256');
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
  expect(headers()).toEqual(['For A', 'Built-in', 'Yours', 'For fonts not loaded (1)']);
  expect(row('Frogs · TEST')).toBeUndefined();
  await press(group('For fonts not loaded (1)').querySelector('.label'));
  await edit('Frogs · TEST');
  expect(tieButton().textContent.trim()).toBe('For TEST ▾');
  expect(host.querySelector('.head [aria-label="Delete palette"]')).toBeTruthy();
  await press(tieButton());
  expect(button('Tie to A')).toBeTruthy();
  await press(button('Use with any font'));
  expect(palettes.general.map((p) => p.id)).toContain(id);
  expect(headers()).toEqual(['For A', 'Built-in', 'Yours']);
  await press(host.querySelector('.head [aria-label="Delete palette"]'));
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
  await press(button('Export', group('Yours')));
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
