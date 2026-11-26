// Opens a .pho and reports its layers and a few cells. node tests/matrix/inspect.mjs <file.pho> [col,row ...]
import { readFileSync } from 'node:fs';
import { openApp } from './app.mjs';
const [file, ...cells] = process.argv.slice(2);
const app = await openApp();
try {
  console.log(await app.inPage(async ([b64, cells]) => {
    const { project } = window.__app;
    await project.loadProject(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'x.pho'));
    await (await import('/tests/matrix/page-setup.js')).settle();
    const layers = project.layers.map((l) => ({ id: l.id, kind: l.kind, name: l.name, shapes: l.kind === 'vector' ? [...project.shapes.values()].filter((s) => s.layer === l.id).length : undefined }));
    const at = cells.map((s) => { const [c, r] = s.split(',').map(Number); const x = project.cells[r * project.cols + c]; return `${s}: ${x.char} ${x.fg.hex} ${x.bg.hex}`; });
    return { shapes: project.shapes.size, shapeKeys: [...project.shapes.values()].slice(0, 2).map((s) => Object.keys(s).join(',')), cols: project.cols, lines: project.cells.length / project.cols, renderStyle: project.renderStyle, quantize: project.quantize, layers, at };
  }, [readFileSync(file).toString('base64'), cells]));
} finally { await app.close(); }
