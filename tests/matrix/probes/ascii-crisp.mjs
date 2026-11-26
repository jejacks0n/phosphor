// The setup in an ASCII style, Layer 1 merged into Base with Keep crisp cells: which cells of the Half-column detail
// circle (item 17, top row) change, with the layer's entry there.   node tests/matrix/probes/ascii-crisp.mjs [style]
import { readFileSync } from 'node:fs';
import { openApp } from '../app.mjs';
const pho = readFileSync(new URL('../../fixtures/matrix/setup-image-ansi-best-vga-none.pho', import.meta.url)).toString('base64');
const style = process.argv[2] ?? 'colorAscii';
const app = await openApp();
try {
  console.log(JSON.stringify(await app.inPage(async ([b64, style]) => {
    const { project } = window.__app;
    const { settle } = await import('/tests/matrix/page-setup.js');
    await project.loadProject(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'x.pho'));
    await settle(); await new Promise((r) => setTimeout(r, 800)); await settle();
    project.renderStyle = style;
    project.render();
    await settle(); await new Promise((r) => setTimeout(r, 500)); await settle();
    const [c0, r0, w, h] = [48, 21, 24, 9];
    const L1 = project.layers.find((l) => l.kind === 'cells' && l.id !== 'base').id;
    const look = () => { const m = new Map(); for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) { const x = project.cells[r * project.cols + c]; m.set(`${c},${r}`, `${x.char}${x.fg.hex}${x.bg.hex}`); } return m; };
    const entries = new Map(project.cellsOf(L1));
    const before = look();
    const ok = project.mergeDown(L1);
    await settle(); await new Promise((r) => setTimeout(r, 500)); await settle();
    const after = look();
    const changed = [...before].filter(([k, v]) => after.get(k) !== v).map(([k, v]) => ({ k, before: v, after: after.get(k), entry: entries.get(k) ? JSON.stringify(entries.get(k)) : null, paint: project.paintOf(L1) ? 'layer left' : null, pin: project.baseRecords.pins.get(k) }));
    return { style: project.renderStyle, ok, changed: changed.length, of: before.size, sample: changed.slice(0, 14) };
  }, [pho, style]), null, 1));
} finally { await app.close(); }
