// Circle 18 (Full-block, anti-aliased, Write block glyphs: cols 71-90, rows 31-39): what its cells are as saved, after
// Vector 1 merges into Layer 1, after Layer 1 blends into the picture, and after Blur over it on Base.
import { readFileSync } from 'node:fs';
import { openApp } from '../app.mjs';
const pho = readFileSync(new URL('../../fixtures/matrix/setup-image-ansi-best-vga-none.pho', import.meta.url)).toString('base64');
const app = await openApp();
try {
  const r = await app.inPage(async (b64) => {
    const { project, workspace } = window.__app;
    const { settle } = await import('/tests/matrix/page-setup.js');
    const { blur } = await import('/src/tools/retouch.js');
    const { isFrozen, isLaid } = await import('/src/document/editCells.js');
    await project.loadProject(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'x.pho'));
    await settle(); await new Promise((r) => setTimeout(r, 800)); await settle();
    const C0 = 71, C1 = 90, R0 = 31, R1 = 39, cols = project.cols;
    const L1 = project.layers.find((l) => l.kind === 'cells' && l.id !== 'base').id, V = project.layers.find((l) => l.kind === 'vector').id;
    const snap = (label) => {
      const rows = [], kinds = {};
      for (let r = R0; r <= R1; r++) {
        let line = '';
        for (let c = C0; c <= C1; c++) {
          const key = `${c},${r}`, e = project.layers.some((l) => l.id === L1) ? project.cellsOf(L1).get(key) : undefined, pin = project.baseRecords.pins.get(key);
          const kind = e ? (isFrozen(e) ? 'frozen' : isLaid(e) ? 'laid' : e.char === '▄' && !e.fg && !e.bg ? 'block' : 'own') : pin !== undefined ? 'pin' : project.layers.some((l) => l.id === L1) && project.cellHasPaint(c, r) ? 'paint' : '-';
          kinds[kind] = (kinds[kind] ?? 0) + 1;
          const sym = { frozen: 'F', laid: 'L', block: 'b', own: 'O', pin: 'P', paint: 'p', '-': '.' }[kind];
          const cell = project.cells[r * cols + c];
          line += `${sym}${cell.char}${cell.fg.hex.slice(1, 4)}/${cell.bg.hex.slice(1, 4)} `;
        }
        rows.push(line);
      }
      return { label, kinds, rows };
    };
    const out = [snap('as saved')];
    project.mergeDown(V); await settle(); out.push(snap('Vector 1 merged into Layer 1'));
    await project.mergeIntoPicture(null, L1); await settle(); out.push(snap('Layer 1 blended'));
    workspace.pickLayer('base');
    Object.assign(workspace, { retouchSize: 4, retouchStrength: 100, retouchHardness: 50, retouchRange: 'midtones', editorTab: 'output' });
    const ctx = { project, workspace, view: 'output', unit: { x: 1, y: 1 } }, ev = { stopPropagation() {}, preventDefault() {}, shiftKey: false };
    for (let pass = 0; pass < 3; pass++) for (let r = R0; r <= R1; r++) {
      blur.begin(ctx, { x: C0 + 0.5, y: 2 * r + 1 }, ev);
      for (let c = C0 + 1; c <= C1; c++) blur.move(ctx, { x: c - 0.5, y: 2 * r + 1 }, { x: c + 0.5, y: 2 * r + 1 });
      blur.end(ctx);
    }
    await settle(); out.push(snap('after Blur'));
    // its entries' attributes as saved, one of each char
    return out;
  }, pho);
  for (const s of r) { console.log(`\n${s.label}  ${JSON.stringify(s.kinds)}`); s.rows.forEach((l) => console.log('  |' + l + '|')); }
} finally { await app.close(); }
