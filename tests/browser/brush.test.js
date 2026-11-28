// The soft Brush's Flow slider: each stamp lays the slider's value squared (never less than the paint
// layer's smallest step), so its low end builds up gently and 100% is as it always was.
import { describe, test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import brush from '@/tools/brush';

async function paint(moves, { size = 5, flow, hardness = 50 }) {
  const { project, workspace } = await createTestApp();
  project.cols = 40;
  project.rows = 40;
  await project.setBlankCanvas({ withLayer: true });
  await settle(project);
  workspace.editorTab = 'input';
  Object.assign(workspace, { editBrushSize: size, editBrushFlow: flow, editBrushHardness: hardness });
  const ctx = { project, workspace, view: 'input' };
  brush.begin(ctx, moves[0]);
  for (let i = 1; i < moves.length; i++) brush.move(ctx, moves[i - 1], moves[i]);
  brush.end(ctx);
  const at = (x, y) => Math.round((project.paintLayer.pixelAt(x, y)?.a ?? 0) * 255); // the layer keeps alpha as a byte
  return Object.assign(at, { workspace });
}

const click = { x: 20.5, y: 20.5 };
const across = [{ x: 5, y: 20.5 }, { x: 35, y: 20.5 }];

test('Flow squared: a dab at 50% lays a quarter, 100% covers, and the bottom of the slider still paints', async () => {
  expect((await paint([click], { flow: 50 }))(20, 20)).toBe(64);
  expect((await paint([click], { flow: 100 }))(20, 20)).toBe(255);
  expect((await paint([click], { flow: 1 }))(20, 20)).toBe(1);
});

test('the low end builds up gently: one pass at 10% lays a little, where it used to lay most of the way', async () => {
  expect((await paint(across, { flow: 10 }))(20, 20)).toBeLessThan(0.2 * 255);
  expect((await paint(across, { flow: 25 }))(20, 20)).toBeLessThan(0.75 * 255);
});

test('at 100% Flow and Hardness a stroke is solid right out to its edge, as it always was', async () => {
  const at = await paint(across, { size: 10, flow: 100, hardness: 100 });
  expect(Array.from({ length: 9 }, (_, i) => at(20, 16 + i))).toEqual(Array(9).fill(255));
});

// A stroke builds up the same on the base as on a layer: within it, its dabs add up as they do on a layer's clear
// pixels, and the stroke is then laid over what was there, rather than each dab blending into the opaque pixel
// (which left white paint on the base's black a dimmer gray than on a layer over it).
for (const hardness of [100, 0]) {
  test(`a white stroke on the base shows as it does on a layer over it (hardness ${hardness})`, async () => {
    const shown = async (layer) => {
      const { project, workspace } = await createTestApp();
      await project.setBlankCanvas({ cols: 20, rows: 20 });
      await settle(project);
      workspace.editorTab = 'input';
      workspace.pickLayer(layer);
      Object.assign(workspace, { editFgColor: '#ffffff', editBrushSize: 6, editBrushHardness: hardness, editBrushOpacity: 100 });
      const ctx = { project, workspace, view: 'input' };
      brush.begin(ctx, { x: 10, y: 10 }, {});
      brush.move(ctx, { x: 10, y: 10 }, { x: 10, y: 10.5 });
      brush.end(ctx);
      await settle(project);
      return [8, 9, 10, 11, 12].flatMap((col) => { const cell = project.cells[col + 5 * 20]; return [parseInt(cell.fg.hex.slice(1, 3), 16), parseInt(cell.bg.hex.slice(1, 3), 16)]; });
    };
    const onLayer = await shown('edit'), onBase = await shown('base');
    expect(onLayer.some((v) => v > 100)).toBe(true);
    onBase.forEach((v, i) => expect(Math.abs(v - onLayer[i])).toBeLessThanOrEqual(2));
  });
}

// A stroke over paint that's partly see-through shows as it does on a layer above that paint: the stroke builds up as on
// clear pixels and is laid over the paint (the alpha of the two as two layers', not their sum), so the picture under
// shows through as much (maya-13: soft red over 50% white came out near-white on the white's own layer).
for (const hardness of [100, 10]) {
  test(`a soft stroke over 50% white paint shows the same on the white's own layer as on the layer above (hardness ${hardness})`, async () => {
    const shown = async (above) => {
      const { project, workspace } = await createTestApp();
      await project.setBlankCanvas({ cols: 20, rows: 20, withLayer: true });
      await settle(project);
      workspace.editorTab = 'input';
      const ctx = { project, workspace, view: 'input' };
      const stroke = (from, to) => {
        brush.begin(ctx, from, {});
        brush.move(ctx, from, to);
        brush.end(ctx);
      };
      Object.assign(workspace, { editFgColor: '#ffffff', editBrushSize: 8, editBrushHardness: 100, editBrushOpacity: 50, editBrushStack: true });
      stroke({ x: 2, y: 18 }, { x: 18, y: 18 });
      if (above) workspace.pickLayer(project.addLayer('cells', workspace.pickedLayer));
      Object.assign(workspace, { editFgColor: '#ff5555', editBrushSize: 4, editBrushHardness: hardness, editBrushOpacity: 40 });
      stroke({ x: 2, y: 18.5 }, { x: 18, y: 18.5 });
      await settle(project);
      return [6, 8, 10].flatMap((col) => { const cell = project.cells[col + 9 * 20]; return [cell.fg.hex, cell.bg.hex]; })
        .flatMap((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
    };
    const onLayerAbove = await shown(true), onOwnLayer = await shown(false);
    expect(onLayerAbove.some((v, i) => i % 3 && v < 200)).toBe(true); // green and blue: the black shows through
    onOwnLayer.forEach((v, i) => expect(Math.abs(v - onLayerAbove[i])).toBeLessThanOrEqual(3));
  });
}

// docs/model.md R13: Monochrome ASCII shows a pin as its character in white on black, so paint on the base can't recolor
// it: the paint takes the pin of every cell it lands in, and the cell converts again. The report
// (projects/ascii-pinned-paint.phosphor): a drawing flattened onto the base, every cell pinned, in Monochrome ASCII, where
// the Brush showed only over the pinned ▄s (pixels outside ANSI).
describe('R13: paint on the base in Monochrome ASCII takes the pins', () => {
  const open = async (renderStyle) => {
    const { project, workspace } = await createTestApp();
    await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/ascii-pinned-paint.phosphor')).arrayBuffer()], 'x.phosphor'));
    await settle(project);
    if (renderStyle) project.renderStyle = renderStyle;
    await settle(project);
    return { project, workspace };
  };
  const shown = (project, col, row) => project.cells[row * project.cols + col].char;
  // Row 0: pinned spaces at 0-1, '.' at 76, '%' at 77, '@' at 86-87, '#' at 126.
  const CELLS = [0, 1, 76, 77, 86, 87, 126];
  const halves = (cols) => cols.flatMap((col) => [{ x: col, y: 0, alpha: 1 }, { x: col, y: 1, alpha: 1 }]);

  test('the report: white over pinned spaces shows, black over pinned characters clears them, and undo brings the pins back', async () => {
    const { project } = await open();
    expect(project.renderStyle).toBe('ascii');
    expect(CELLS.map((col) => shown(project, col, 0))).toEqual([' ', ' ', '.', '%', '@', '@', '#']);
    project.paintStroke(halves([0, 1]), '#ffffff');
    project.paintStroke(halves([76, 77, 86, 87, 126]), '#000000');
    project.commitEdit();
    await settle(project);
    expect(CELLS.map((col) => project.baseRecords.pins.has(`${col},0`))).toEqual(Array(7).fill(false));
    expect(CELLS.map((col) => shown(project, col, 0))).toEqual(['@', '@', ' ', ' ', ' ', ' ', ' ']);
    expect(project.baseRecords.pins.get('2,0')).toBe(' '); // a cell the paint missed keeps its pin
    project.paintStroke([{ x: 202, y: 8, alpha: 1 }, { x: 202, y: 9, alpha: 1 }], '#ffffff'); // a pinned ▄ is pixels already: it converts, and keeps its pin for ANSI
    project.commitEdit();
    await settle(project);
    expect([project.baseRecords.pins.get('202,4'), shown(project, 202, 4)]).toEqual(['▄', '@']);
    project.undo();
    await settle(project);
    expect(project.baseRecords.pins.size).toBe(19200 - 7);
    project.undo();
    await settle(project);
    expect(project.baseRecords.pins.size).toBe(19200);
    expect(CELLS.map((col) => shown(project, col, 0))).toEqual([' ', ' ', '.', '%', '@', '@', '#']);
  });

  // The owner's screenshot: a soft stroke's edge left dashes across the black. A pinned space's two pixels are its
  // background over its foreground (black over white); the PIXEL view draws its look over them (R11), but a pin the paint
  // took showed them bare. The cell keeps its look in its pixels as the pin goes: half a cell painted leaves the other
  // half as it showed.
  test('a cell the paint only half covers keeps the look it had in its other half, with no bands', async () => {
    const { project } = await open();
    const looks = [0, 86].map((col) => project.renderer.baseLook(col, 0, project.processParams));
    expect(project.baseColorAt(0, 1)).toBe('#ffffff'); // the pinned space's stored foreground, under its black look
    project.paintStroke([{ x: 0, y: 0, alpha: 1 }, { x: 86, y: 0, alpha: 1 }], '#ffffff'); // the top halves alone
    project.commitEdit();
    await settle(project);
    const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    expect([project.baseColorAt(0, 1), project.baseColorAt(86, 1)]).toEqual([hex(looks[0][1]), hex(looks[1][1])]);
    expect(project.baseColorAt(0, 1)).toBe('#000000');
  });

  // The owner's second screenshot: soft white strokes over white already painted drew a black rim. The first stroke had
  // made the cells pinned ▄s; the next one wrote each block again from its look, which in Monochrome ASCII has no
  // colors, so the block went in black and the soft edge blended over it. A block takes the colors the cell shows.
  test('a soft white stroke over white already painted stays white', async () => {
    const { project, workspace } = await open();
    workspace.editorTab = 'input';
    const ctx = { project, workspace, view: 'input' };
    const stroke = (a, b, size, hardness) => {
      Object.assign(workspace, { editFgColor: '#ffffff', editBrushSize: size, editBrushHardness: hardness, editBrushOpacity: 100, editBrushFlow: 100 });
      brush.begin(ctx, a, {});
      brush.move(ctx, a, b);
      brush.end(ctx);
    };
    stroke({ x: 80, y: 40 }, { x: 120, y: 40 }, 30, 100); // a hard white area over the hand's characters
    stroke({ x: 90, y: 36 }, { x: 110, y: 44 }, 8, 20); // a soft stroke inside it
    await settle(project);
    const dark = [];
    for (let y = 32; y <= 48; y++) for (let x = 86; x <= 114; x++) if (project.baseColorAt(x, y) !== '#ffffff') dark.push(`${x},${y} ${project.baseColorAt(x, y)}`);
    expect(dark).toEqual([]);
  });

  test('the Eraser on the base, soft or in the PIXEL view, takes the pins too', async () => {
    const { project } = await open();
    project.eraseEditPixels([{ x: 86, y: 0, alpha: 0.5 }, { x: 86, y: 1, alpha: 0.5 }, { x: 87, y: 0 }, { x: 87, y: 1 }]);
    project.commitEdit();
    await settle(project);
    expect([86, 87].map((col) => project.baseRecords.pins.has(`${col},0`))).toEqual([false, false]);
    expect(shown(project, 87, 0)).toBe(' ');
  });

  for (const renderStyle of ['ansi', 'colorAscii']) {
    test(`in ${renderStyle} the paint recolors the pins and they stay (R2)`, async () => {
      const { project } = await open(renderStyle);
      project.paintStroke(halves([0, 86]), '#ff0000');
      project.commitEdit();
      await settle(project);
      expect(project.baseRecords.pins.get('0,0')).toBe(' ');
      expect(project.baseRecords.pins.get('86,0')).toBe('@');
      expect(shown(project, 86, 0)).toBe('@');
    });
  }
});

test('a pen\'s pressure: a light press lays a thinner, fainter stroke than a firm one; no pressure, as a firm one', async () => {
  const pen = (pressure) => across.map((p) => ({ ...p, pressure }));
  const firm = await paint(pen(1), { size: 10, flow: 50 }), light = await paint(pen(0.3), { size: 10, flow: 50 });
  expect(light(20, 20)).toBeLessThan(firm(20, 20));   // fainter
  expect(firm(20, 17)).toBeGreaterThan(0);
  expect(light(20, 17)).toBe(0);                      // and thinner
  expect(light.workspace.strokeEnd).toEqual({ x: 35, y: 20.5 }); // where it ended, not how hard: a Shift-click line has its own
  const mouse = await paint(across, { size: 10, flow: 50 });
  expect([mouse(20, 20), mouse(20, 17)]).toEqual([firm(20, 20), firm(20, 17)]);
});
