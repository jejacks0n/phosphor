// The color layer: the color box in the character palette layer's frame (FloatingPanel), opened under the toolbar at the
// color pair's left, never past the toolbar's right edge, and one at a time with the character palette layer.
import { test, expect, vi, afterEach, onTestFinished } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { i18n } from '@/i18n';
import ColorLayer from '@/components/ColorLayer.vue';
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
async function mount({ slot = 'fg', width = 800, pair = 120, before } = {}) {
  const { project, workspace, pinia } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 10 });
  await before?.({ project, workspace });
  host = document.body.appendChild(document.createElement('article'));
  host.className = 'edit-toolbar';
  Object.assign(host.style, { position: 'relative', width: `${width}px`, height: '70px' });
  const chips = host.appendChild(document.createElement('div'));
  chips.className = 'color-pair';
  Object.assign(chips.style, { position: 'absolute', left: `${pair}px`, top: '10px', width: '42px', height: '30px' });
  workspace.openColors(slot);
  app = createApp({ render: () => (workspace.colorBox ? h(ColorLayer) : null) }).use(pinia).use(i18n);
  app.mount(host.appendChild(document.createElement('div')));
  await nextTick();
  return { project, workspace, panel: () => host.querySelector('.color-layer') };
}

test('it opens under the toolbar at the pair\'s left, 260px wide, with the Colors tab', async () => {
  const { panel } = await mount();
  const bar = host.getBoundingClientRect(), at = panel().getBoundingClientRect();
  expect(Math.round(at.left - bar.left)).toBe(120);
  expect(Math.round(at.top)).toBe(Math.round(bar.bottom + 2));
  expect(getComputedStyle(panel()).width).toBe('260px');
  expect([...panel().querySelectorAll('[role="tab"]')].map((tab) => tab.textContent.trim())).toEqual(['Colors']);
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
  const { panel } = await mount({ width: 300 });
  const bar = host.getBoundingClientRect(), at = panel().getBoundingClientRect();
  expect(at.right).toBeLessThanOrEqual(bar.right - 10);
  expect(getComputedStyle(panel()).width).toBe('260px');
  expect(at.left).toBeGreaterThanOrEqual(bar.left + 10);
  host.style.width = '800px';
  await vi.waitFor(() => expect(Math.round(panel().getBoundingClientRect().left - bar.left)).toBe(120));
});
