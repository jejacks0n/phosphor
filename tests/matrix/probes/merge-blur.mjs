// Merges Vector 1 into Layer 1 and Layer 1 into Base, then blurs across the whole drawing on Base in the ANSI view, and
// lists the characters Blur left, by where each came from.  node tests/matrix/probes/merge-blur.mjs
import { readFileSync } from 'node:fs';
import { openApp } from '../app.mjs';
const pho = readFileSync(new URL('../../fixtures/matrix/setup-image-ansi-best-vga-none.pho', import.meta.url)).toString('base64');
const app = await openApp();
try {
  const r = await app.inPage(async ([b64, blend]) => {
    const { project, workspace } = window.__app;
    const { settle } = await import('/tests/matrix/page-setup.js');
    const { blur } = await import('/src/tools/retouch.js');
    const { isFrozen, isLaid } = await import('/src/document/editCells.js');
    await project.loadProject(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'x.pho'));
    await settle(); await new Promise((r) => setTimeout(r, 800)); await settle();
    const cells = project.cells.length, cols = project.cols;
    const L1 = project.layers.find((l) => l.kind === 'cells' && l.id !== 'base').id, V = project.layers.find((l) => l.kind === 'vector').id;
    // Where each cell came from, on Layer 1 before any merge
    const origin = new Array(cells).fill('converter');
    for (const [key, e] of project.cellsOf(L1)) {
      const [c, r] = key.split(',').map(Number); if (c >= cols || r * cols + c >= cells) continue;
      origin[r * cols + c] = isFrozen(e) ? 'layer1 frozen (26/26b merge)' : isLaid(e) ? 'laid (Half-column detail)' : e.char === '▄' && !e.fg && !e.bg ? 'paint block' : `own entry`;
    }
    const look = () => project.cells.map(({ char, fg, bg }) => { const f = fg.hex.toLowerCase(), b = bg.hex.toLowerCase(); return f === b ? f : `${char}${f}${b}`; });
    const look0 = look();
    if (project.mergeDown(V) === false) return { error: 'vector merge refused' };
    await settle();
    const frozenNow = new Set();
    for (const [key, e] of project.cellsOf(L1)) if (isFrozen(e)) { const [c, r] = key.split(',').map(Number); const i = r * cols + c; if (origin[i] === 'converter') origin[i] = 'vector 1 frozen'; frozenNow.add(i); }
    const chars1 = project.cells.map((c) => c.char), look1 = look();
    if (blend) await project.mergeIntoPicture(null, L1);
    else if (project.mergeDown(L1) === false) return { error: 'layer 1 merge refused' };
    await settle();
    const chars2 = project.cells.map((c) => c.char), look2 = look();
    const pins = new Set([...project.baseRecords.pins.keys()].map((k) => { const [c, r] = k.split(',').map(Number); return r * cols + c; }));
    // Blur across everything on Base, in the ANSI view: a stroke along every line
    workspace.pickLayer('base');
    Object.assign(workspace, { retouchSize: 4, retouchStrength: 100, retouchHardness: 50, retouchRange: 'midtones' });
    workspace.editorTab = 'output';
    const ctx = { project, workspace, view: 'output', unit: { x: 1, y: 1 } }, ev = { stopPropagation() {}, preventDefault() {}, shiftKey: false };
    const rows = cells / cols;
    for (let pass = 0; pass < 3; pass++) for (let r = 0; r < rows; r++) {
      blur.begin(ctx, { x: 0.5, y: 2 * r + 1 }, ev);
      for (let c = 1; c < cols; c++) blur.move(ctx, { x: c - 0.5, y: 2 * r + 1 }, { x: c + 0.5, y: 2 * r + 1 });
      blur.end?.(ctx);
    }
    project.commitEdit?.(); await settle();
    const chars3 = project.cells.map((c) => c.char);
    const kept = {}, lostByMerge = {};
    for (let i = 0; i < cells; i++) {
      if (chars1[i] !== chars2[i]) { const k = `${origin[i]}: ${chars1[i]}→${chars2[i]}`; lostByMerge[k] = (lostByMerge[k] ?? 0) + 1; }
      if (pins.has(i) && chars3[i] === chars2[i] && chars2[i] !== ' ') {
        const k = `${origin[i]}`; (kept[k] ??= {}); kept[k][chars2[i]] = (kept[k][chars2[i]] ?? 0) + 1;
      }
    }
    const tally = (a, b) => { const out = {}; a.forEach((x, i) => { if (x !== b[i]) { const k = `${origin[i]}: ${x} → ${b[i]}`; out[k] = (out[k] ?? 0) + 1; } }); return Object.fromEntries(Object.entries(out).sort((p, q) => q[1] - p[1]).slice(0, 12)); };
    const vecChanged = { looks: look0.filter((x, i) => x !== look1[i]).length, top: tally(look0, look1) }, baseChanged = { looks: look1.filter((x, i) => x !== look2[i]).length, top: tally(look1, look2) };
    return { L1, V, pins: pins.size, vecMerge: vecChanged, baseMerge: baseChanged, keptAfterBlur: kept };
  }, [pho, process.argv[2] === 'blend']);
  console.log(JSON.stringify(r, null, 1));
} finally { await app.close(); }
