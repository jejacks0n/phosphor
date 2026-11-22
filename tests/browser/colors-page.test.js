// The color layer's Colors page with a palette: a swatch the sliders can't make shows its palette color, can't be
// picked, and says why; the others paint their palette colors. (Where the layer opens is color-layer.test.js's.)
import { test, expect, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createTestApp, settle } from '../support/app.js';
import ColorsPage from '@/components/ColorsPage.vue';
import { i18n } from '@/i18n';
import { toastMessage } from '@/composables/useToast';
import { useVectorStyle } from '@/composables/useVectorStyle.js';

test('under Saturation 0 the CGA colors show, only the grays can be picked, and the arrows skip the rest', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  project.quantize = 'cga';
  project.saturation = 0; // only grays
  await settle(project);
  workspace.editorTab = 'output';
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ColorsPage, { slotName: 'fg' }).use(i18n);
  app.mount(host);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const swatches = [...host.querySelectorAll('.swatches .swatch')];
  const red = swatches[1], gray = swatches[7];
  const look = { bg: red.style.backgroundColor, disabled: red.disabled, title: red.title };
  const grayOpen = !gray.disabled;
  red.click();
  const fgAfterRed = workspace.editFgColor;
  gray.focus();
  gray.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  const focused = document.activeElement;
  app.unmount();
  host.remove();
  expect(look).toEqual({ bg: 'rgb(170, 0, 0)', disabled: true, title: expect.stringContaining('#aa0000') });
  expect(look.title).not.toBe('#aa0000'); // it says why, not just the color
  expect(grayOpen).toBe(true);
  expect(fgAfterRed).not.toBe('#aa0000');
  expect(swatches.indexOf(focused)).not.toBe(7); // Left goes past cyan, which can't be picked, to a swatch that can
  expect(focused.disabled).toBe(false);
  expect(swatches.filter((s) => !s.disabled).length).toBe(4); // black, gray, dark gray and white
});

// The browser's eyedropper, standing in: open() gives what's asked of it.
function eyeDropper(open) {
  const had = Object.getOwnPropertyDescriptor(window, 'EyeDropper');
  Object.defineProperty(window, 'EyeDropper', { value: open && class { open() { return open(); } }, configurable: true, writable: true });
  return () => (had ? Object.defineProperty(window, 'EyeDropper', had) : delete window.EyeDropper);
}

async function openBox(props) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ColorsPage, props).use(i18n);
  app.mount(host);
  await nextTick();
  return { host, close: () => { app.unmount(); host.remove(); } };
}

test('Pick from the screen chooses the color the eyedropper gives for the slot open; put away, it chooses nothing and says nothing', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 4 });
  workspace.editorTab = 'output';
  let answer = async () => ({ sRGBHex: '#12AB34' });
  const restore = eyeDropper(() => answer());
  const onClose = vi.fn();
  const { host, close } = await openBox({ slotName: 'bg', onClose });
  try {
    const button = host.querySelector('button[aria-label="Pick a color from anywhere on the screen"]');
    button.click();
    await vi.waitUntil(() => workspace.editBgColor === '#12ab34', { interval: 5 });
    expect(workspace.recentColors[0]).toBe('#12ab34');
    answer = async () => { throw new DOMException('The user canceled the selection.', 'AbortError'); };
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(workspace.editBgColor).toBe('#12ab34');
    expect(toastMessage.value).toBe(null);
    expect(onClose).not.toHaveBeenCalled(); // it stays open, as after a swatch
  } finally {
    close();
    restore();
  }
});

test('on VECTOR the eyedropper colors the Fill; with no eyedropper there is no button', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 4 });
  workspace.editorTab = 'vector';
  let restore = eyeDropper(async () => ({ sRGBHex: '#0088ff' }));
  let box = await openBox({ slotName: 'fg' });
  try {
    box.host.querySelector('button.screen').click();
    await vi.waitUntil(() => useVectorStyle().value('fill') === '#0088ff', { interval: 5 });
  } finally {
    box.close();
    restore();
  }
  restore = eyeDropper(null);
  box = await openBox({ slotName: 'fg' });
  try {
    expect(box.host.querySelector('button.screen')).toBe(null);
  } finally {
    box.close();
    restore();
  }
});

// #199: in Full color the box is the browser's own color input, which reports a color only when it changes. With BG None
// it still held the color None was laid over (black, to start), so choosing that color said nothing and BG stayed None.
// Pressing the color while the slot is None chooses it, whatever is picked after; and the label says None, not a hex.
test('#199: in Full color with BG None, pressing the color it holds chooses it; the label says None until then', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(project);
  workspace.editorTab = 'output';
  expect([project.quantize, workspace.editBgNone, workspace.editBgColor]).toEqual(['none', true, '#000000']); // as a drawing starts
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ColorsPage, { slotName: 'bg' }).use(i18n);
  app.mount(host);
  try {
    await nextTick();
    const input = host.querySelector('label.native input[type=color]'), label = () => host.querySelector('label.native span').textContent.trim();
    expect(label()).toBe('None');
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); // opening it: black is what it shows
    await nextTick();
    expect([workspace.editBgNone, workspace.editBgColor]).toEqual([false, '#000000']);
    expect(label()).toBe('#000000');
    expect(host.querySelector('.swatch.none').classList.contains('selected')).toBe(false);

    // With a color chosen, pressing it again changes nothing: it only opens the picker.
    workspace.setColor('bg', '#123456');
    await nextTick();
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect([workspace.editBgNone, workspace.editBgColor]).toEqual([false, '#123456']);

    // None again keeps the color under it, and pressing that color brings it back.
    workspace.setColor('bg', null);
    await nextTick();
    expect(label()).toBe('None');
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect([workspace.editBgNone, workspace.editBgColor]).toEqual([false, '#123456']);
  } finally {
    app.unmount();
    host.remove();
  }
});

// f1: Recent holds palette colors, as the grid does: a Recent color the sliders can't make shows under the "no" sign and
// can't be picked (nor reached with the arrows), and one they can make picks what its grid swatch picks.
test('under Saturation 0 a Recent color the grid blocks is blocked in Recent too; a gray picks as its grid swatch does', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  project.quantize = 'cga';
  project.saturation = 0;
  await settle(project);
  workspace.editorTab = 'output';
  workspace.recentColors = ['#ffff55', '#5555ff', '#aaaaaa'];
  const { host, close } = await openBox({ slotName: 'fg' });
  try {
    const [yellow, blue, gray] = host.querySelectorAll('.foot .swatch.small');
    const grid = [...host.querySelectorAll('.swatches .swatch')];
    expect([yellow.disabled, blue.disabled, gray.disabled]).toEqual([true, true, false]);
    expect(blue.title).toBe(grid[12].title); // the grid's words for a color that can't be picked
    expect(blue.style.backgroundColor).toBe('rgb(85, 85, 255)'); // its palette color, as the grid shows it
    blue.click();
    expect(workspace.editFgColor).not.toBe('#5555ff');
    gray.focus();
    gray.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement.disabled).toBe(false); // past blue and yellow
    gray.click();
    grid[7].click();
    expect(workspace.recentColors[0]).toBe('#aaaaaa');
  } finally {
    close();
  }
});

test('with Hue moved, Recent keeps the palette color picked, and picking it again paints what its grid swatch paints', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  project.quantize = 'cga';
  project.hue = 90;
  await settle(project);
  workspace.editorTab = 'output';
  workspace.recentColors = [];
  const { host, close } = await openBox({ slotName: 'fg' });
  try {
    const grid = [...host.querySelectorAll('.swatches .swatch:not(:disabled)')];
    const red = [...host.querySelectorAll('.swatches .swatch')][1];
    if (red.disabled) throw new Error('red should be makeable with Hue moved');
    red.click();
    const stored = workspace.editFgColor;
    expect(workspace.recentColors[0]).toBe('#aa0000');
    await nextTick();
    grid.find((s) => s !== red)?.click();
    host.querySelector('.foot .swatch.small[title*="#aa0000"]').click();
    expect(workspace.editFgColor).toBe(stored);
  } finally {
    close();
  }
});
