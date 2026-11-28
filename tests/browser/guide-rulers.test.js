// The rulers and guides over a view (GuideRulers.vue), mounted alone over a stand-in view: guides sit on
// their character's edge or middle, the rulers take the pointer with any tool and a guide over the art only with
// the Hand, they drag out of the rulers and back onto
// them to go, they hide past the drawing's edge, and the moving label counts from zero.
import { test, expect, afterEach } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
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
  const { project, workspace, pinia } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
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
  app = createApp({ render: () => h(GuideRulers, props) }).use(pinia).use(i18n);
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

// The rulers and their corner take the pointer whatever the tool, so a guide comes out of them and zero moves with
// the Brush as with the Hand (#315); a guide lying over the art only with the Hand, so it doesn't catch strokes.
test('the rulers take the pointer with any tool, a guide over the art only with the Hand', async () => {
  const { workspace } = await mount();
  workspace.setActiveTool('pencil');
  workspace.addGuide('v', 3);
  await nextTick();
  const guide = root.querySelector('.guide.v'), takes = (el) => getComputedStyle(el).pointerEvents;
  expect(root.querySelector('.guide-rulers').classList.contains('hand')).toBe(false);
  expect([takes(root.querySelector('.ruler.top')), takes(root.querySelector('.ruler.left')), takes(root.querySelector('.ruler-corner'))]).toEqual(['auto', 'auto', 'auto']);
  expect(takes(guide)).toBe('none');
  workspace.holdTool('hand', 'space');
  await nextTick();
  expect(root.querySelector('.guide-rulers').classList.contains('hand')).toBe(true);
  expect(takes(guide)).toBe('auto');
});

// The middle button pans wherever it's pressed: on a ruler or the corner it goes on to the view, while the left
// button's press stays with them.
test('a middle press on a ruler goes on to the view; a left press doesn\'t', async () => {
  const { workspace, at } = await mount();
  workspace.setActiveTool('brush');
  await nextTick();
  const reached = [];
  root.addEventListener('pointerdown', (e) => reached.push(e.button));
  for (const el of [root.querySelector('.ruler.top'), root.querySelector('.ruler-corner')]) {
    for (const button of [1, 0]) el.dispatchEvent(new PointerEvent('pointerdown', { clientX: at.left + 100, clientY: 10, bubbles: true, button }));
    pointer(window, 'pointerup', at.left + 100, 10);
  }
  expect(reached).toEqual([1, 1]);
  expect(workspace.guides).toEqual([]);
});

// Guides are placed and moved with the Hand alone (or Space held): with another tool a ruler's press, but on its
// triangle, places nothing, and it's still kept from the view, which would draw; the ruler shows an arrow there.
test('without the Hand a ruler places no guide and keeps the press, while its triangle moves zero', async () => {
  const { workspace, at } = await mount();
  workspace.setActiveTool('brush');
  await nextTick();
  const top = root.querySelector('.ruler.top'), cursor = () => getComputedStyle(top).cursor;
  const reached = [];
  root.addEventListener('pointerdown', () => reached.push('view'));
  pointer(top, 'pointermove', at.left + 100, 10);
  await nextTick();
  expect(cursor()).toBe('default');
  pointer(top, 'pointerdown', at.left + 100, 10);
  pointer(window, 'pointermove', at.left + 100, at.top + 50);
  pointer(window, 'pointerup', at.left + 100, at.top + 50);
  expect(workspace.guides).toEqual([]);
  expect(reached).toEqual([]);
  pointer(top, 'pointermove', at.left + 1, 10);
  await nextTick();
  expect(cursor()).toBe('grab');
  pointer(top, 'pointerdown', at.left + 1, 10);
  pointer(window, 'pointermove', at.left + 52, 10);
  pointer(window, 'pointerup', at.left + 52, 10);
  expect(workspace.rulerZero.x).toBe(5);
  workspace.setActiveTool('hand');
  pointer(top, 'pointermove', at.left + 100, 10);
  await nextTick();
  expect(cursor()).toBe('s-resize');
});

test('with the Pencil, a drag from the corner moves both zeros', async () => {
  const { workspace, at } = await mount();
  workspace.setActiveTool('pencil');
  await nextTick();
  press(root.querySelector('.ruler-corner'));
  pointer(window, 'pointermove', at.left + 52, at.top + 62);
  pointer(window, 'pointerup', at.left + 52, at.top + 62);
  expect(workspace.rulerZero).toEqual({ x: 5, y: 3 });
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

test('a double-click on a triangle puts that zero back', async () => {
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
});

// The corner's ⋯ menu, with any tool: Reset positions puts both zeros back (there's nothing to put back at the top
// left), and Mirror mode switches mirror mode, checked while it's on.
test('the corner\'s menu resets both zeros and switches mirror mode', async () => {
  const { workspace } = await mount();
  workspace.setActiveTool('pencil');
  const item = (name) => [...document.querySelectorAll('.dropdown-content button')].find((b) => b.textContent.includes(name));
  const open = async () => {
    root.querySelector('.ruler-corner .dropdown-trigger').click();
    await nextTick();
  };
  await open();
  expect(item('Reset positions').disabled).toBe(true);
  item('Mirror mode').click();
  await nextTick();
  expect(workspace.mirror).toBe(true);
  workspace.setRulerZero('x', 4.5);
  workspace.setRulerZero('y', 3);
  await open();
  expect(item('Mirror mode').getAttribute('aria-checked')).toBe('true');
  item('Reset positions').click();
  await nextTick();
  expect(workspace.rulerZero).toEqual({ x: 0, y: 0 });
});

// A triangle shows it can be grabbed: an open hand over it, a closed one while it's dragged; the rest of the
// ruler keeps its arrow for pulling out a guide.
test('a hand over a triangle, closed while dragging it', async () => {
  const { workspace, at } = await mount();
  workspace.setActiveTool('hand');
  workspace.setRulerZero('x', 4.5);
  await nextTick();
  const top = root.querySelector('.ruler.top'), cursor = () => getComputedStyle(top).cursor;
  pointer(top, 'pointermove', at.left + 100, 10);
  await nextTick();
  expect(cursor()).toBe('s-resize');
  pointer(top, 'pointermove', at.left + 45, 10);
  await nextTick();
  expect(cursor()).toBe('grab');
  pointer(top, 'pointerdown', at.left + 45, 10);
  pointer(window, 'pointermove', at.left + 100, 10);
  await nextTick();
  expect(cursor()).toBe('grabbing');
  pointer(window, 'pointerup', at.left + 100, 10);
  await nextTick();
  expect(cursor()).toBe('grab');   // the triangle came along under the pointer
  pointer(top, 'pointerleave', at.left + 100, 10);
  await nextTick();
  expect(cursor()).toBe('s-resize');
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
  const { project, workspace, pinia } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  workspace.rulers = true;
  root = Object.assign(document.createElement('div'), { style: 'position: fixed; left: 0; top: 0; width: 400px; height: 300px' });
  document.body.append(root);
  app = createApp({ render: () => h(InputEditor) }).use(pinia).use(i18n);
  app.mount(root);
  await nextTick();
  const z = (selector) => Number(getComputedStyle(root.querySelector(selector)).zIndex);
  expect(z('.tool-preview')).toBeGreaterThan(z('.guide-rulers'));
  expect(z('.guide-rulers')).toBeLessThan(150);   // the room's layer (others' cursors, the pause) is 150
});

// The pointer over a ruler is the ruler's, with its own cursor: the tool's outline (and its hidden pointer) shows only
// off them, and not while a guide or zero is dragged out of them over the art (#315).
test('in a real view a tool\'s outline hides over the rulers and while one is dragged from', async () => {
  const { project, workspace, pinia } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  workspace.rulers = true;
  workspace.setActiveTool('brush');
  root = Object.assign(document.createElement('div'), { style: 'position: fixed; left: 0; top: 0; width: 400px; height: 300px; display: flex' });
  document.body.append(root);
  app = createApp({ render: () => h(InputEditor) }).use(pinia).use(i18n);
  app.mount(root);
  await nextTick();
  await new Promise(requestAnimationFrame);
  const view = root.querySelector('article[data-art]'), art = root.querySelector('.pixel-display').getBoundingClientRect();
  const x = art.left + art.width / 2, y = art.top + art.height / 2;
  const shown = async () => {
    await nextTick();
    return getComputedStyle(root.querySelector('.tool-preview')).display !== 'none';
  };
  view.dispatchEvent(new MouseEvent('mouseenter', { clientX: x, clientY: y }));
  pointer(view, 'pointermove', x, y);
  expect(await shown()).toBe(true);
  const top = root.querySelector('.ruler.top'), r = top.getBoundingClientRect();
  pointer(top, 'pointermove', x, r.top + 10);
  expect(await shown()).toBe(false);
  pointer(view, 'pointermove', x, y);
  expect(await shown()).toBe(true);
  const corner = root.querySelector('.ruler-corner').getBoundingClientRect();
  pointer(root.querySelector('.ruler-corner'), 'pointerdown', corner.left + 5, corner.top + 5);   // both zeros, dragged over the art
  pointer(view, 'pointermove', x, y);
  expect(await shown()).toBe(false);
  expect(view.classList.contains('ruler-drag')).toBe(true);   // a closed hand meanwhile (global.css)
  pointer(window, 'pointerup', x, y);
  pointer(view, 'pointermove', x + 1, y);
  expect(await shown()).toBe(true);
  expect(view.classList.contains('ruler-drag')).toBe(false);
  expect(workspace.rulerZero.x).toBeGreaterThan(0);
  expect(workspace.guides).toEqual([]);
  expect(project.canUndo).toBe(false);   // nothing was drawn
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
