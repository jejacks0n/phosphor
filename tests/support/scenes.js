// Small documents for the browser tests: the cat-free gradient with a bit of everything drawn on it.
import { loadImage, settle } from './app.js';

// A document with typed cells, pencil paint, soft paint and an erased base cell (and optionally a
// Select block on the clipboard).
export async function drawnDocument(project, workspace, { cols = 60, rows = 60, quantize = 'none', clipboard = false } = {}) {
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols, rows });
  project.quantize = quantize;
  project.colorCount = 16;
  project.palette = '#FFFFFF #AA5601 #000000';
  for (const [col, char] of [[12, '█'], [14, 'A'], [20, '▀'], [22, ' ']]) project.typeAt(col, 8, char, { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  project.paintStroke(Array.from({ length: 20 }, (_, k) => ({ x: 20 + k, y: 40, alpha: 1 })), '#ff3300');
  project.commitEdit();
  project.paintStroke(Array.from({ length: 10 }, (_, k) => ({ x: 25 + k, y: 50, alpha: 0.4 })), '#33ff66');
  project.commitEdit();
  project.beginEdit();
  project.eraseBase([{ col: 15, row: 9 }]);
  project.commitEdit();
  if (clipboard) workspace.clipboard = project.copySelection({ c0: 10, r0: 6, c1: 25, r1: 12 }, { base: true, edit: true });
  project.render(); // an erased cell's pin shows only after a full render
  await settle(project);
}

// The output canvas's pixels, as one string.
export function outputKey(project) {
  const c = project.renderer.outputCanvas;
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  let h = 0;
  for (let i = 0; i < d.length; i++) h = (Math.imul(h, 31) + d[i]) | 0;
  return `${c.width}x${c.height}:${h}`;
}
