// Palettes that belong to a font: shown while the font is in use, kept while it isn't.
import { test, expect } from 'vitest';
import { createTestApp } from '../support/app.js';
import { fontId } from '@/lib/BitmapFont.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { usePaletteStore } from '@/store/PaletteStore.js';

const fontA = () => ({ name: 'A', height: 8, bytes: new Uint8Array(2048).fill(1) });
const fontB = () => ({ name: 'B', height: 8, bytes: new Uint8Array(2048).fill(2) });

async function setup() {
  localStorage.clear();
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  return { project, palettes: usePaletteStore(), workspace: useWorkspaceStore() };
}

test('a palette made in a font drawing belongs to its font', async () => {
  const { project, palettes } = await setup();
  project.setDrawingFont(fontA());
  const id = palettes.create();
  expect(palettes.all.find(p => p.id === id).font.id).toBe(fontId(fontA()));
  expect(palettes.tied.map(p => p.id)).toEqual([id]);
  expect(palettes.shown[0].id).toBe(id);
  project.setDrawingFont(null);
  expect(palettes.shown.map(p => p.id)).not.toContain(id);
  expect(palettes.general.map(p => p.id)).not.toContain(id);
});

test('copies take the font in use; duplicates keep their own', async () => {
  const { project, palettes } = await setup();
  project.setDrawingFont(fontA());
  const { id } = palettes.setSlot('shades', 0, '☺');
  expect(palettes.all.find(p => p.id === id).font.id).toBe(fontId(fontA()));
  expect(palettes.activeId).toBe(id);
  project.setDrawingFont(fontB());
  const dup = palettes.duplicate(id);
  expect(palettes.all.find(p => p.id === dup).font.id).toBe(fontId(fontA()));
  const single = palettes.duplicate('single');
  expect(palettes.all.find(p => p.id === single).font.id).toBe(fontId(fontB()));
});

test('the chosen palette comes back with its font', async () => {
  const { project, palettes } = await setup();
  project.setDrawingFont(fontA());
  const id = palettes.create();
  palettes.activeId = id;
  project.setDrawingFont(fontB());
  expect(palettes.active.id).toBe('shades');
  expect(palettes.activeId).toBe(id);
  project.undo();
  expect(palettes.active.id).toBe(id);
});

test('tie and untie', async () => {
  const { project, palettes } = await setup();
  project.setDrawingFont(fontA());
  const id = palettes.create();
  palettes.tie(id, null);
  expect(palettes.general.map(p => p.id)).toContain(id);
  expect(palettes.tied.map(p => p.id)).not.toContain(id);
  palettes.tie(id, palettes.currentFont);
  expect(palettes.tied.map(p => p.id)).toContain(id);
});

test('palettes for fonts not loaded', async () => {
  const { palettes, workspace } = await setup();
  palettes.userPalettes = [{ id: 'x1', name: 'X', glyphs: [], font: { id: 'gone', name: 'Gone', height: 8 } }];
  workspace.userFonts = [];
  expect(palettes.unloaded.map(p => p.id)).toEqual(['x1']);
  expect(palettes.countFor('gone')).toBe(1);
  workspace.userFonts = [{ id: 'gone', name: 'Gone', kind: 'bitmap', height: 8 }];
  expect(palettes.unloaded).toEqual([]);
  expect(palettes.shown.map(p => p.id)).not.toContain('x1');
});

test('import adds, renames and says which fonts are missing', async () => {
  const { palettes, workspace } = await setup();
  workspace.userFonts = [];
  palettes.userPalettes = [{ id: 'e', name: 'Mine', glyphs: [] }];
  const font = { id: 'topaz-id', name: 'Topaz', height: 8 };
  const result = palettes.importPalettes([
    { name: 'Mine', glyphs: [], font },
    { name: 'Mine', glyphs: [], font },
  ]);
  expect(result).toEqual({ added: 2, waiting: ['Topaz'], unused: [] });
  const names = palettes.userPalettes.map(p => p.name);
  expect(new Set(names).size).toBe(3);
  palettes.importPalettes([{ name: 'Frogs', glyphs: [], font: null }, { name: 'Frogs', glyphs: [], font: null }]);
  expect(palettes.userPalettes.slice(-2).map(p => p.name)).toEqual(['Frogs', 'Frogs (custom)']); // a free name is kept
});

test('import says which kept fonts its palettes wait for', async () => {
  const { project, palettes, workspace } = await setup();
  project.setDrawingFont(fontA());
  workspace.userFonts = [{ id: fontId(fontB()), name: 'B', kind: 'bitmap', height: 8 }];
  const a = { id: fontId(fontA()), name: 'A', height: 8 }, b = { id: fontId(fontB()), name: 'B', height: 8 };
  const result = palettes.importPalettes([
    { name: 'One', glyphs: [], font: a },
    { name: 'Two', glyphs: [], font: b },
    { name: 'Three', glyphs: [], font: b },
    { name: 'Four', glyphs: [], font: null },
  ]);
  expect(result).toEqual({ added: 4, waiting: [], unused: ['B'] });
});

test('palettes saved before ties read as for any font', async () => {
  const { palettes } = await setup();
  palettes.userPalettes = [{ id: 'old', name: 'Old', glyphs: [] }];
  expect(palettes.general.map(p => p.id)).toEqual(['old']);
  expect(palettes.all.find(p => p.id === 'old').font).toBeNull();
});
