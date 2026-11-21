// The character field: the Shapes tool's Character and the Bucket's Set → Char take a typed or chosen character.
import { test, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp } from 'vue';
import { createTestApp, settle } from '../support/app.js';
import { cp437Font, font8 } from '../support/blockFonts.js';
import { i18n } from '@/i18n';
import EditToolbar from '@/components/EditToolbar.vue';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { usePaletteStore } from '@/store/PaletteStore';
import { fitFont, slotChars } from '@/lib/BitmapFont.js';

let mounted = null, host = null, shortcuts = null;
beforeAll(() => page.viewport(1280, 720));
afterAll(() => page.viewport(414, 896));
afterEach(() => { mounted?.unmount(); shortcuts?.unmount(); host?.remove(); mounted = host = shortcuts = null; });

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const frames = async () => { await frame(); await frame(); };

async function toolOn(tool, settings, font = null) {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(app.project);
  if (font) app.project.setDrawingFont(font);
  app.workspace.editorTab = 'output';
  app.workspace.setActiveTool(tool);
  Object.assign(app.workspace, settings);
  host = document.createElement('div');
  host.style.width = '726px';
  document.body.append(host);
  mounted = createApp(EditToolbar).use(i18n);
  mounted.mount(host);
  await frames();
  return app;
}
const field = () => host.querySelector('.char-input');
const setField = async (value) => {
  field().value = value;
  field().dispatchEvent(new Event('input', { bubbles: true }));
  await frames();
};
const openPicker = async () => {
  host.querySelector('.char-field .dropdown-trigger').click();
  await frames();
};

test('the Shapes tool offers Character from the start, and with it shows the character field', async () => {
  const { workspace } = await toolOn('shapes', { shapeKind: 'rect', shapeDrawWith: 'half' });
  expect(workspace.activeChar).toBe('█');
  expect(field()).toBeNull();
  host.querySelector('.option-menu button').click();
  await frames();
  expect([...document.querySelectorAll('.dropdown-content button.choice')].map((b) => b.textContent)).toContain('██Character');
  workspace.shapeDrawWith = 'char';
  await frames();
  expect(field().value).toBe('█');
});

test('the Bucket shows the character field with Cells and Set → Char lit, and only then', async () => {
  const { workspace } = await toolOn('bucket', { bucketFillWith: 'normal', bucketSet: { fg: true, bg: true, char: true } });
  expect(field()).toBeNull();
  workspace.bucketFillWith = 'cells';
  await frames();
  expect(field()).not.toBeNull();
  workspace.bucketSet = { fg: true, bg: true, char: false };
  await frames();
  expect(field()).toBeNull();
});

test('a character typed into the field is the one drawn; a tool key typed there doesn\'t change the tool', async () => {
  const { project, workspace } = await toolOn('shapes', { shapeDrawWith: 'char' });
  shortcuts = createApp({ setup() { useKeyboardShortcuts(project, workspace); return () => null; } });
  shortcuts.mount(document.createElement('div'));
  await userEvent.click(field());
  await userEvent.type(field(), 'E');
  expect([workspace.activeChar, workspace.activeTool]).toEqual(['E', 'shapes']);
});

test('with no drawing font a typed character stays as typed', async () => {
  const { project, workspace } = await toolOn('shapes', { shapeDrawWith: 'char' });
  expect(project.drawingFont).toBeNull();
  await setField('▘');
  expect(workspace.activeChar).toBe('▘');
});

test('in a bitmap font a character it lacks is its stand-in; a wide one is refused', async () => {
  const { workspace } = await toolOn('shapes', { shapeDrawWith: 'char' }, cp437Font);
  await setField('▘');
  expect(workspace.activeChar).toBe(fitFont('▘', cp437Font));
  await setField('漢');
  expect(workspace.activeChar).toBe(fitFont('▘', cp437Font));
  expect(field().value).toBe(fitFont('▘', cp437Font));
});

test('the picker holds the palette\'s glyphs and every slot of the font; a click sets the character, closes it and leaves the palette', async () => {
  const { workspace } = await toolOn('shapes', { shapeDrawWith: 'char' }, font8);
  const palette = [...usePaletteStore().active.glyphs];
  await openPicker();
  const slots = [...document.querySelectorAll('.dropdown-content .char-slots button')];
  expect(slots.map((b) => b.dataset.char)).toEqual(slotChars(font8));
  slots[1].click();
  await frames();
  expect(workspace.activeChar).toBe(slotChars(font8)[1]);
  expect(document.querySelector('.dropdown-content')).toBeNull();
  expect([...usePaletteStore().active.glyphs]).toEqual(palette);
  await openPicker();
  const quick = [...document.querySelectorAll('.dropdown-content .char-palette button')];
  expect(quick.map((b) => b.dataset.char)).toEqual(palette.filter(Boolean));
  quick[0].click();
  await frames();
  expect(workspace.activeChar).toBe(fitFont(quick[0].dataset.char, font8));
});

test('slot 0 is the font\'s own glyph in a bitmap font; with no drawing font it\'s a space, as CP437 shows byte 0', async () => {
  const { workspace } = await toolOn('shapes', { shapeDrawWith: 'char' }, font8);
  await openPicker();
  document.querySelector('.dropdown-content .char-slots button').click();
  await frames();
  expect(workspace.activeChar).toBe(slotChars(font8)[0]);
  mounted.unmount(); host.remove();
  const plain = await toolOn('shapes', { shapeDrawWith: 'char' });
  expect(plain.project.drawingFont).toBeNull();
  await openPicker();
  document.querySelector('.dropdown-content .char-slots button').click();
  await frames();
  expect(plain.workspace.activeChar).toBe(' ');
});
