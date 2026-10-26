/* global __BENCH_HUGE__ */
// How the editor scales with the document: timings and memory for whole-document work (render,
// recomposite, paint, typing, fill, undo, merge, save, load, export) and the canvas and DOM views,
// from today's largest grid to 80 x 10,000 lines and 1000 x 1000. Asserts nothing: it prints a table.
// Run: npx vitest run --config bench/vitest.config.js --silent=false (docs/investigations/viewport-rendering.md).
import { test } from 'vitest';
import { createTestApp } from '../tests/support/app.js';
import { loadImage, writeProject, readProject } from '@/document/projectIO';
import { baseParams } from '@/store/settings';
import { ctx2d } from '@/lib/Canvas';
import CellCanvas from '@/lib/CellCanvas';
import { render as renderText } from '@/lib/TextRenderer';
import { getContext, calcMetrics } from '@/lib/AnsiRuntime';
import { floodFill } from '@/lib/FloodFill';
import { AnsiFile } from '@/lib/AnsiFile';
import { layoutWide } from '@/lib/Cells';
import bucket from '@/tools/bucket';

// [cols, lines]: today's largest (300 x 300 pixel rows), then bigger.
const SIZES = [[300, 150], [100, 1000], [80, 10_000], [1000, 1000]];

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
async function settled(project) {
  await frame();
  while (project._renderQueued || project._rendering) await frame();
  await frame();
}
const heapMB = () => {
  globalThis.gc?.();
  return Math.round(performance.memory.usedJSHeapSize / 1e6);
};
// ms per call (averaged over n), or the error's message.
async function time(fn, n = 1) {
  try {
    const t = performance.now();
    for (let i = 0; i < n; i++) await fn(i);
    return +((performance.now() - t) / n).toFixed(1);
  } catch (error) {
    return `ERROR ${error.message}`;
  }
}

// A black picture: the document is a blank canvas, so a fill covers all of it (the worst case).
async function blankDocument(cols, lines) {
  const app = await createTestApp();
  const picture = Object.assign(document.createElement('canvas'), { width: 400, height: 400 });
  const ctx = ctx2d(picture);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 400, 400);
  const blob = await new Promise((resolve) => picture.toBlob(resolve, 'image/png'));
  app.open = async () => {
    app.project.replaceImage(await loadImage(blob), await blob.arrayBuffer(), { cols, rows: 2 * lines, aspectLock: false, filename: 'bench' });
    app.project.render();
    await settled(app.project);
  };
  return app;
}

// Cells that differ from their neighbors (characters and colors), for the views and export: a blank
// document's cells are all alike, which makes those look cheaper than a real drawing.
const COLORS = Array.from({ length: 64 }, (_, i) => {
  const r = (i * 37) % 256, g = (i * 91) % 256, b = (i * 53) % 256;
  return { r, g, b, hex: `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`, c: [r, g, b] };
});
const CHARS = [...'░▒▓█▀▄ABCxyz@#-=|/\\~'];
const variedCells = (n) => Array.from({ length: n }, (_, i) => ({ char: CHARS[i % CHARS.length], fg: COLORS[i % 64], bg: COLORS[(i * 7 + 3) % 64] }));

const layerMB = (layer) => layer ? +((layer.canvas.width * layer.canvas.height * 4) / 1e6).toFixed(1) : 0;

// The views of a drawing of varied cells: the canvas view as it is (one canvas for the whole grid),
// a viewport's worth of it (200 x 60 cells), and the DOM view.
async function measureViews(r, cols, lines) {
  const varied = variedCells(cols * lines);
  const canvas = document.createElement('canvas');
  const view = new CellCanvas(canvas);
  r.canvasFirstDrawMs = await time(() => {
    view.resize(cols, lines, 1);
    view.draw(varied);
  });
  r.canvasRedrawMs = await time(() => view.draw(varied), 5);
  const gl = canvas.getContext('webgl2');
  r.canvasPx = `${canvas.width}x${canvas.height}, drawn ${gl.drawingBufferWidth}x${gl.drawingBufferHeight}, ${view.metrics.cellWidth.toFixed(2)}x${view.metrics.lineHeight.toFixed(2)} CSS px a cell`;
  view.resize(cols, lines, 2);
  r.canvasDpr2 = `${canvas.width}x${canvas.height} (scale ${(canvas.width / (cols * view.metrics.cellWidth)).toFixed(2)} of 2)`;
  view.destroy();
  const vpCanvas = document.createElement('canvas'), vp = new CellCanvas(vpCanvas), vpCells = variedCells(200 * 60);
  vp.resize(200, 60, 2);
  vp.draw(vpCells);
  r.viewportRedrawMs = await time(() => vp.draw(vpCells), 10);
  vp.destroy();

  // The DOM view: every row a span, written with innerHTML, then laid out.
  const pre = document.createElement('pre');
  pre.style.cssText = 'font: 17px "JetBrains Mono", monospace; line-height: 1.2; white-space: pre; position: absolute; left: -99999px;';
  document.body.append(pre);
  const buffer = varied.map(({ char, fg, bg }) => ({ char, fit: 0, color: fg.hex, backgroundColor: bg.hex, fgIndex: fg.c, bgIndex: bg.c }));
  r.domFirstRenderMs = await time(() => {
    renderText(getContext({ element: pre, cols, rows: lines }, calcMetrics(pre)), buffer);
    void pre.offsetHeight;
  });
  pre.remove();
}

test.each(SIZES)('%i cols x %i lines', async (cols, lines) => {
  const r = { size: `${cols}x${lines}`, cells: cols * lines };
  const { project, workspace, open } = await blankDocument(cols, lines);
  const heap0 = heapMB();
  r.openMs = await time(open);
  r.heapMB = heapMB() - heap0;
  r.layers = `paint ${project.paintLayer.canvas.width}x${project.paintLayer.canvas.height} (${layerMB(project.paintLayer)} MB), base ${project.baseLayer.canvas.width}x${project.baseLayer.canvas.height} (${layerMB(project.baseLayer)} MB)`;

  const params = project.processParams;
  r.rendererRenderMs = await time(() => project.renderer.render(project.image, params, project.paintLayer, baseParams(params)));
  r.composeAllMs = await time(() => project.applyEditCells());
  r.sliderMs = await time(async () => {
    project.brightness = 110;
    await settled(project);
  });
  project.brightness = 100;
  await settled(project);

  await measureViews(r, cols, lines);

  // What a paint move or a keystroke redoes for the whole document: the output recomposite, the
  // cells copied, and the wide-character layout.
  r.compositeMs = await time(() => project.renderer.composite(project.paintLayer, params), 5);
  r.cellsSliceMs = await time(() => project.composedCells.slice(), 5);
  r.layoutWideMs = await time(() => layoutWide(project.composedCells, cols), 5);

  // One move of a pencil stroke (4 pixels), averaged over 10 moves, and the stroke's commit.
  const mid = { x: Math.floor(cols / 2), y: lines };
  project.beginEdit();
  r.paintMoveMs = await time((i) => project.paintStroke([0, 1, 2, 3].map((k) => ({ x: mid.x + k, y: mid.y + i, alpha: 1 })), '#ff0000'), 10);
  r.paintCommitMs = await time(() => project.commitEdit());
  r.typeKeyMs = await time((i) => project.typeAt(mid.x + i, Math.floor(lines / 2) + 2, 'A', { fg: '#ffffff', bg: '#000000' }), 10);
  r.typeCommitMs = await time(() => project.commitEdit());
  r.updateCellsMs = await time(() => project.renderer.updateCells(project.composedCells, [{ x: mid.x, y: mid.y }], project.processParams, project.editCells, project.renderedCells), 5);
  // The same paint move with a palette: VGA snaps the whole output on every move, and Color count
  // picks its palette again from the whole output when the stroke ends.
  for (const quantize of ['vga', 'count']) {
    project.quantize = quantize;
    await settled(project);
    project.beginEdit();
    r[`paintMove_${quantize}Ms`] = await time((i) => project.paintStroke([0, 1, 2, 3].map((k) => ({ x: mid.x + k, y: mid.y + 20 + i, alpha: 1 })), '#00ff00'), 10);
    r[`paintCommit_${quantize}Ms`] = await time(() => project.commitEdit());
  }
  project.quantize = 'none';
  await settled(project);
  r.eraseBaseFirstMs = await time(() => {
    project.beginEdit();
    project.eraseBase([{ col: 2, row: 2 }]);
    project.commitEdit();
  });
  r.eraseBaseNextMs = await time(() => {
    project.beginEdit();
    project.eraseBase([{ col: 3, row: 2 }]);
    project.commitEdit();
  });
  r.moveSelectionMs = await time(() => project.moveSelection({ c0: 5, r0: 5, c1: 14, r1: 14 }, { base: true, edit: true }, 3, 3));
  await settled(project);

  // A Paint Bucket fill on the blank canvas (it covers the document), its undo, then Merge down.
  const output = project.renderer.outputCanvas;
  let filled = 0;
  r.floodFillOnlyMs = await time(() => {
    filled = floodFill(ctx2d(output).getImageData(0, 0, cols, 2 * lines), 0, 0, workspace.editFillTolerance, true, workspace.editFillFeather).length;
  });
  r.filledPixels = filled;
  r.bucketFillMs = await time(() => bucket.begin({ project, workspace, view: 'output' }, { x: 0.5, y: 0.5 }, { stopPropagation() {} }));
  await settled(project);
  r.undoMs = await time(async () => {
    project.undo();
    await settled(project);
  });
  r.redoMs = await time(async () => {
    project.redo();
    await settled(project);
  });
  r.mergeDownMs = await time(async () => {
    project.mergeDown();
    await settled(project);
  });
  r.heapAfterEditsMB = heapMB() - heap0;

  // Save (the layers as PNGs in a .phosphor) and load it back.
  let file = null;
  r.saveMs = await time(async () => {
    const blob = await writeProject({
      settings: { cols, rows: 2 * lines, fit: project.fit, paintScale: project.paintLayer.scale, baseScale: project.baseLayer.scale, hasPaint: project.hasPaint },
      imageBuffer: project.imageBuffer,
      paintBlob: await project.paintLayer.toBlob(),
      baseBlob: project.baseLayer.hasPaint ? await project.baseLayer.toBlob() : null,
      editCells: project.editCells,
      baseRecords: project.baseRecords,
    });
    file = new File([blob], 'bench.phosphor');
  });
  r.savedKB = file ? Math.round(file.size / 1024) : null;
  r.readProjectMs = await time(() => readProject(file));
  r.loadMs = await time(async () => {
    await project.loadProject(file);
    await settled(project);
  });

  // Export of a varied drawing.
  let exported = 0;
  r.exportUtf8Ms = await time(() => {
    exported = new AnsiFile(cols, lines, variedCells(cols * lines)).toBlob({ utf8: true }).size;
  });
  r.exportedKB = Math.round(exported / 1024);
  r.heapEndMB = heapMB() - heap0;
  console.log(`BENCH ${JSON.stringify(r)}`);
});

// Limits of this browser that a whole-document canvas runs into.
test('limits', async () => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const out = {
    renderer: gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxViewport: [...gl.getParameter(gl.MAX_VIEWPORT_DIMS)],
    maxRenderbuffer: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
  };
  // A tall 2D canvas: does it keep a pixel at the bottom?
  out.canvas2d = {};
  for (const h of [16_384, 32_767, 32_768, 65_535, 65_536, 100_000]) {
    const c = Object.assign(document.createElement('canvas'), { width: 160, height: h });
    const ctx = ctx2d(c);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, h - 1, 1, 1);
    out.canvas2d[h] = ctx.getImageData(0, h - 1, 1, 1).data[3] === 255;
  }
  // The canvas view's one canvas for 80 columns, taller and taller.
  out.cellCanvas = {};
  for (const lines of [500, 1000, 2000, 5000, 10_000]) {
    const c = document.createElement('canvas'), view = new CellCanvas(c);
    view.resize(80, lines, 2);
    const g = c.getContext('webgl2');
    out.cellCanvas[lines] = `${c.width}x${c.height} drawn ${g.drawingBufferWidth}x${g.drawingBufferHeight} (dpr 2 -> scale ${(c.height / (lines * view.metrics.lineHeight)).toFixed(2)})`;
    view.destroy();
  }
  console.log(`LIMITS ${JSON.stringify(out)}`);
});

// A new blank canvas and a picture the grid's own shape at 80 x 10,000 lines: does the pipeline cope?
test('a blank canvas and a grid-shaped picture at 80 x 10,000 lines', async () => {
  const out = {};
  {
    const { project } = await createTestApp();
    project.cols = 80;
    project.rows = 20_000;
    try {
      await project.setBlankCanvas();
      await settled(project);
      out.blankCanvas = `ok: image ${project.image?.naturalWidth}x${project.image?.naturalHeight}, ${project.cells.length} cells`;
    } catch (error) {
      out.blankCanvas = `ERROR ${error.message}`;
    }
  }
  {
    const { project } = await createTestApp();
    const picture = Object.assign(document.createElement('canvas'), { width: 80, height: 20_000 });
    const ctx = ctx2d(picture);
    ctx.fillStyle = '#3366cc';
    ctx.fillRect(0, 0, 80, 20_000);
    const blob = await new Promise((resolve) => picture.toBlob(resolve, 'image/png'));
    try {
      project.replaceImage(await loadImage(blob), await blob.arrayBuffer(), { cols: 80, rows: 20_000, aspectLock: false, filename: 'tall' });
      project.render();
      await settled(project);
      const at = (row) => project.cells[row * 80 + 40]?.bg.hex;
      out.tallPicture = `cells ${project.cells.length}; bg at lines 10, 5000, 9990: ${at(10)} ${at(5000)} ${at(9990)} (want #3366cc)`;
    } catch (error) {
      out.tallPicture = `ERROR ${error.message}`;
    }
  }
  console.log(`PIPELINE ${JSON.stringify(out)}`);
});

// 1000 x 10,000 lines (10M cells): does it open at all? (It doesn't: the tab runs out of memory.)
test.runIf(__BENCH_HUGE__)('1000 cols x 10,000 lines', async () => {
  const { project, open } = await blankDocument(1000, 10_000);
  const heap0 = heapMB();
  const openMs = await time(open);
  console.log(`HUGE ${JSON.stringify({ openMs, cells: project.cells.length, heapMB: heapMB() - heap0 })}`);
});
