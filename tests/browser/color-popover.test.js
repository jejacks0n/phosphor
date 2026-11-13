// The color box with a palette: a swatch the sliders can't make shows its palette color, can't be picked, and says
// why; the others paint their palette colors.
import { test, expect } from 'vitest';
import { createApp } from 'vue';
import { createTestApp, settle } from '../support/app.js';
import ColorPopover from '@/components/ColorPopover.vue';
import { i18n } from '@/i18n';

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
