// The view's keys: Cmd/Ctrl+= and Cmd/Ctrl+- double and halve a view's zoom about its middle and Cmd/Ctrl+0 takes it back
// (100% in ANSI, the zoom it opens at in PIXEL), in place of the browser's page zoom; and the keys that scroll a view
// scroll it with nothing focused, as after a file opens, not only once it's been clicked.
import { test, expect, afterEach, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import InputEditor from '@/components/InputEditor.vue';
import AnsiEditor from '@/components/AnsiEditor.vue';
import { PIXEL_ZOOM_START } from '@/lib/zoom';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

const frames = (n = 3) => new Promise((resolve) => {
  const step = () => (--n ? requestAnimationFrame(step) : resolve());
  requestAnimationFrame(step);
});

// A 600 × 400 view of a 120 × 200 drawing, with the app's keys.
async function mount(tab) {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 120, rows: 200 });
  workspace.editorTab = tab;
  host = Object.assign(document.createElement('div'), { style: 'position: fixed; left: 0; top: 0; width: 600px; height: 400px; display: flex' });
  document.body.append(host);
  app = createApp({
    setup() {
      useKeyboardShortcuts(project, workspace);
      return () => (tab === 'input' ? h(InputEditor) : h(AnsiEditor, { view: tab }));
    },
  }).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  await settle(project);
  await frames();
  const view = host.querySelector('article');
  const display = view.querySelector('.canvas-container').firstElementChild; // the sizer
  // The point of the drawing (a fraction of it across and down) at the middle of the view.
  const middle = () => {
    const d = display.getBoundingClientRect(), v = view.getBoundingClientRect();
    return { x: (v.left + v.width / 2 - d.left) / d.width, y: (v.top + v.height / 2 - d.top) / d.height };
  };
  return { project, workspace, view, middle };
}

const press = (key, extra = {}) => {
  const e = new KeyboardEvent('keydown', { key, metaKey: true, cancelable: true, bubbles: true, ...extra });
  window.dispatchEvent(e);
  return e;
};

test('ANSI: Cmd+= doubles the zoom and Cmd+- halves it, about the middle of the view; Cmd+0 goes back to 100%', async () => {
  const { workspace, view, middle } = await mount('output');
  view.scrollTop += 300; // off the top, so the middle can stay put
  await frames();
  const was = middle();

  expect(press('=').defaultPrevented).toBe(true); // not the browser's page zoom
  await frames();
  expect(workspace.ansiZoom).toBe(2);
  expect(middle().x).toBeCloseTo(was.x, 2);
  expect(middle().y).toBeCloseTo(was.y, 2);

  press('-');
  press('-', { metaKey: false, ctrlKey: true });
  await frames();
  expect(workspace.ansiZoom).toBe(0.5);
  press('0');
  await frames();
  expect(workspace.ansiZoom).toBe(1);
  expect(middle().y).toBeCloseTo(was.y, 2);
});

test('PIXEL: the keys zoom it too, and Cmd+0 goes back to the zoom it opens at', async () => {
  const { workspace } = await mount('input');
  press('+');
  await frames();
  expect(workspace.editZoom).toBe(PIXEL_ZOOM_START * 2);
  press('0');
  await frames();
  expect(workspace.editZoom).toBe(PIXEL_ZOOM_START);
});

test('the zoom keys are the browser\'s in a field, with Alt, and off the art views', async () => {
  const { workspace } = await mount('output');
  const field = host.appendChild(document.createElement('input'));
  const inField = new KeyboardEvent('keydown', { key: '=', metaKey: true, cancelable: true, bubbles: true });
  field.dispatchEvent(inField);
  expect(press('=', { altKey: true }).defaultPrevented).toBe(false);
  workspace.editorTab = 'sauce';
  expect(press('=').defaultPrevented).toBe(false);
  expect(inField.defaultPrevented).toBe(false);
  expect(workspace.zoomRequest).toBe(null);
});

test('with nothing focused, Page Down, End and Home scroll the view, which takes the focus', async () => {
  const { view } = await mount('output');
  document.activeElement?.blur();
  view.scrollTop = 0;
  await userEvent.keyboard('{PageDown}');
  expect(document.activeElement).toBe(view);
  await vi.waitUntil(() => view.scrollTop > 200); // a smooth scroll
  await userEvent.keyboard('{End}');
  await vi.waitUntil(() => view.scrollTop === view.scrollHeight - view.clientHeight);
  await userEvent.keyboard('{Home}');
  await vi.waitUntil(() => view.scrollTop === 0);
});

test('a focused control keeps its keys: Home on a button doesn\'t move the focus to the view', async () => {
  const { view } = await mount('output');
  const button = host.appendChild(document.createElement('button'));
  button.focus();
  await userEvent.keyboard('{Home}');
  expect(document.activeElement).toBe(button);
  expect(document.activeElement).not.toBe(view);
});
