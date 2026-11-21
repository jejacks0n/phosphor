// A plugin solver chosen in the Characters section (ControlPanel.vue), its options drawn from what it declares
// (SolverOptions.vue), and a layer whose solver can't run saying so: in the section's note and in its row of the layers
// list (LayersList.vue).
import { test, expect, afterEach, onTestFinished } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import { readScript } from '@/plugins/script';
import { unregisterScript, failSolver } from '@/plugins/solvers';
import { usePluginStore } from '@/store/PluginStore';
import { useRoomStore } from '@/store/RoomStore';
import { onSolver } from '../support/pluginSolvers.js';
import ControlPanel from '@/components/ControlPanel.vue';
import LayersList from '@/components/LayersList.vue';

let apps = [];
afterEach(() => {
  unregisterScript('phosphor.outlines');
  for (const { app, host } of apps) {
    app.unmount();
    host.remove();
  }
  apps = [];
});

const solver = (fields) => readScript({ default: { solvers: [{
  styles: ['ansi', 'ascii'], reach: 0, chars: '/\\-|', solve: () => ({ char: '|', fg: 0, bg: 0 }), options: [], ...fields,
}] } }).solvers[0];
// Outlines, with a slider, a checkbox and a choice, one of them named in markup that must show as text.
const OUTLINES = solver({
  id: 'outlines', name: 'Outlines',
  options: [
    { id: 'threshold', kind: 'slider', name: 'Threshold', min: 0, max: 100, step: 1, default: 40 },
    { id: 'thin', kind: 'checkbox', name: '<b>Thin</b>', default: false },
    { id: 'look', kind: 'choice', name: 'Look', choices: ['Soft', 'Hard', '<i>Odd</i>'], default: 0 },
  ],
});
const LINES = solver({ id: 'lines', name: 'Lines', styles: ['ascii'] }); // Monochrome ASCII only

async function blank() {
  const stores = await createTestApp();
  await stores.project.setBlankCanvas({ withLayer: true, cols: 20, rows: 10 });
  await settle(stores.project);
  stores.workspace.pickLayer('edit');
  return stores;
}
async function mount(component) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(component).use(getActivePinia()).use(i18n);
  app.mount(host);
  apps.push({ app, host });
  await nextTick();
  return host;
}
// Both solvers, of one plugin.
async function installed() {
  const ref = await onSolver(OUTLINES);
  usePluginStore().useScript('phosphor.outlines', 'h', { solvers: [OUTLINES, LINES] });
  return { ref, lines: ref.replace('/outlines', '/lines') };
}
const choices = (select) => [...select.options].map((o) => o.text);
const change = async (el, value, type = 'change') => {
  el.value = value;
  el.dispatchEvent(new Event(type));
  await nextTick();
};

test('the choice offers the plugin solvers that do the drawing\'s style, and none in a room', async () => {
  const { project } = await blank();
  const { ref, lines } = await installed();
  const host = await mount(ControlPanel);
  const select = () => host.querySelector('#charChoice, #charChoiceAscii');
  expect(choices(select())).toEqual(['Random', 'Best match', 'By shape', 'Outlines']);
  expect(select().options[3].value).toBe(ref);
  project.renderStyle = 'ascii';
  await nextTick();
  expect(choices(select())).toEqual(['By brightness', 'By shape', 'Outlines', 'Lines']);
  expect(select().options[3].value).toBe(lines);
  project.renderStyle = 'colorAscii';
  await nextTick();
  expect(choices(select())).toEqual(['By intensity', 'By shape']);

  project.renderStyle = 'ansi';
  useRoomStore().role = 'host';
  await nextTick();
  expect(choices(select())).toEqual(['Random', 'Best match', 'By shape']);
});

test('options are drawn from what the solver declares, in its own words, and each change is one undo step', async () => {
  await page.viewport(1200, 800); // wide, where a slider's drag sets the value as it goes (RangeField)
  onTestFinished(() => page.viewport(414, 896));
  await expect.poll(() => window.innerWidth).toBe(1200);
  const { project } = await blank();
  const { ref } = await installed();
  const host = await mount(ControlPanel);
  const version = project.history.version, steps = () => project.history.version - version;
  expect(host.querySelector('#solver-threshold')).toBe(null); // By shape's has none

  await change(host.querySelector('#charChoice'), ref);
  expect(project.charsOf('edit').charChoice).toBe(ref);
  expect(steps()).toBe(1);
  const options = host.querySelector('.solver-options');
  expect(options.querySelector('b, i')).toBe(null); // plugin words are text
  expect(options.textContent).toContain('Threshold');
  expect(options.textContent).toContain('<b>Thin</b>');
  expect(choices(host.querySelector('#solver-look'))).toEqual(['Soft', 'Hard', '<i>Odd</i>']);
  expect(host.querySelector('#solver-threshold').value).toBe('40');
  expect(host.querySelector('#solver-thin').checked).toBe(false);

  const slider = host.querySelector('#solver-threshold');
  slider.dispatchEvent(new Event('pointerdown'));
  for (const value of [50, 60, 70]) await change(slider, String(value), 'input');
  expect(project.charsOf('edit').solverOptions[ref].threshold).toBe(70);
  await change(slider, '75');
  expect(steps()).toBe(2); // the drag, once

  const thin = host.querySelector('#solver-thin');
  thin.click();
  await nextTick();
  expect(steps()).toBe(3);
  await change(host.querySelector('#solver-look'), '2');
  expect(steps()).toBe(4);
  expect(project.charsOf('edit').solverOptions[ref]).toEqual({ threshold: 75, thin: true, look: 2 });
  expect(project.layerParams.get('edit').solverOptions).toEqual({ threshold: 75, thin: true, look: 2 });

  project.undo();
  expect(project.charsOf('edit').solverOptions[ref]).toEqual({ threshold: 75, thin: true, look: 0 });
  project.undo();
  project.undo();
  expect(project.charsOf('edit').solverOptions[ref]).toBeUndefined();
  await nextTick();
  expect(host.querySelector('#solver-threshold').value).toBe('40');
});

test('a color option is a color input that changes as it is picked and commits when it is let go', async () => {
  const { project } = await blank();
  const ref = await onSolver(solver({
    id: 'tinted', name: 'Tinted', options: [
      { id: 'amount', kind: 'slider', name: 'Amount', min: 0, max: 10, step: 1, default: 5 },
      { id: 'tint', kind: 'color', name: 'Tint', default: '#ff8800' },
    ],
  }));
  const host = await mount(ControlPanel);
  await change(host.querySelector('#charChoice'), ref);
  const input = host.querySelector('input[type=color]#solver-tint');
  expect(input.value).toBe('#ff8800');
  expect(input.closest('.field')).not.toBe(null); // beside the slider, in its field
  const version = project.history.version;
  await change(input, '#00ff00', 'input');
  expect(project.charsOf('edit').solverOptions[ref].tint).toBe('#00ff00');
  await change(input, '#00ff00');
  expect(project.history.version - version).toBe(1);
});

test('a missing solver keeps its option and the note says By shape stands in', async () => {
  const { project } = await blank();
  const plugins = usePluginStore();
  const { ref } = await installed();
  project.setLayerChars('edit', { charChoice: ref });
  project.commitLayerChars();
  const host = await mount(ControlPanel);
  const note = () => host.querySelector('fieldset.characters p.note').textContent;
  const select = host.querySelector('#charChoice');
  expect(note()).toBe('Controls how paint or images on Layer 1 convert into characters.');
  expect(host.querySelector('.solver-options')).not.toBe(null);

  plugins.dropScript('phosphor.outlines');
  await nextTick();
  expect(note()).toBe('outlines isn\'t installed. Showing By shape.');
  expect(choices(select)).toEqual(['Random', 'Best match', 'By shape', 'outlines (not here)']);
  expect(select.value).toBe(ref);
  expect(host.querySelector('.solver-options')).toBe(null); // nothing to set while it isn't there

  plugins.useScript('phosphor.outlines', 'h', { solvers: [OUTLINES, LINES] });
  failSolver(ref, 'Out of lines');
  await nextTick();
  expect(note()).toBe('Outlines failed: Out of lines. Showing By shape.');
  plugins.useScript('phosphor.outlines', 'h', { solvers: [OUTLINES, LINES] });
  await plugins.setEnabled('phosphor.outlines', false);
  await nextTick();
  expect(note()).toBe('Midnight is off. Showing By shape.'); // the plugin's name: it's the plugin that's off
  await plugins.setEnabled('phosphor.outlines', true);
  plugins.useScript('phosphor.outlines', 'h', { solvers: [OUTLINES, LINES] });
  plugins.off = true;
  await nextTick();
  expect(note()).toBe('Plugins are off for this visit. Showing By shape.');
  plugins.off = false;
  project.setLayerChars('edit', { charChoiceAscii: ref.replace('/outlines', '/lines') });
  project.renderStyle = 'colorAscii';
  await nextTick();
  expect(note()).toBe('Lines doesn\'t do Color ASCII. Showing By shape.');
});

test('the layer\'s row shows the stand-in warning', async () => {
  const { project, workspace } = await blank();
  workspace.editorTab = 'output';
  const { ref } = await installed();
  project.setLayerChars('edit', { charChoice: ref });
  const host = await mount(LayersList);
  const warning = () => host.querySelector('li[data-id="edit"] .stand-in');
  expect(warning()).toBe(null);
  usePluginStore().dropScript('phosphor.outlines');
  await nextTick();
  expect(warning().textContent).toBe('⚠');
  expect(warning().title).toBe('outlines isn\'t installed. Showing By shape.');
  await expect.element(page.getByRole('img', { name: 'outlines isn\'t installed. Showing By shape.' })).toBeVisible();
  expect(host.querySelector('li[data-id="base"] .stand-in')).toBe(null);
  expect(host.querySelector('li[data-id="edit"] button.pick').textContent.trim()).toBe('Layer 1'); // the name stays the name
});
