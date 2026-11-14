// The rulers and guides over a view (GuideRulers.vue), mounted alone over a stand-in view: guides sit on
// their character's edge or middle, only the Hand grabs them, they drag out of the rulers and back onto
// them to go, they hide past the drawing's edge, and the moving label counts from zero.
import { test, expect, afterEach } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import GuideRulers from '@/components/GuideRulers.vue';
import InputEditor from '@/components/InputEditor.vue';

let app = null, root = null;
afterEach(() => {
  app?.unmount();
  root?.remove();
  app = root = null;
});

// A 400 × 300 view with the drawing (20 × 10 characters, 10 × 20 px each) at left 50, top 40.
async function mount() {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 20, rows: 20 });
  workspace.rulers = true;
  root = Object.assign(document.createElement('div'), { style: 'position: fixed; left: 0; top: 0; width: 400px; height: 300px; overflow: hidden' });
  const display = Object.assign(document.createElement('div'), { style: 'position: absolute; left: 50px; top: 40px; width: 200px; height: 200px' });
  root.append(display);
  document.body.append(root);
  const coordsAt = (e) => {
    const r = display.getBoundingClientRect();
    return { x: (e.clientX - r.left) / 10, y: (e.clientY - r.top) / 10 };
  };
  const props = reactive({ box: { left: '0px', top: '0px', width: '400px', height: '300px' }, root, display, unit: { x: 10, y: 10 }, coordsAt, hover: null });
  app = createApp({ render: () => h(GuideRulers, props) }).use(getActivePinia()).use(i18n);
  app.mount(root.appendChild(document.createElement('div')));
  await nextTick();
  return { project, workspace, props, at: display.getBoundingClientRect() };
}

const pointer = (target, type, clientX, clientY) => target.dispatchEvent(new PointerEvent(type, { clientX, clientY, bubbles: true, button: 0 }));
const lineX = (guide) => guide.getBoundingClientRect().left + 5;   // the 1 px line in the middle of its 11 px grab area
function press(el) {
  const r = el.getBoundingClientRect();
  pointer(el, 'pointerdown', r.left + r.width / 2, r.top + r.height / 2);
}

test('a guide sits on its character edge, and on a middle', async () => {
  const { workspace, at } = await mount();
  workspace.addGuide('v', 3);
  await nextTick();
  expect(lineX(root.querySelector('.guide.v'))).toBe(at.left + 30);
  workspace.moveGuide(0, 3.5);
  await nextTick();
  expect(lineX(root.querySelector('.guide.v'))).toBe(at.left + 35);
});

test('only the Hand can grab them', async () => {
  const { workspace } = await mount();
  workspace.setActiveTool('pencil');
  workspace.addGuide('v', 3);
  await nextTick();
  const guide = root.querySelector('.guide.v');
  expect(root.querySelector('.guide-rulers').classList.contains('hand')).toBe(false);
  expect(getComputedStyle(guide).pointerEvents).toBe('none');
  workspace.holdTool('hand', 'space');
  await nextTick();
  expect(root.querySelector('.guide-rulers').classList.contains('hand')).toBe(true);
  expect(getComputedStyle(guide).pointerEvents).toBe('auto');
});

test('dragging out of the left ruler places a vertical guide where it is let go', async () => {
  const { workspace, at } = await mount();
  workspace.setActiveTool('hand');
  await nextTick();
  press(root.querySelector('.ruler.left'));
  pointer(window, 'pointermove', at.left + 52, at.top + 50);
  pointer(window, 'pointerup', at.left + 52, at.top + 50);
  expect(workspace.guides).toEqual([{ axis: 'v', pos: 5 }]);
});

test('a guide let go on a ruler is removed', async () => {
  const { workspace, at } = await mount();
  workspace.setActiveTool('hand');
  workspace.addGuide('v', 5);
  await nextTick();
  press(root.querySelector('.guide.v'));
  pointer(window, 'pointermove', at.left + 80, 10);
  await nextTick();
  expect(root.querySelector('.ruler-drag-pill').textContent).toBe('Remove');
  pointer(window, 'pointerup', at.left + 80, 10);
  expect(workspace.guides).toEqual([]);
});

test('the drag finishes after Space is let go', async () => {
  const { workspace, at } = await mount();
  workspace.setActiveTool('pencil');
  workspace.holdTool('hand', 'space');
  workspace.addGuide('v', 3);
  await nextTick();
  press(root.querySelector('.guide.v'));
  workspace.releaseTool();
  await nextTick();
  pointer(window, 'pointerup', at.left + 70, at.top + 50);
  expect(workspace.guides[0].pos).toBe(7);
});

test('guides past the edge hide and come back', async () => {
  const { project, workspace, at } = await mount();
  workspace.addGuide('v', 18);
  project.aspectLock = false;
  project.cols = 10;
  await nextTick();
  expect(root.querySelector('.guide.v')).toBe(null);
  project.cols = 20;
  await nextTick();
  expect(lineX(root.querySelector('.guide.v'))).toBe(at.left + 180);
});

test('the moving label reads the count from zero', async () => {
  const { workspace, props } = await mount();
  workspace.setRulerZero('x', 4.5);
  props.hover = { col: 4, row: 0 };
  await nextTick();
  expect(root.querySelector('.ruler-pill.top').textContent).toBe('0');
  props.hover = { col: 2, row: 0 };
  await nextTick();
  expect(root.querySelector('.ruler-pill.top').textContent).toBe('−2');
});

test('rulers off hides the guides', async () => {
  const { workspace } = await mount();
  workspace.addGuide('h', 2);
  await nextTick();
  expect(root.querySelector('.guide.h')).not.toBe(null);
  workspace.rulers = false;
  await nextTick();
  expect(root.querySelector('.guide')).toBe(null);
});

// A press on a ruler or a guide is kept from the view, which would take the focus itself: the view takes it here,
// or a toolbar field (the Rulers checkbox just clicked) would keep it and the tool keys after the drag do nothing.
test('a press on a ruler or a guide takes the focus to the view', async () => {
  const { workspace } = await mount();
  workspace.setActiveTool('hand');
  workspace.addGuide('v', 3);
  root.tabIndex = 0;
  const field = document.body.appendChild(Object.assign(document.createElement('input'), { type: 'checkbox' }));
  try {
    await nextTick();
    for (const el of [root.querySelector('.ruler.left'), root.querySelector('.guide.v')]) {
      field.focus();
      press(el);
      pointer(window, 'pointerup', 0, 0);
      expect(document.activeElement).toBe(root);
    }
  } finally {
    field.remove();
  }
});

// Zero past the drawing's edge is kept until it grows back: a press and release on its triangle, at the edge,
// doesn't move it there.
test('a click on a triangle keeps a zero past the edge', async () => {
  const { project, workspace, at } = await mount();
  workspace.setActiveTool('hand');
  project.updateCols(40);
  workspace.setRulerZero('x', 30);
  project.updateCols(20);
  expect(project.cols).toBe(20);
  await nextTick();
  const top = root.querySelector('.ruler.top');
  pointer(top, 'pointerdown', at.left + 200, 10);
  pointer(window, 'pointerup', at.left + 200, 10);
  expect(workspace.rulerZero.x).toBe(30);
});

test('a double-click on a triangle puts that zero back; on the corner, both', async () => {
  const { workspace, at } = await mount();
  workspace.setActiveTool('hand');
  workspace.setRulerZero('x', 4.5);
  workspace.setRulerZero('y', 3);
  await nextTick();
  const dblclick = (el, clientX, clientY) => el.dispatchEvent(new MouseEvent('dblclick', { clientX, clientY, bubbles: true }));
  const top = root.querySelector('.ruler.top'), left = root.querySelector('.ruler.left');
  dblclick(top, at.left + 100, 10);   // away from the triangle: nothing
  expect(workspace.rulerZero).toEqual({ x: 4.5, y: 3 });
  dblclick(top, at.left + 45, 10);
  expect(workspace.rulerZero).toEqual({ x: 0, y: 3 });
  dblclick(left, 15, at.top + 60);
  expect(workspace.rulerZero).toEqual({ x: 0, y: 0 });
  workspace.setRulerZero('x', 4.5);
  workspace.setRulerZero('y', 3);
  dblclick(root.querySelector('.ruler-corner'), 15, 10);
  expect(workspace.rulerZero).toEqual({ x: 0, y: 0 });
});

// Two fingers: the one that pressed the guide drags it; another touching down and lifting doesn't end the drag.
test('only the pointer that pressed moves and lets go', async () => {
  const { workspace, at } = await mount();
  workspace.setActiveTool('hand');
  workspace.addGuide('v', 3);
  await nextTick();
  const touch = (target, type, pointerId, clientX, clientY) => target.dispatchEvent(new PointerEvent(type, { pointerId, clientX, clientY, bubbles: true, button: 0, pointerType: 'touch' }));
  const guide = root.querySelector('.guide.v'), r = guide.getBoundingClientRect();
  touch(guide, 'pointerdown', 1, r.left + 5, r.top + 50);
  touch(window, 'pointermove', 2, at.left + 150, at.top + 50);
  touch(window, 'pointerup', 2, at.left + 150, at.top + 50);
  touch(window, 'pointercancel', 2, at.left + 150, at.top + 50);
  expect(workspace.guides[0].pos).toBe(3);
  touch(window, 'pointermove', 1, at.left + 70, at.top + 50);
  touch(window, 'pointerup', 1, at.left + 70, at.top + 50);
  expect(workspace.guides[0].pos).toBe(7);
});

test('zero dragged to an edge reads before the first column or after the last', async () => {
  const { workspace, at } = await mount();
  workspace.setActiveTool('hand');
  await nextTick();
  pointer(root.querySelector('.ruler.top'), 'pointerdown', at.left + 1, 10);
  const pill = async (x) => {
    pointer(window, 'pointermove', x, 10);
    await nextTick();
    return root.querySelector('.ruler-drag-pill').textContent;
  };
  expect(await pill(at.left + 2)).toBe('0 before column 1');
  expect(await pill(at.left + 100)).toBe('0 between columns 10 and 11');
  expect(await pill(at.left + 105)).toBe('0 on column 11');
  expect(await pill(at.left + 199)).toBe('0 after column 20');
  pointer(window, 'pointerup', at.left + 199, 10);
  expect(workspace.rulerZero.x).toBe(20);
});

test('in a real view the Brush and Eraser circle draws over the rulers, which stay under others\' cursors', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 20, rows: 20 });
  workspace.rulers = true;
  root = Object.assign(document.createElement('div'), { style: 'position: fixed; left: 0; top: 0; width: 400px; height: 300px' });
  document.body.append(root);
  app = createApp({ render: () => h(InputEditor) }).use(getActivePinia()).use(i18n);
  app.mount(root);
  await nextTick();
  const z = (selector) => Number(getComputedStyle(root.querySelector(selector)).zIndex);
  expect(z('.tool-preview')).toBeGreaterThan(z('.guide-rulers'));
  expect(z('.guide-rulers')).toBeLessThan(150);   // the room's layer (others' cursors, the pause) is 150
});

test('Ruler opacity fades the rulers and their corner, not the guides or the labels', async () => {
  const { workspace } = await mount();
  workspace.addGuide('v', 3);
  workspace.rulerOpacity = 40;
  await nextTick();
  const opacity = (selector) => getComputedStyle(root.querySelector(selector)).opacity;
  expect([opacity('canvas.ruler.top'), opacity('canvas.ruler.left'), opacity('.ruler-corner')]).toEqual(['0.4', '0.4', '0.4']);
  expect(opacity('.guide.v')).toBe('1');
});
