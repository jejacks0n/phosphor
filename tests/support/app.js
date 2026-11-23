// The browser layer's harness: a fresh app state (Pinia stores, the display font, glyph
// measurement) without mounting the UI, and helpers to load images and wait for renders.
import { setActivePinia, createPinia } from 'pinia';
import '@/assets/fonts.css';
import { setLocale } from '@/i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore, followLayerPick } from '@/store/WorkspaceStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { followParams } from '@/store/project/rendering';
import { busyMessage } from '@/composables/useBusy';
import { setGlyphRasterizer, rasterizeCoverage } from '@/lib/GlyphCoverage';
import { setDisplayFont } from '@/lib/displayFonts';
import { halfColors } from '@/lib/Cells';
import { CONSENT_KEY, CONSENT_VERSION } from '@/social/consent';

let stopWatching = null, stopPick = null;

// SOCIAL's first question, answered: for after a localStorage.clear(), before the stores are made.
export const seedConsent = () => localStorage.setItem(CONSENT_KEY, CONSENT_VERSION);

// Fresh stores and settings (localStorage cleared, a fixed character seed), the default display font
// loaded and glyph coverage measured in it, as App.vue does; settings changes re-render, as EditWorkspace.vue
// does.
export async function createTestApp() {
  stopWatching?.();
  stopPick?.();
  localStorage.clear();
  await setLocale('en', { persist: false });
  seedConsent();
  const pinia = createPinia();
  setActivePinia(pinia);
  await setDisplayFont('jetbrains');
  setGlyphRasterizer(rasterizeCoverage);
  // Asked of this Pinia by name (which makes it the active one again): a test before this one, finishing late while the
  // font loaded, makes its own active (every Pinia action and getter does), and these would be that test's stores.
  const project = useProjectStore(pinia), workspace = useWorkspaceStore(pinia), drawing = useDrawingStore(pinia);
  workspace.displayFont = 'jetbrains'; // the reference numbers were drawn in it; the app's default is IBM VGA
  workspace.displayFontLoaded = workspace.displayFontSpec;
  project.seed = 'phosphor-tests'; // the default is a random slug: random characters would differ every run
  stopWatching = followParams(project);
  stopPick = followLayerPick({ workspace, project, drawing });
  return { project, workspace, pinia }; // pinia: for an app a test mounts, which then can't take a late test's stores
}

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

// Wait until no render is queued or running and no busy work (a fill waiting for its frame: useBusy) is up, then a frame
// more (views redraw on the next one).
export async function settle(project) {
  const busy = () => project._renderQueued || project._rendering || busyMessage.value;
  await frame();
  for (let i = 0; i < 600 && busy(); i++) await frame();
  if (busy()) throw new Error('render never settled');
  await frame();
}

// Load an image (a URL the test server serves, e.g. /tests/fixtures/images/x.png) and, with cols
// and rows, size the grid (aspect lock off) as tests usually want.
export async function loadImage(project, url, { cols, rows, withLayer = true } = {}) {
  const blob = await (await fetch(url)).blob();
  await project.setImageFromFile(new File([blob], url.slice(url.lastIndexOf('/') + 1), { type: blob.type }), { withLayer });
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

// Each cell's two shown half-colors (top, bottom) as [r, g, b, r, g, b].
export const halves = (project) => project.cells.map((c) => {
  const [t, b] = halfColors(c);
  return [t.r, t.g, t.b, b.r, b.g, b.b];
});
