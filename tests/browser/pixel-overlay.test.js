// The PIXEL view's overlay of the ANSI cells: every cell with All cells, else the cells layers' own. Which cells are the
// layers' is worked out only while All cells is off (a file opened has 500k), and again when it's turned off.
import { test, expect, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { parseKey } from '@/document/editCells';
import InputEditor from '@/components/InputEditor.vue';

vi.mock('@/document/editCells', { spy: true });

const COLS = 20, ROWS = 20, RED = { fg: '#ff0000', bg: '#ff0000' };

async function mounted() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: COLS, rows: ROWS });
  Object.assign(workspace, { editorTab: 'input', ansiOverlay: 100 });
  const host = document.createElement('div');
  host.style.cssText = 'width:400px;height:400px;position:fixed;left:0;top:0';
  document.body.append(host);
  const app = createApp({ render: () => h(InputEditor) });
  app.use(getActivePinia());
  app.mount(host);
  await nextTick();
  await settle(project);
  const canvas = host.querySelector('canvas');
  // A grid pixel's color as the view shows it.
  const seen = (x, y) => {
    const { width, height } = canvas, c = canvas.getContext('2d');
    return [...c.getImageData(Math.floor((x + 0.5) * (width / COLS)), Math.floor((y + 0.5) * (height / ROWS)), 1, 1).data].slice(0, 3);
  };
  return { project, workspace, seen, done: () => { app.unmount(); host.remove(); } };
}

test('All cells finds no layer\'s cells; turned off, it shows the layers\' cells typed while it was on, and no others', async () => {
  const { project, workspace, seen, done } = await mounted();
  workspace.ansiOverlay = 0;
  await settle(project);
  const picture = seen(5, 4); // a generated cell's grid pixel with no overlay
  Object.assign(workspace, { ansiOverlay: 100, ansiOverlayAll: true });
  await settle(project);
  vi.mocked(parseKey).mockClear();
  project.typeAt(5, 3, 'A', RED);
  project.commitEdit();
  await settle(project);
  const parsed = vi.mocked(parseKey).mock.calls.length; // the redraw's own, not the overlay's

  workspace.ansiOverlayAll = false;
  await settle(project);
  expect(seen(5, 6)).toEqual([255, 0, 0]); // the typed cell, both its grid pixels
  expect(seen(5, 7)).toEqual([255, 0, 0]);
  expect(seen(5, 4)).toEqual(picture); // no overlay over a generated cell
  expect(project.cells[3 * COLS + 5].fg.hex).toBe('#ff0000');

  // The same edit with All cells off: the overlay reads every layer cell's key too.
  vi.mocked(parseKey).mockClear();
  project.typeAt(6, 3, 'B', RED);
  project.commitEdit();
  await settle(project);
  expect(vi.mocked(parseKey).mock.calls.length).toBe(parsed + project.editCells.size);
  expect(seen(6, 6)).toEqual([255, 0, 0]);
  done();
});
