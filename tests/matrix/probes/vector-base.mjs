// Vector 1 (its own By shape) moved directly onto Base, then merged in one step: Keep crisp cells and Blend into source
// image, each from the file as saved, and by hand (a drawing layer under it, Vector 1 into that, that into Base). Counts cells whose look changed (halves more than 2 apart) and Base's pins.
//   node tests/matrix/probes/vector-base.mjs
import { readFileSync } from 'node:fs';
import { openApp } from '../app.mjs';
const pho = readFileSync(new URL('../../fixtures/matrix/setup-image-ansi-best-vga-none.pho', import.meta.url)).toString('base64');
const app = await openApp();
try {
  console.log(JSON.stringify(await app.inPage(async (b64) => {
    const { project } = window.__app;
    const { settle } = await import('/tests/matrix/page-setup.js');
    const { halfColors } = await import('/src/lib/Cells.js');
    const look = () => project.cells.map((c) => halfColors(c).flatMap(({ r, g, b }) => [r, g, b]));
    const out = {};
    for (const how of ['crisp', 'manual', 'blend']) {
      await project.loadProject(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'x.pho'));
      await settle(); await new Promise((r) => setTimeout(r, 800)); await settle();
      const V = project.layers.find((l) => l.kind === 'vector').id;
      project.moveLayer(V, 1);
      await settle();
      const before = look(), pins = project.baseRecords.pins.size, stack = project.layers.map((l) => l.id).join(' ');
      let ok;
      if (how === 'manual') { // by hand: a drawing layer under it, Vector 1 into that, that into Base
        const L = project.addLayer('cells', 'base');
        await settle();
        ok = project.mergeDown(V) && (await settle(), project.mergeDown(L));
      } else ok = how === 'crisp' ? project.mergeDown(V) : await project.mergeShapesIntoPicture(V);
      await settle(); await new Promise((r) => setTimeout(r, 500)); await settle();
      const after = look();
      const changed = after.filter((h, i) => h.some((v, k) => Math.abs(v - before[i][k]) > 2)).length;
      out[how] = { ok, stack, after: project.layers.map((l) => l.id).join(' '), changed, pinsAdded: project.baseRecords.pins.size - pins, ownChars: JSON.stringify(project.layers.find((l) => l.id === V)?.chars ?? 'gone') };
      project.undo(); if (how === 'manual') { project.undo(); project.undo(); } await settle();
      out[how].undone = look().every((h, i) => h.every((v, k) => v === before[i][k]));
    }
    return out;
  }, pho), null, 1));
} finally { await app.close(); }
