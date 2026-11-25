// A plugin filter's values in a drawing (settings' filterOptions): its group in the settings column (ControlPanel.vue),
// each change an undo step as a slider's, its own Reset apart from Image filters', kept with the drawing whether or not
// the filter is there, named by the Export dialog when it's left out, and refusing a room (RoomStore.pluginSolversWhy).
import { test, expect, vi, afterEach } from 'vitest';
import { createApp, nextTick } from 'vue';
import { setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { readScript } from '@/plugins/script';
import { readProject, writeProject } from '@/document/projectIO.js';
import { solverRef, unregisterScript } from '@/plugins/solvers';
import { useRoomStore } from '@/store/RoomStore';
import { onPlugin } from '../support/pluginSolvers.js';
import midnight from '../../plugins/midnight/phosphor-plugin.json';
import { readManifest } from '@/plugins/manifest';
import { usePluginStore } from '@/store/PluginStore';
import ControlPanel from '@/components/ControlPanel.vue';
import ExportModal from '@/components/ExportModal.vue';
import StartRoomPage from '@/components/social/StartRoomPage.vue';

let apps = [], pinia = null; // pinia: the test's own, drawing()'s
afterEach(() => {
  unregisterScript('jane.fx');
  for (const { app, host } of apps) {
    app.unmount();
    host.remove();
  }
  apps = [];
  useRoomStore(pinia).role = null;
  vi.restoreAllMocks();
});

// Aberration-like: a distance and a tint; and one that changes nothing; and one that dims the picture by its amount.
const [ABERRATION, SAME, DIM] = readScript({ default: { filters: [
  {
    id: 'aberration', name: 'Aberration', passes: ['return vec3(pixel(vec2(opt_distance, 0.0)).r, pixel(vec2(0.0)).g, pixel(vec2(-opt_distance, 0.0)).b) * opt_tint;'],
    options: [
      { id: 'distance', kind: 'slider', name: 'Distance', min: 0, max: 10, step: 1, default: 0 },
      { id: 'tint', kind: 'color', name: 'Tint', default: '#ffffff' },
    ],
  },
  { id: 'same', name: 'Same', passes: ['return pixel(vec2(0.0));'], options: [{ id: 'on', kind: 'checkbox', name: 'On', default: false }] },
  { id: 'dim', name: 'Dim', passes: ['return pixel(vec2(0.0)) * (1.0 - opt_amount);'], options: [{ id: 'amount', kind: 'slider', name: 'Amount', min: 0, max: 1, step: 0.25, default: 0 }] },
] } }).filters;
const ref = solverRef('jane.fx', 'aberration');
const GLOW = solverRef('ann.fx', 'glow'); // never installed

// The stores are asked for by the active Pinia (the plugin's by onPlugin, the room's and the plugins' by the project's
// getters), and a test before this one, finishing late while this one waits, makes its own active again (createTestApp
// says how): the plugin then went on in that test's store, and this one's drawing had no filter to run. So this test's
// Pinia is made the active one again after each wait, and asked for by name.
async function drawing() {
  const stores = await createTestApp();
  ({ pinia } = stores);
  await loadImage(stores.project, '/tests/fixtures/images/gradient.png', { cols: 8, rows: 8 });
  setActivePinia(pinia);
  await onPlugin({ filters: [ABERRATION, SAME, DIM] }, { pluginId: 'jane.fx', pinia });
  await settle(stores.project);
  setActivePinia(pinia);
  stores.workspace.pickLayer('base'); // the groups show where Image filters do: the base picked, with a real picture
  return stores;
}
async function mount(component, props = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(component, props).use(pinia).use(i18n);
  app.mount(host);
  apps.push({ app, host });
  await nextTick();
  return host;
}
const groupOf = (host, name) => [...host.querySelectorAll('fieldset')].find((f) => f.querySelector('legend .title')?.textContent === name);
const resetOf = (group) => [...group.querySelectorAll('legend button')].find((b) => b.textContent === 'Reset');
// A slider set the way a release sets it at this width (RangeField commits on change on a narrow screen).
async function slide(input, value) {
  input.value = String(value);
  input.dispatchEvent(new Event('change'));
  await nextTick();
}

test('Distance set in its group is one undo step, kept off its default only, run in the pipeline and rendered', async () => {
  const { project } = await drawing();
  const host = await mount(ControlPanel);
  const group = groupOf(host, 'Aberration');
  expect(group.querySelector('legend').textContent).toContain('Plugin');
  const render = vi.spyOn(project.renderer, 'render');
  expect(project.canUndo).toBe(false);
  await slide(group.querySelector('input[type=range]'), 3);
  expect(project.filterOptions).toEqual({ [ref]: { name: 'Aberration', values: { distance: 3 } } });
  expect(project.processParams.pluginFilters).toEqual([
    { ref, pluginId: 'jane.fx', hash: 'h', helpers: null, passes: ABERRATION.passes, options: ABERRATION.options, values: { distance: 3, tint: '#ffffff' } },
  ]);
  await settle(project);
  expect(render).toHaveBeenCalled();
  expect(project.canUndo).toBe(true);
  project.undo();
  expect(project.filterOptions).toEqual({});
  expect(project.processParams.pluginFilters).toEqual([]);
  expect(project.canUndo).toBe(false);
});

test('its Reset clears it in one undo step; Image filters\' Reset leaves it, and Reset all clears it', async () => {
  const { project } = await drawing();
  const host = await mount(ControlPanel);
  project.setSlider('blur', 2);
  project.commitSliders('blur');
  await slide(groupOf(host, 'Aberration').querySelector('input[type=range]'), 4);
  const set = project.filterOptions;
  const version = project.history.version;
  resetOf(groupOf(host, 'Aberration')).click();
  await nextTick();
  expect(project.filterOptions).toEqual({});
  expect(project.blur).toBe(2);
  expect(project.history.version).toBe(version + 1);
  resetOf(groupOf(host, 'Aberration')).click(); // nothing left to reset: no step
  expect(project.history.version).toBe(version + 1);
  project.undo();
  expect(project.filterOptions).toEqual(set);

  project.resetGroup('effects');
  expect(project.blur).toBe(0);
  expect(project.filterOptions).toEqual(set);
  project.resetSliders();
  expect(project.filterOptions).toEqual({});
  project.undo();
  expect(project.filterOptions).toEqual(set);
});

test('a filter changes what the base\'s own colors are read from, not only what shows', async () => {
  const { project } = await drawing();
  const at = () => project.renderer.imageAt(2, 2, project.cols, project.rows);
  const plain = at();
  const dim = solverRef('jane.fx', 'dim');
  project.setSlider('filterOptions', { [dim]: { name: 'Dim', values: { amount: 0.5 } } });
  project.commitSliders('filterOptions');
  await settle(project);
  const half = at();
  expect(half.g).toBeLessThan(plain.g);
  project.setSlider('filterOptions', { [dim]: { name: 'Dim', values: { amount: 1 } } });
  project.commitSliders('filterOptions');
  await settle(project);
  expect(at()).toEqual({ r: 0, g: 0, b: 0 });
});

test('Into the image makes the picture without the filter, which still applies after: it isn\'t doubled', async () => {
  const { project } = await drawing();
  const dim = solverRef('jane.fx', 'dim');
  project.setSlider('filterOptions', { [dim]: { name: 'Dim', values: { amount: 0.5 } } });
  project.commitSliders('filterOptions');
  await settle(project);
  const at = () => project.renderer.imageAt(2, 2, project.cols, project.rows);
  const before = at();
  project.typeAt(0, 0, 'A', { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  await project.mergeIntoPicture();
  await settle(project);
  expect(project.filterOptions[dim]).toBeTruthy();
  const after = at();
  for (const channel of ['r', 'g', 'b']) expect(Math.abs(after[channel] - before[channel])).toBeLessThanOrEqual(2);
});

test('Bake presses the filter into the picture and clears it, once; Flatten and closing the drawing clear it; undo brings it back', async () => {
  const { project } = await drawing();
  const dim = solverRef('jane.fx', 'dim'), set = { [dim]: { name: 'Dim', values: { amount: 0.5 } } };
  const at = () => project.renderer.imageAt(2, 2, project.cols, project.rows);
  project.setSlider('filterOptions', set);
  project.commitSliders('filterOptions');
  await settle(project);
  const before = at();
  await project.bake();
  await settle(project);
  expect(project.filterOptions).toEqual({});
  for (const channel of ['r', 'g', 'b']) expect(Math.abs(at()[channel] - before[channel])).toBeLessThanOrEqual(2);
  project.undo();
  await settle(project);
  expect(project.filterOptions).toEqual(set);

  expect(await project.flattenDrawing()).toBe(true);
  expect(project.filterOptions).toEqual({});
  project.undo();
  expect(project.filterOptions).toEqual(set);

  project.clearImage();
  expect(project.filterOptions).toEqual({});
});

test('a filter that isn\'t installed keeps its values through a save and an open, dimmed and named in Export', async () => {
  const { project, workspace } = await drawing();
  const glow = { [GLOW]: { name: 'Glow', values: { soft: true, amount: 0.25, tint: '#00ff88' } } };
  project.setSlider('filterOptions', glow);
  project.commitSliders('filterOptions');
  expect(project.processParams.pluginFilters).toEqual([]);
  const spy = vi.spyOn(URL, 'createObjectURL');
  await project.saveProject();
  const blob = spy.mock.calls.at(-1)[0];
  await project.setBlankCanvas({ withLayer: true });
  expect(project.filterOptions).toEqual({});
  await project.loadProject(new File([blob], 'x.phosphor'));
  expect(JSON.stringify(project.filterOptions)).toBe(JSON.stringify(glow));
  expect(project.isDirty).toBe(false);
  // A file's are a stranger's: what isn't well formed doesn't open.
  const parts = await project.projectParts();
  parts.settings.filterOptions = { ...glow, nope: { name: 'Nope', values: {} }, [solverRef('ann.fx', 'red')]: { name: 'Red', values: { tint: 'red' } } };
  expect((await readProject(await writeProject({ imageBuffer: project.imageBuffer, ...parts }))).settings.filterOptions).toEqual(glow);

  workspace.pickLayer('base');
  const host = await mount(ControlPanel);
  const group = groupOf(host, 'Glow');
  expect(group.classList.contains('dim')).toBe(true);
  expect(group.textContent).toContain('Glow isn\'t installed. The picture shows without it.');
  expect(group.querySelector('input')).toBe(null);
  expect(groupOf(host, 'Aberration').classList.contains('dim')).toBe(false);

  await mount(ExportModal, { onClose: () => {} });
  expect(document.querySelector('.modal-dialog').textContent).toContain('Left out: the plugin filter Glow.');
});

test('a filter\'s settings held refuse a room, naming it, beside a plugin solver\'s words', async () => {
  const { project } = await drawing();
  const room = useRoomStore(pinia);
  const host = await mount(StartRoomPage);
  const goLive = () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Go live');
  expect(room.pluginSolversWhy).toBe(null);
  project.setSlider('filterOptions', { [ref]: { name: 'Aberration', values: { distance: 2 } } });
  project.commitSliders('filterOptions');
  await nextTick();
  const words = 'This drawing holds settings for the plugin filter Aberration, which rooms don\'t use. Reset it first.';
  expect(room.pluginSolversWhy).toBe(words);
  expect(goLive().disabled).toBe(true);
  expect(goLive().title).toBe(words);
  project.setLayerChars('edit', { charChoice: 'plugin:jane.lines/lines' });
  expect(room.pluginSolversWhy).toBe(`Layer 1 is on a plugin solver, which rooms don't use. Choose a built-in solver for it, or Flatten the drawing first. ${words}`);
});

test('in a room the groups aren\'t shown and no filter runs', async () => {
  const { project } = await drawing();
  project.setSlider('filterOptions', { [ref]: { name: 'Aberration', values: { distance: 2 } } });
  project.commitSliders('filterOptions');
  expect(project.processParams.pluginFilters).toHaveLength(1);
  const host = await mount(ControlPanel);
  expect(groupOf(host, 'Aberration')).toBeTruthy();
  useRoomStore(pinia).role = 'host';
  await nextTick();
  expect(groupOf(host, 'Aberration')).toBe(undefined);
  expect(project.filterGroups).toEqual([]);
  expect(project.processParams.pluginFilters).toEqual([]);
});

// Two plugins whose names sort one way and whose ids the other. The Plugins dialog lists them by name; the filters show
// and run by id, so renaming a plugin can't change how a drawing with both looks.
test('filters show and run in the order of their ids, not their plugins\' names', async () => {
  const { project } = await drawing(), plugins = usePluginStore(pinia);
  for (const [id, name] of [['ann.fx', 'Zebra filters'], ['zed.fx', 'Apple filters']]) {
    await plugins.install(readManifest(JSON.stringify({ ...midnight, id, name })));
    plugins.useScript(id, 'h', { filters: [DIM] });
    setActivePinia(pinia);
  }
  expect(plugins.plugins.map((plugin) => plugin.id).filter((id) => id !== 'jane.fx')).toEqual(['zed.fx', 'ann.fx']); // by name
  const dims = ['plugin:ann.fx/dim', 'plugin:jane.fx/dim', 'plugin:zed.fx/dim'];
  project.setSlider('filterOptions', Object.fromEntries(dims.map((each) => [each, { name: 'Dim', values: { amount: 0.25 } }])));
  await settle(project);
  expect(project.processParams.pluginFilters.map((filter) => filter.ref)).toEqual(dims);
  const host = await mount(ControlPanel);
  const shown = project.filterGroups.map((group) => group.ref);
  expect(shown.filter((each) => dims.includes(each))).toEqual(dims);
  expect([...host.querySelectorAll('fieldset legend .title')].map((title) => title.textContent).filter((title) => ['Aberration', 'Dim', 'Same'].includes(title)))
    .toEqual(shown.map((each) => project.filterGroups.find((group) => group.ref === each).name)); // the column, in that order
  unregisterScript('ann.fx');
  unregisterScript('zed.fx');
});

test('a group folds on its title, each by its own, and stays folded', async () => {
  await drawing();
  const host = await mount(ControlPanel);
  groupOf(host, 'Aberration').querySelector('legend button.fold').click();
  await nextTick();
  expect(groupOf(host, 'Aberration').classList.contains('folded')).toBe(true);
  expect(groupOf(host, 'Same').classList.contains('folded')).toBe(false);
  expect(JSON.parse(localStorage.getItem('phosphor.panel.folded'))).toContain(ref);
  const again = await mount(ControlPanel);
  expect(groupOf(again, 'Aberration').classList.contains('folded')).toBe(true);
  expect(groupOf(again, 'Same').classList.contains('folded')).toBe(false);
});

test('a folded group says how many of its options are on, as the other groups do', async () => {
  const { project } = await drawing();
  const host = await mount(ControlPanel);
  groupOf(host, 'Aberration').querySelector('legend button.fold').click();
  await nextTick();
  expect(groupOf(host, 'Aberration').querySelector('legend .on')).toBe(null);
  project.setSlider('filterOptions', { [ref]: { name: 'Aberration', values: { distance: 2, tint: '#ff0000' } } });
  project.commitSliders('filterOptions');
  await nextTick();
  expect(groupOf(host, 'Aberration').querySelector('legend .on').textContent).toBe('2 on');
});

test('the groups show where Image filters do: not with another layer picked, nor on a blank canvas', async () => {
  const { project, workspace } = await drawing();
  const host = await mount(ControlPanel);
  expect(groupOf(host, 'Aberration')).toBeTruthy();
  workspace.pickLayer('edit');
  await nextTick();
  expect(groupOf(host, 'Aberration')).toBe(undefined);
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 });
  workspace.pickLayer('base');
  await nextTick();
  expect(groupOf(host, 'Aberration')).toBe(undefined);
});

test('Bake leaves a filter that isn\'t running as it is, and one that\'s missing alone has nothing to bake', async () => {
  const { project } = await drawing();
  const glow = { [GLOW]: { name: 'Glow', values: { soft: true, amount: 0.25 } } };
  project.setSlider('filterOptions', glow);
  project.commitSliders('filterOptions');
  expect(project.canBake).toBe(false);
  project.setSlider('brightness', 120);
  project.commitSliders('brightness');
  expect(project.canBake).toBe(true);
  const version = project.history.version;
  await project.bake();
  await settle(project);
  expect(project.brightness).toBe(100);
  expect(JSON.stringify(project.filterOptions)).toBe(JSON.stringify(glow));
  expect(project.history.version).toBe(version + 1);
  project.undo();
  await settle(project);
  expect(project.brightness).toBe(120);
  expect(JSON.stringify(project.filterOptions)).toBe(JSON.stringify(glow));
});

test('a plugin filter on makes the drawing bakeable; none, and it isn\'t', async () => {
  const { project } = await drawing();
  expect(project.canBake).toBe(false);
  project.setSlider('filterOptions', { [ref]: { name: 'Aberration', values: { distance: 2 } } });
  project.commitSliders('filterOptions');
  expect(project.canBake).toBe(true);
});
