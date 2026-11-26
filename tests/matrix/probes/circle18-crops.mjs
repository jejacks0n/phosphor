// The three purple circles (18 Half-block, 18 Full-block, vector 29) as saved, after both merges (Vector 1 into Layer 1,
// Layer 1 blended into the picture) and after Blur over them on Base, the ANSI view at 2x, Base's pins outlined in red.
// One sheet: a row per circle, a column per step.  node tests/matrix/probes/circle18-crops.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { openApp } from '../app.mjs';
const pho = readFileSync(process.env.PHO ?? new URL('../../fixtures/matrix/setup-image-ansi-best-vga-none.pho', import.meta.url)).toString('base64'); // PHO=<path>: another copy
const crisp = process.argv[2] === 'crisp'; // Keep crisp cells for Layer 1 into Base, else Blend into source image
const app = await openApp();
try {
  const b64 = await app.inPage(async ([b64, crisp]) => {
    const { project, workspace } = window.__app;
    const { settle } = await import('/tests/matrix/page-setup.js');
    const { cellsPng } = await import('/src/lib/PngFile.js');
    const { blur } = await import('/src/tools/retouch.js');
    await project.loadProject(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'x.pho'));
    await settle(); await new Promise((r) => setTimeout(r, 800)); await settle();
    const CIRCLES = [['18 Half-block', [69, 20, 22, 11]], ['18 Full-block', [69, 30, 22, 11]], ['29 vector', [95, 31, 14, 10]], ['30 typed blocks', [1, 10, 17, 4]]];
    const shot = async () => {
      const lines = project.cells.length / project.cols, blob = await cellsPng(project.cols, lines, project.cells.slice());
      return { img: await createImageBitmap(blob instanceof Blob ? blob : new Blob([blob], { type: 'image/png' })), pins: new Set(project.baseRecords.pins.keys()), lines };
    };
    const shots = [['as saved', await shot()]];
    const L1 = project.layers.find((l) => l.kind === 'cells' && l.id !== 'base').id, V = project.layers.find((l) => l.kind === 'vector').id;
    project.mergeDown(V); await settle();
    if (crisp) project.mergeDown(L1); else await project.mergeIntoPicture(null, L1);
    await settle();
    shots.push([`after both merges (${crisp ? 'Keep crisp' : 'Blend'})`, await shot()]);
    workspace.pickLayer('base');
    Object.assign(workspace, { retouchSize: 4, retouchStrength: 100, retouchHardness: 50, retouchRange: 'midtones', editorTab: 'output' });
    const ctx = { project, workspace, view: 'output', unit: { x: 1, y: 1 } }, ev = { stopPropagation() {}, preventDefault() {}, shiftKey: false };
    for (const [, [c0, r0, w, h]] of CIRCLES) for (let pass = 0; pass < 3; pass++) for (let r = r0; r < r0 + h; r++) {
      blur.begin(ctx, { x: c0 + 0.5, y: 2 * r + 1 }, ev);
      for (let c = c0 + 1; c < c0 + w; c++) blur.move(ctx, { x: c - 0.5, y: 2 * r + 1 }, { x: c + 0.5, y: 2 * r + 1 });
      blur.end(ctx);
    }
    await settle();
    shots.push(['after Blur on Base', await shot()]);
    const { img } = shots[0][1], cw = img.width / project.cols, ch = img.height / shots[0][1].lines, S = 2, PAD = 12, HEAD = 22, LEFT = 110;
    const wmax = Math.max(...CIRCLES.map(([, [, , w]]) => w)) * cw * S, hmax = CIRCLES.map(([, [, , , h]]) => h * ch * S);
    const sheet = Object.assign(document.createElement('canvas'), { width: LEFT + shots.length * (wmax + PAD), height: HEAD + hmax.reduce((a, b) => a + b + PAD, 0) });
    const g = sheet.getContext('2d');
    g.fillStyle = '#1c1f26'; g.fillRect(0, 0, sheet.width, sheet.height);
    g.font = '13px system-ui'; g.fillStyle = '#e6e8ee';
    shots.forEach(([label], i) => g.fillText(label, LEFT + i * (wmax + PAD), 15));
    let y = HEAD;
    CIRCLES.forEach(([name, [c0, r0, w, h]], row) => {
      g.fillStyle = '#e6e8ee'; g.fillText(name, 6, y + 16);
      shots.forEach(([, { img, pins }], i) => {
        const x = LEFT + i * (wmax + PAD);
        g.imageSmoothingEnabled = false;
        g.drawImage(img, c0 * cw, r0 * ch, w * cw, h * ch, x, y, w * cw * S, h * ch * S);
        g.strokeStyle = '#ff1744'; g.lineWidth = 1;
        for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (pins.has(`${c},${r}`)) g.strokeRect(x + (c - c0) * cw * S + 0.5, y + (r - r0) * ch * S + 0.5, cw * S - 1, ch * S - 1);
      });
      y += hmax[row] + PAD;
    });
    return sheet.toDataURL('image/png').split(',')[1];
  }, [pho, crisp]);
  writeFileSync(new URL(`../out/circles${crisp ? '-crisp' : ''}${process.env.PHO ? '-other' : ''}.png`, import.meta.url), Buffer.from(b64, 'base64'));
  console.log('saved circles.png');
} finally { await app.close(); }
