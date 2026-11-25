// The PIXEL view mounted on its own, over fresh stores: a project file's drawing, an ANSI or text file opened to draw
// on top of, or the gradient at cols x rows with a layer, in a bitmap font if one is given. seen(x, y) is a grid pixel's color as the view shows it.
import { createApp, h, nextTick } from 'vue';
import { createTestApp, loadImage, settle } from './app.js';
import InputEditor from '@/components/InputEditor.vue';

export async function mountPixelView(file = null, { cols = 20, rows = 20, overlay = 100, font = null } = {}) {
  const { project, workspace, pinia } = await createTestApp();
  if (font) await project.setDrawingFont(font);
  const bytes = file && await (await fetch(file)).arrayBuffer();
  if (file?.endsWith('.phosphor')) await project.loadProject(new File([bytes], 'x.phosphor'));
  else if (file) await project.openArtFile(new File([bytes], file.slice(file.lastIndexOf('/') + 1)));
  else await loadImage(project, '/tests/fixtures/images/gradient.png', { cols, rows });
  Object.assign(workspace, { editorTab: 'input', ansiOverlay: overlay });
  const host = document.createElement('div');
  host.style.cssText = 'width:400px;height:400px;position:fixed;left:0;top:0';
  document.body.append(host);
  const app = createApp({ render: () => h(InputEditor) });
  app.use(pinia); // the test's own: after the awaits, the active one may be a late test's
  app.mount(host);
  await nextTick();
  await settle(project);
  const canvas = host.querySelector('canvas');
  const seen = (x, y) => {
    const { width, height } = canvas, c = canvas.getContext('2d');
    return [...c.getImageData(Math.floor((x + 0.5) * (width / project.cols)), Math.floor((y + 0.5) * (height / project.rows)), 1, 1).data].slice(0, 3);
  };
  return { project, workspace, host, seen, done: () => { app.unmount(); host.remove(); } };
}
