// The PIXEL view mounted on its own, over fresh stores: a project file's drawing, or the gradient at cols x rows with a
// layer. seen(x, y) is a grid pixel's color as the view shows it.
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { createTestApp, loadImage, settle } from './app.js';
import InputEditor from '@/components/InputEditor.vue';

export async function mountPixelView(file = null, { cols = 20, rows = 20, overlay = 100 } = {}) {
  const { project, workspace } = await createTestApp();
  if (file) await project.loadProject(new File([await (await fetch(file)).arrayBuffer()], 'x.phosphor'));
  else await loadImage(project, '/tests/fixtures/images/gradient.png', { cols, rows });
  Object.assign(workspace, { editorTab: 'input', ansiOverlay: overlay });
  const host = document.createElement('div');
  host.style.cssText = 'width:400px;height:400px;position:fixed;left:0;top:0';
  document.body.append(host);
  const app = createApp({ render: () => h(InputEditor) });
  app.use(getActivePinia());
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
