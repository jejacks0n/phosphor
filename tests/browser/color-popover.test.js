// The color box with a palette: a swatch the sliders can't make shows its palette color, can't be picked, and says
// why; the others paint their palette colors. It's a popover anchored under the color pair, which nothing clips.
import { test, expect, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createTestApp, settle } from '../support/app.js';
import ColorPopover from '@/components/ColorPopover.vue';
import ColorPair from '@/components/ColorPair.vue';
import { i18n } from '@/i18n';
import { toastMessage } from '@/composables/useToast';
import { useVectorStyle } from '@/composables/useVectorStyle.js';

test('under Saturation 0 the CGA colors show, only the grays can be picked, and the arrows skip the rest', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 20, rows: 20 });
  project.quantize = 'cga';
  project.saturation = 0; // only grays
  await settle(project);
  workspace.editorTab = 'output';
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ColorPopover, { slotName: 'fg' }).use(i18n);
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

test('a chip opens the box as a popover under the pair, lined up with its left edge, out of a box that hides what overflows', async () => {
  const { workspace } = await createTestApp();
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', left: '40px', top: '60px', width: '42px', height: '30px', overflow: 'hidden' });
  document.body.append(host);
  const app = createApp(ColorPair).use(i18n);
  app.mount(host);
  host.querySelector('.chip.fg').click();
  await nextTick();
  const box = host.querySelector('.color-popover');
  for (const animation of box.getAnimations()) animation.finish();
  const pair = host.querySelector('.color-pair').getBoundingClientRect(), at = box.getBoundingClientRect();
  const fg = box.querySelector('.head button'), { left, top, width, height } = fg.getBoundingClientRect();
  try {
    expect(workspace.colorBox).toBe('fg');
    expect(box.matches(':popover-open')).toBe(true);
    expect(Math.round(at.left)).toBe(Math.round(pair.left));
    expect(Math.round(at.top - pair.bottom)).toBe(6);
    expect(document.elementFromPoint(left + width / 2, top + height / 2)).toBe(fg); // over what hides the rest
  } finally {
    app.unmount();
    host.remove();
  }
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
  const app = createApp(ColorPopover, props).use(i18n);
  app.mount(host);
  await nextTick();
  return { host, close: () => { app.unmount(); host.remove(); } };
}

test('Pick from the screen chooses the color the eyedropper gives for the slot open; put away, it chooses nothing and says nothing', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 8, rows: 4 });
  workspace.editorTab = 'output';
  let answer = async () => ({ sRGBHex: '#12AB34' });
  const restore = eyeDropper(() => answer());
  const { host, close } = await openBox({ slotName: 'bg' });
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
    expect(host.querySelector('.color-popover').matches(':popover-open')).toBe(true); // it stays open, as after a swatch
  } finally {
    close();
    restore();
  }
});

test('on VECTOR the eyedropper colors the Fill; with no eyedropper there is no button', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 8, rows: 4 });
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
