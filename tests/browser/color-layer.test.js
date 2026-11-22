// The color layer: the color box in the character palette layer's frame (FloatingPanel), opened under the toolbar at the
// color pair's left, never past the toolbar's right edge, and one at a time with the character palette layer.
import { test, expect, vi, afterEach, onTestFinished } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { i18n } from '@/i18n';
import ColorLayer from '@/components/ColorLayer.vue';
import ColorPair from '@/components/ColorPair.vue';
import EditWorkspace from '@/components/EditWorkspace.vue';
import { createTestApp, settle } from '../support/app.js';
import '@/assets/global.css';

let app = null, host = null;

afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

// The layer in a stand-in for the toolbar (positioned, as EditToolbar's article is), its color pair `pair` px from its
// left, mounted while the color box is open as EditToolbar mounts it.
async function mount({ slot = 'fg', on = 'colors', width = 800, pair = 120, before } = {}) {
  const { project, workspace, pinia } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 10 });
  await before?.({ project, workspace });
  host = document.body.appendChild(document.createElement('article'));
  host.className = 'edit-toolbar';
  Object.assign(host.style, { position: 'relative', width: `${width}px`, height: '70px' });
  const chips = host.appendChild(document.createElement('div'));
  chips.className = 'color-pair';
  Object.assign(chips.style, { position: 'absolute', left: `${pair}px`, top: '10px', width: '42px', height: '30px' });
  workspace.openColors(slot, on);
  app = createApp({ render: () => (workspace.colorBox ? h(ColorLayer) : null) }).use(pinia).use(i18n);
  app.mount(host.appendChild(document.createElement('div')));
  await nextTick();
  return { project, workspace, panel: () => host.querySelector('.color-layer') };
}

test('it opens under the toolbar at the pair\'s left, as wide as the box before it with 260px of swatches, with the Colors tab', async () => {
  const { panel } = await mount();
  const bar = host.getBoundingClientRect(), at = panel().getBoundingClientRect();
  expect(Math.round(at.left - bar.left)).toBe(120);
  expect(Math.round(at.top)).toBe(Math.round(bar.bottom + 2));
  expect(getComputedStyle(panel()).width).toBe('280px');
  expect(at.width).toBe(282); // the old box's width, border and all
  const page = panel().querySelector('.color-popover'), pad = getComputedStyle(page);
  expect(page.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight)).toBe(260); // the old box's content
  expect(page.querySelector('.head').getBoundingClientRect().width).toBe(260);
  expect([...panel().querySelectorAll('[role="tab"]')].map((tab) => tab.textContent.trim())).toEqual(['Colors', 'Palettes']);
  expect(panel().getAttribute('aria-label')).toBe('Colors');
  expect(panel().querySelector('.color-popover')).not.toBe(null);
});

test('Escape closes it, and so does a press outside, but not a press on the pair', async () => {
  const { workspace } = await mount();
  const press = (el) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
  press(host.querySelector('.color-pair'));
  await nextTick();
  expect(workspace.colorBox).toBe('fg');
  press(document.body);
  await nextTick();
  expect(workspace.colorBox).toBe(null);

  workspace.openColors('bg');
  await nextTick();
  expect(host.querySelector('.color-layer')).not.toBe(null);
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await nextTick();
  expect(workspace.colorBox).toBe(null);
  expect(host.querySelector('.color-layer')).toBe(null);
});

test('opening the color box closes the character layer, and opening the character layer closes the color box', async () => {
  const { workspace } = await mount({ before: ({ workspace }) => { workspace.paletteLayerOpen = true; } });
  expect(workspace.paletteLayerOpen).toBe(false);
  expect(workspace.colorBox).toBe('fg');
  workspace.paletteLayerOpen = true;
  await nextTick();
  expect(workspace.colorBox).toBe(null);
  expect(workspace.paletteLayerOpen).toBe(true);
});

// Review Focus 3: the frame has a max height and hides what overflows, so on a short window the page scrolls inside it
// rather than cutting the Stroke side's last line (Miter) off. A Custom color list of 64 colors (Flatten writes up to
// 255) makes the page taller than the frame; VGA's grids alone fit it.
const LONG_LIST = Array.from({ length: 64 }, (_, i) => `#${(i * 0x040404).toString(16).padStart(6, '0')}`).join(' ');
test('on a short window VECTOR\'s Stroke side scrolls inside the box, Miter reachable', async () => {
  await page.viewport(1400, 600);
  onTestFinished(() => page.viewport(414, 896));
  await vi.waitFor(() => expect(innerHeight).toBe(600));
  const { panel } = await mount({ slot: 'bg', before: async ({ project, workspace }) => {
    Object.assign(project, { quantize: 'palette', palette: LONG_LIST });
    await settle(project);
    workspace.editorTab = 'vector';
  } });
  const box = panel().querySelector('.color-popover'), miter = box.querySelector('#vector-miter');
  expect(miter).not.toBe(null);
  expect(box.scrollHeight).toBeGreaterThan(box.clientHeight);
  expect(getComputedStyle(box).overflowY).toBe('auto');
  miter.scrollIntoView({ block: 'nearest' });
  const frame = panel().getBoundingClientRect(), field = miter.getBoundingClientRect();
  expect(field.top).toBeGreaterThanOrEqual(frame.top);
  expect(field.bottom).toBeLessThanOrEqual(frame.bottom);
});

// Review Focus 1: a toolbar narrower than the pair's left plus the layer's width keeps the layer 10px inside its right,
// and the toolbar widening (the side panel folded, say) lets it back under the pair.
test('in a toolbar narrower than the pair\'s left plus its width, it stays 10px inside', async () => {
  const { panel } = await mount({ width: 320 });
  const bar = host.getBoundingClientRect(), at = panel().getBoundingClientRect();
  expect(at.right).toBeLessThanOrEqual(bar.right - 10);
  expect(getComputedStyle(panel()).width).toBe('280px');
  expect(at.left).toBeGreaterThanOrEqual(bar.left + 10);
  host.style.width = '800px';
  await vi.waitFor(() => expect(Math.round(panel().getBoundingClientRect().left - bar.left)).toBe(120));
});

// Review Focus 1, on Palettes: the big size in a toolbar narrower than the pair's left plus 940px (a 1050px window with
// the side panel open) keeps its right edge 10px inside the toolbar's, and Colors brings it back under the pair. The
// window is wide enough that the big size floats under the toolbar rather than being a dialog.
test('on Palettes, in a toolbar too narrow for the big size at the pair, its right edge stays 10px inside; back on Colors it returns under the pair', async () => {
  await page.viewport(1400, 900);
  onTestFinished(() => page.viewport(414, 896));
  await vi.waitFor(() => expect(innerWidth).toBe(1400));
  const { workspace, panel } = await mount({ width: 800 });
  const bar = host.getBoundingClientRect();
  // The frame's right edge through its width's move, read at eleven points along it (seeked, not waited for: a busy
  // runner draws a frame or two in the move's 0.25s), and whether a width between the two sizes came up, so a switch
  // that never moved can't pass for one that kept inside. Paused at its start, the move waits a task first, so the
  // layer sees it running and anything it does meanwhile shows in the reads.
  const sample = async () => {
    await nextTick();
    const move = panel().getAnimations().find((a) => a.transitionProperty === 'width');
    expect(move).toBeDefined();
    move.pause();
    await new Promise((resolve) => setTimeout(resolve));
    const rights = [], widths = [];
    for (let i = 0; i <= 10; i++) {
      move.currentTime = i * 25;
      const at = panel().getBoundingClientRect();
      rights.push(at.right);
      widths.push(at.width);
    }
    move.finish();
    return { right: Math.max(...rights), between: widths.some((w) => w > 282 && w < 782) };
  };
  workspace.colorLayerPage = 'palettes';
  let moved = await sample(); // growing: its left comes first
  expect(moved.between).toBe(true);
  expect(moved.right).toBeLessThanOrEqual(bar.right - 10 + 0.5);
  await vi.waitFor(() => {
    const at = panel().getBoundingClientRect();
    expect(at.width).toBe(782); // the toolbar less 20px, border and all
    expect(Math.round(bar.right - at.right)).toBe(10);
  });
  workspace.colorLayerPage = 'colors';
  moved = await sample(); // shrinking: its left waits until it has
  expect(moved.between).toBe(true);
  expect(moved.right).toBeLessThanOrEqual(bar.right - 10 + 0.5);
  await vi.waitFor(() => {
    const at = panel().getBoundingClientRect();
    expect(Math.round(at.left - bar.left)).toBe(120);
    expect(at.width).toBe(282);
  });
});

// The toolbar resized while the frame shrinks back to Colors (the side panel's edge dragged, or the observer's first
// call coming late on a busy runner) doesn't move the left early either: it still waits for the width.
test('a toolbar resized during the shrink back to Colors leaves the left waiting for the width', async () => {
  await page.viewport(1400, 900);
  onTestFinished(() => page.viewport(414, 896));
  await vi.waitFor(() => expect(innerWidth).toBe(1400));
  const { workspace, panel } = await mount({ on: 'palettes', width: 800 });
  await new Promise((resolve) => setTimeout(resolve, 50));
  workspace.colorLayerPage = 'colors';
  await nextTick();
  const move = panel().getAnimations().find((a) => a.transitionProperty === 'width');
  move.pause(); // at its start, the frame as wide as Palettes
  await new Promise((resolve) => setTimeout(resolve));
  const seen = new Promise((resolve) => new ResizeObserver((_, observer) => { observer.disconnect(); resolve(); }).observe(host));
  host.style.width = '790px';
  await seen; // the layer's own observer, made first, has been called by now
  await nextTick();
  expect(panel().getBoundingClientRect().right).toBeLessThanOrEqual(host.getBoundingClientRect().right - 10 + 0.5);
  move.finish();
  await vi.waitFor(() => expect(Math.round(panel().getBoundingClientRect().left - host.getBoundingClientRect().left)).toBe(120));
});

// On a smaller window Palettes is a dialog, fixed, not in the toolbar: opened there (the settings column's Palettes
// link), the layer has no toolbar to measure until Colors, then sits under the pair and follows the toolbar's width.
test('opened on Palettes as a dialog, back on Colors it sits under the pair and follows the toolbar\'s width', async () => {
  await page.viewport(1000, 900);
  onTestFinished(() => page.viewport(414, 896));
  await vi.waitFor(() => expect(innerWidth).toBe(1000));
  const { workspace, panel } = await mount({ on: 'palettes', width: 700 });
  expect(getComputedStyle(panel()).position).toBe('fixed');
  workspace.colorLayerPage = 'colors';
  await nextTick();
  panel().getAnimations().forEach((move) => move.finish()); // the shrink and the fade, not waited for
  const bar = host.getBoundingClientRect();
  await vi.waitFor(() => expect(Math.round(panel().getBoundingClientRect().left - bar.left)).toBe(120));
  host.style.width = '300px'; // narrower than the pair's left and the layer
  await vi.waitFor(() => expect(Math.round(host.getBoundingClientRect().right - panel().getBoundingClientRect().right)).toBe(10));
});

// As the character palette layer: it closes with the drawing (nothing left over the start screen), and opened again with
// no drawing it sits over the start screen.
test('it closes when the drawing does, and opens again over the start screen', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 10 });
  host = document.body.appendChild(document.createElement('div'));
  app = createApp(EditWorkspace).use(i18n);
  app.mount(host);
  await nextTick();
  workspace.openColors('fg', 'palettes');
  await nextTick();
  expect(host.querySelector('article.edit-toolbar .color-layer')).not.toBe(null);
  project.clearImage(); // New project
  await vi.waitFor(() => {
    expect(host.querySelector('.color-layer')).toBe(null);
    expect(workspace.colorBox).toBe(null);
  });
  workspace.openColors('fg', 'palettes');
  await nextTick();
  expect(host.querySelector('div.layer-anchor > .color-layer')).not.toBe(null);
});

// The chips open their slot's Colors page: the other chip switches the slot, the same chip on Colors closes the layer, and
// on Palettes either chip goes to Colors (the chip's job is the picker).
test('a chip opens its slot\'s Colors page, closes it from Colors, and from Palettes goes to Colors', async () => {
  const { project, workspace, pinia } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 10 });
  host = document.body.appendChild(document.createElement('article'));
  Object.assign(host.style, { position: 'relative', width: '800px', height: '70px' });
  app = createApp({ render: () => [h(ColorPair), workspace.colorBox ? h(ColorLayer) : null] }).use(pinia).use(i18n);
  app.mount(host);
  const press = async (slot) => {
    host.querySelector(`button.chip.${slot}`).click();
    await nextTick();
  };
  const state = () => [workspace.colorBox, workspace.colorLayerPage, !!host.querySelector('.color-layer')];
  await press('fg');
  expect(state()).toEqual(['fg', 'colors', true]);
  await press('bg');
  expect(state()).toEqual(['bg', 'colors', true]);
  await press('bg');
  expect(state()).toEqual([null, 'colors', false]);
  workspace.openColors('fg', 'palettes');
  await nextTick();
  await press('fg');
  expect(state()).toEqual(['fg', 'colors', true]);
  workspace.colorLayerPage = 'palettes';
  await nextTick();
  await press('bg');
  expect(state()).toEqual(['bg', 'colors', true]);
});
