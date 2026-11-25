// The status bar under the ANSI and VECTOR views (AnsiStatusBar.vue): it starts with the picked layer's name, so a folded
// side panel or a phone still says which layer you're on.
import { test, expect, afterEach } from 'vitest';
import { createApp, nextTick } from 'vue';
import { i18n, setLocale } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import { rectShape } from '@/document/shapes.js';
import AnsiStatusBar from '@/components/AnsiStatusBar.vue';
import { lowerAt240 } from '../support/blockFonts.js';
import { shortcut } from '@/lib/keyLabels';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

async function mount() {
  const stores = await createTestApp();
  await stores.project.setBlankCanvas({ withLayer: true, cols: 20, rows: 10 });
  await settle(stores.project);
  stores.workspace.editorTab = 'output';
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(AnsiStatusBar).use(stores.pinia).use(i18n); // the test's own: after the awaits, the active one may be a late test's
  app.mount(host);
  await nextTick();
  return stores;
}
const layer = () => host.querySelector('footer > :first-child');

test('it starts with the picked layer\'s name, which a pick and a rename update', async () => {
  const { project, workspace } = await mount();
  expect(layer().getAttribute('aria-label')).toBe('Selected layer: Layer 1');
  expect(layer().textContent).toBe('Layer 1');
  workspace.pickLayer('base');
  await nextTick();
  expect(layer().textContent).toBe('Base');
  expect(layer().getAttribute('aria-label')).toBe('Selected layer: Base');

  project.renameLayer('edit', 'Ink');
  workspace.pickLayer('edit');
  await nextTick();
  expect(layer().textContent).toBe('Ink');
  project.renameLayer('edit', '');   // a blank name puts the default back
  await nextTick();
  expect(layer().textContent).toBe('Layer 1');
});

test('picking the vector layer names it', async () => {
  const { project, workspace } = await mount();
  project.addShape(rectShape(0, 0, 4, 4, { fill: '#ff0000' }));
  workspace.pickLayer('vector');
  await nextTick();
  expect(layer().textContent).toBe('Vector 1');
});

test('in French the label is Calque sélectionné', async () => {
  const { workspace } = await mount();
  await setLocale('fr', { persist: false });
  await nextTick();
  expect(layer().getAttribute('aria-label')).toBe('Calque sélectionné : Calque 1');
  workspace.pickLayer('base');
  await nextTick();
  expect(layer().getAttribute('aria-label')).toBe('Calque sélectionné : Base');
  await setLocale('en', { persist: false });
});

test('with Shift held, Dodge (no Alt pick of its own) says Shift draws a straight line, as the Brush does', async () => {
  const { workspace } = await mount();
  workspace.setActiveTool('dodge');
  workspace.isShiftPressed = true;
  await nextTick();
  expect(host.querySelector('footer').textContent).toContain(i18n.global.t('status.straightLine'));
});

test('the buttons go zoom, Overwrite or Insert, Canvas or DOM, then Smooth', async () => {
  const { workspace } = await mount();
  workspace.setActiveTool('text');
  workspace.setAnsiZoom(0.5);
  await nextTick();
  expect([...host.querySelectorAll('.strip button')].map((b) => b.textContent.trim())).toEqual(['50%', 'Overwrite', 'DOM', 'Smooth']);
});

test('the typing mode button goes Overwrite, Insert, Partial and round again, its title saying what the mode moves', async () => {
  const { workspace } = await mount();
  workspace.setActiveTool('text');
  await nextTick();
  const button = () => [...host.querySelectorAll('.strip button')].find((b) => ['Overwrite', 'Insert', 'Partial'].includes(b.textContent.trim()));
  const seen = [];
  for (let k = 0; k < 4; k++) {
    seen.push([button().textContent.trim(), button().title]);
    button().click();
    await nextTick();
  }
  const title = (mode) => i18n.global.t(`status.${mode}Title`, { key: shortcut('alt', 'Enter') }); // the Insert key, and the keys that stand in for it
  expect(seen).toEqual([['Overwrite', title('overwrite')], ['Insert', title('insert')], ['Partial', title('partial')], ['Overwrite', title('overwrite')]]);
  expect(title('partial')).toMatch(/Insert key, or (⌥Enter|Alt\+Enter)\)$/);
});

test('a long layer name is cut short with an ellipsis, the whole name its title', async () => {
  const { project, workspace } = await mount();
  const name = 'The layer of the cells I am fixing today';
  project.renameLayer('edit', name);
  workspace.pickLayer('edit');
  await nextTick();
  expect(layer().title).toBe(name);
  expect(layer().scrollWidth).toBeGreaterThan(layer().clientWidth);
  expect(getComputedStyle(layer()).textOverflow).toBe('ellipsis');
});

// dex-13: the Zoom tool's hint said only Space pan, so nothing said a click zooms or how to zoom out.
test('the Zoom tool says a click zooms in and Alt-click out; with Alt held, that it zooms out and a drag zooms smoothly', async () => {
  const { workspace } = await mount();
  workspace.setActiveTool('zoom');
  await nextTick();
  const hint = () => host.querySelector('.hint').textContent;
  expect(hint()).toBe(`Click zoom in · ${shortcut('alt')} Click zoom out · Space pan`);
  workspace.isAltPressed = true;
  await nextTick();
  expect(hint()).toBe('Zooming out · drag either way to zoom smoothly');
});

const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const width = (el) => el.getBoundingClientRect().width;
const sum = (els) => els.reduce((total, el) => total + width(el), 0);

test('shows the character code under the cursor', async () => {
  const { project, workspace } = await mount();
  workspace.setActiveTool('text');
  const at = async (char) => {
    project.typeAt(0, 0, char, {});
    workspace.textCursor = { col: 0, row: 0 };
    await nextTick();
    return host.querySelector('b.code')?.textContent;
  };
  expect(await at('█')).toBe('219');
  expect(await at('😀')).toBeUndefined();
  project.setDrawingFont({ name: 'Topaz', height: 8, bytes: new Uint8Array(256 * 8) });
  await settle(project); // a font of another height draws the grid again, and typing waits for that
  expect(await at('␀')).toBe('0');
  project.setDrawingFont(lowerAt240);
  await settle(project);
  expect(await at('▄')).toBe('240'); // the slot this font draws it from
});

// dex-10: at 1280 with both panels open, Edit Mode's readout squeezed the buttons until the last was cut. Too narrow for
// it all, the FG and BG hex codes give way first (each stays on its swatch's hover and in the text read out), and the
// buttons stay whole. The width is measured from the bar's own parts, so it holds with any font.
test('too narrow for both hex codes, they give way first and the buttons stay whole; with room, they show', async () => {
  const { workspace } = await mount();
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 0, row: 0 };
  host.style.width = '2000px';
  await frames();
  const footer = host.querySelector('footer'), strip = footer.querySelector('.strip');
  const hexes = [...footer.querySelectorAll('b.hex')];
  expect(hexes.map((b) => b.textContent)).toEqual([expect.stringMatching(/^#[0-9a-f]{6}$/), expect.stringMatching(/^#[0-9a-f]{6}$/)]);
  const fg = hexes[0].textContent;
  const style = getComputedStyle(footer), gap = parseFloat(style.columnGap);
  const readout = [...footer.children].filter((el) => el !== strip), buttons = [...strip.children];
  const need = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + sum(readout) + gap * readout.length
    + sum(buttons) + parseFloat(getComputedStyle(strip).columnGap) * (buttons.length - 1);

  host.style.width = `${Math.floor(need - sum(hexes) / 2)}px`; // short of room for the hex codes, not for the rest
  await frames();
  expect(hexes.every((b) => width(b) <= 1)).toBe(true);
  expect(strip.scrollWidth).toBeLessThanOrEqual(strip.clientWidth + 1);
  expect(footer.textContent).toContain(fg);
  expect(footer.querySelector('i.swatch').title).toBe(fg);

  host.style.width = `${Math.ceil(need) + 8}px`;
  await frames();
  expect(hexes.every((b) => width(b) > 20)).toBe(true);
  expect(strip.scrollWidth).toBeLessThanOrEqual(strip.clientWidth + 1);
});

// What's still past the edge on a phone fades out there, and a plain mouse wheel scrolls it sideways (it took Shift).
test('a plain wheel over the buttons scrolls them sideways while there is more', async () => {
  const { workspace } = await mount();
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 0, row: 0 };
  workspace.setAnsiZoom(0.5);
  host.style.width = '200px';
  await frames();
  const strip = host.querySelector('.strip');
  expect(strip.scrollWidth).toBeGreaterThan(strip.clientWidth);
  expect(strip.classList.contains('more')).toBe(true); // the fade
  const wheel = new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true });
  strip.dispatchEvent(wheel);
  expect(strip.scrollLeft).toBeGreaterThan(0);
  expect(wheel.defaultPrevented).toBe(true);
  // Scrolled to its end, it stays there: measuring whether the hex codes fit shows them for a moment, which leaves the
  // strip less to scroll, and that would pull it back.
  strip.dispatchEvent(new WheelEvent('wheel', { deltaY: 4000, bubbles: true, cancelable: true }));
  const end = strip.scrollLeft;
  expect(end).toBe(strip.scrollWidth - strip.clientWidth);
  await frames();
  expect(strip.scrollLeft).toBe(end);
  expect(host.querySelector('footer').classList.contains('tight')).toBe(true);
});

// iCE colors where the drawing shows: the SAUCE tab's checkbox as a button beside Smooth.
test('a 16-color drawing has an iCE button before Smooth, lit while iCE colors is on; a click turns it off in one undo step, and any other drawing has none', async () => {
  const { project } = await mount();
  const buttons = () => [...host.querySelectorAll('.strip button')].map((b) => b.textContent), ice = () => [...host.querySelectorAll('.strip button')].find((b) => b.textContent === 'iCE');
  expect(ice()).toBeUndefined(); // full color
  project.quantize = 'cga';
  await nextTick();
  expect(buttons().slice(-2)).toEqual(['iCE', 'Smooth']);
  expect([ice().getAttribute('aria-pressed'), ice().classList.contains('on'), ice().title]).toEqual(['true', true, 'iCE colors is on: bright backgrounds. Click to make them blink, as on DOS.']);
  ice().click();
  await nextTick();
  expect([project.sauceIceColors, ice().getAttribute('aria-pressed'), ice().title]).toEqual([false, 'false', 'iCE colors is off: bright backgrounds blink, as on DOS. Click for bright backgrounds.']);
  project.undo();
  await nextTick();
  expect([project.sauceIceColors, ice().getAttribute('aria-pressed')]).toEqual([true, 'true']);
  project.quantize = 'vga';
  await nextTick();
  expect(ice()).toBeUndefined();
});
