// For each foundation: build the setup, then swap Vector 1 under Layer 1 and count what changed: cells as they look
// (one color where both are the same), cells exactly (char and colors), and the PIXEL view's pixels.
//   node tests/matrix/swap-sweep.mjs [hide-base]
import { readFileSync } from 'node:fs';
import { openApp } from './app.mjs';
const here = (p) => new URL(p, import.meta.url);
const image = { name: 'landscape.png', type: 'image/png', base64: readFileSync(here('../fixtures/matrix/landscape.png')).toString('base64') };
const F = [
  ['ansi best vga', { style: 'ansi', mode: 'best', palette: 'vga' }],
  ['ansi best cga', { style: 'ansi', mode: 'best', palette: 'cga' }],
  ['ansi best full', { style: 'ansi', mode: 'best', palette: 'none' }],
  ['ansi random vga', { style: 'ansi', mode: 'random', palette: 'vga' }],
  ['ansi shape vga', { style: 'ansi', mode: 'shape', palette: 'vga' }],
  ['colorAscii shape vga', { style: 'colorAscii', mode: 'shape', palette: 'vga' }],
  ['ascii weight cga', { style: 'ascii', mode: 'weight', palette: 'cga' }],
];
const hideBase = process.argv.includes('hide-base');
for (const [name, f] of F) {
  const app = await openApp();
  try {
    await app.inPage(async (f) => (await import('/tests/matrix/page-setup.js')).foundation(f), { from: 'image', adjust: null, file: image, ...f });
    await app.inPage(async () => (await import('/tests/matrix/page-setup.js')).setup());
    const r = await app.inPage(async (hideBase) => {
      const { project } = window.__app;
      const { settle } = await import('/tests/matrix/page-setup.js');
      if (hideBase) { project.setLayerHidden('base', true); await settle(); }
      const snap = () => {
        const looks = project.cells.map(({ char, fg, bg }) => { const f = fg.hex.toLowerCase(), b = bg.hex.toLowerCase(); return f === b ? f : `${char}${f}${b}`; });
        const exact = project.cells.map(({ char, fg, bg }) => `${char}${fg.hex}${bg.hex}`);
        const px = project.pixelsAsSeen().data;
        return { looks, exact, px };
      };
      const a = snap();
      project.moveLayer('vector', project.layers.findIndex((l) => l.id === 'edit'));
      project.render(); await settle(); await new Promise((r) => setTimeout(r, 300)); await settle();
      const b = snap();
      const differ = (x, y) => x.filter((v, i) => v !== y[i]).length;
      let pixels = 0;
      for (let i = 0; i < a.px.length; i += 4) if (a.px[i] !== b.px[i] || a.px[i + 1] !== b.px[i + 1] || a.px[i + 2] !== b.px[i + 2]) pixels++;
      return { looks: differ(a.looks, b.looks), exact: differ(a.exact, b.exact), pixels };
    }, hideBase);
    console.log(`${name.padEnd(22)} looks ${String(r.looks).padStart(4)}  exact ${String(r.exact).padStart(4)}  pixel view ${String(r.pixels).padStart(5)}`);
  } finally { await app.close(); }
}
