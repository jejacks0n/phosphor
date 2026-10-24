// The browser layer's harness: a fresh app state (Pinia stores, the display font, glyph
// measurement) without mounting the UI, and helpers to load images and wait for renders.
import { watch } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import '@/assets/fonts.css';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { setGlyphRasterizer, rasterizeCoverage, DISPLAY_FONT_CSS } from '@/lib/GlyphCoverage';
import { halfColors } from '@/lib/Cells';

let stopWatching = null;

// Fresh stores and settings (localStorage cleared, a fixed character seed), the display font loaded
// and glyph coverage measured in it, as App.vue does; settings changes re-render, as EditWorkspace.vue
// does.
export async function createTestApp() {
  stopWatching?.();
  localStorage.clear();
  setActivePinia(createPinia());
  await document.fonts.load(DISPLAY_FONT_CSS);
  setGlyphRasterizer(rasterizeCoverage);
  const project = useProjectStore(), workspace = useWorkspaceStore();
  project.seed = 'phosphor-tests'; // the default is a random slug: random characters would differ every run
  stopWatching = watch(() => project.processParams, () => project.render(), { deep: true });
  return { project, workspace };
}

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

// Wait until no render is queued or running, then a frame more (views redraw on the next one).
export async function settle(project) {
  await frame();
  for (let i = 0; i < 600 && (project._renderQueued || project._rendering); i++) await frame();
  if (project._renderQueued || project._rendering) throw new Error('render never settled');
  await frame();
}

// Load an image (a URL the test server serves, e.g. /tests/fixtures/images/x.png) and, with cols
// and rows, size the grid (aspect lock off) as tests usually want.
export async function loadImage(project, url, { cols, rows } = {}) {
  const blob = await (await fetch(url)).blob();
  await project.setImageFromFile(new File([blob], url.slice(url.lastIndexOf('/') + 1), { type: blob.type }));
  if (cols || rows) {
    project.aspectLock = false;
    if (cols) project.cols = cols;
    if (rows) project.rows = rows;
  }
  project.render();
  await settle(project);
}

// The cells as text, one per cell: character, foreground, background (what views and exports show).
export const cellsKey = (project) => project.cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}`);

// Each cell's two shown half-colours (top, bottom) as [r, g, b, r, g, b].
export const halves = (project) => project.cells.map((c) => {
  const [t, b] = halfColors(c);
  return [t.r, t.g, t.b, b.r, b.g, b.b];
});
