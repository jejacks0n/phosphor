// Does a laid ▐ / ▌ come back as itself after Blend into source image, unpinned? For each base character choice and set.
//   node tests/matrix/probes/halfcol.mjs
import { openApp } from '../app.mjs';
const app = await openApp();
try {
  console.log(JSON.stringify(await app.inPage(async () => {
    const { project, workspace } = window.__app;
    const { settle } = await import('/tests/matrix/page-setup.js');
    const out = [];
    for (const [picture, charChoice, chars] of [
      [false, 'best', '▄░▒▓█'], [false, 'best', '▄░▒▓█▌▐'], [false, 'shape', '▄░▒▓█'], [false, 'shape', '▄░▒▓█▌▐'],
      [true, 'shape', '▄░▒▓█▌▐'],
    ]) {
      if (picture) {
        const img = await (await fetch('/tests/fixtures/images/gradient.png')).blob();
        await project.setImageFromFile(new File([img], 'g.png', { type: 'image/png' }), { withLayer: true });
        Object.assign(project, { aspectLock: false, cols: 20, rows: 40 });
        project.render();
      } else await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20, quantize: 'vga' });
      await settle();
      project.setLayerChars('base', { charChoice, chars });
      project.commitLayerChars();
      await settle();
      const L = project.layers.find((l) => l.kind === 'cells' && l.id !== 'base').id;
      workspace.pickLayer(L);
      const cells = [[5, '▐', '#ffff55', '#0000aa'], [6, '▌', '#ffff55', '#0000aa'], [8, '▐', '#ff55ff', '#000000'], [9, '▌', '#55ffff', '#aa0000']];
      project.writeEditCells(cells.map(([col, char, fg, bg]) => ({ col, row: 5, attrs: { char, fg, bg, laid: true } })));
      project.commitEdit();
      await settle();
      const before = cells.map(([col]) => project.cells[5 * 20 + col].char).join('');
      await project.mergeIntoPicture(null, L);
      await settle();
      out.push({ picture, charChoice, chars, before, after: cells.map(([col]) => { const c = project.cells[5 * 20 + col]; return `${c.char} ${c.fg.hex}/${c.bg.hex}`; }).join(' | '), pinned: cells.filter(([col]) => project.baseRecords.pins.has(`${col},5`)).length, scale: project.baseLayer?.scale ?? project.processParams?.scale });
    }
    return out;
  }), null, 1));
} finally { await app.close(); }
