// Where the ANSI view starts: art that doesn't fit shows from its top-left, as a terminal shows a file (the first line,
// not the middle of the file); art that fits is centered; a new document starts again the same way, even with the view
// already showing and scrolled.
import { test, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import AnsiEditor from '@/components/AnsiEditor.vue';

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

// The ANSI view of a cols × lines drawing, in a 600 × 400 box.
async function mount(cols, lines) {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols, rows: 2 * lines });
  workspace.editorTab = 'output';
  host = Object.assign(document.createElement('div'), { style: 'position: fixed; left: 0; top: 0; width: 600px; height: 400px; display: flex' });
  document.body.append(host);
  app = createApp({ render: () => h(AnsiEditor, { view: 'output' }) }).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  await settle(project);
  await frames();
  const view = host.querySelector('article');
  // The art's edges against the view's.
  const where = () => {
    const d = view.querySelector('.canvas-container').firstElementChild.getBoundingClientRect(), v = view.getBoundingClientRect();
    return { left: d.left - v.left, top: d.top - v.top, right: v.right - d.right, bottom: v.bottom - d.bottom };
  };
  return { project, workspace, view, where };
}

test('a file taller and wider than the view opens at its top-left', async () => {
  const { workspace, where } = await mount(200, 300);
  expect(where().top).toBeCloseTo(0, 0);
  expect(where().left).toBeCloseTo(0, 0);
  expect(workspace.ansiViewOrigin).toEqual({ col: 0, row: 0 });
});

test('with the rulers on, it opens beside them', async () => {
  const { project, workspace, where } = await mount(200, 300);
  workspace.rulers = true;
  await project.setBlankCanvas({ withLayer: true, cols: 200, rows: 600 });   // a new document, so it starts again
  await settle(project);
  await frames();
  expect(where().top).toBeCloseTo(20, 0);
  expect(where().left).toBeCloseTo(30, 0);
});

test('art that fits is centered', async () => {
  const { where } = await mount(10, 5);
  const { left, right, top, bottom } = where();
  expect(left).toBeGreaterThan(0);
  expect(left).toBeCloseTo(right, 0);
  expect(top).toBeCloseTo(bottom, 0);
});

test('a new document starts at the top again, though the view was scrolled down', async () => {
  const { project, view, where } = await mount(200, 300);
  view.scrollTop += 2000;
  view.scrollLeft += 500;
  await frames();
  expect(where().top).toBeLessThan(-1000);
  await project.setBlankCanvas({ withLayer: true, cols: 150, rows: 800 });
  await settle(project);
  await frames();
  expect(where().top).toBeCloseTo(0, 0);
  expect(where().left).toBeCloseTo(0, 0);
});
