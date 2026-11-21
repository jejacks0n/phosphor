// A plugin's script in the browser: imported from a blob: address, and the plugin store's slice over the solver registry.
import { afterEach, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { importScript, readScript } from '@/plugins/script';
import { failFilter, failSolver, solverRef } from '@/plugins/solvers';
import { usePluginStore } from '@/store/PluginStore';
import { onPlugin, onSolver } from '../support/pluginSolvers.js';

const DEF = readScript({ default: { solvers: [{
  id: 'edges', name: 'Edges', styles: ['ansi'], reach: 1, chars: '/', solve: () => ({ char: '/', fg: 0, bg: 0 }),
}] } }).solvers[0];

afterEach(() => vi.restoreAllMocks());

test('importScript gives the module and revokes its address', async () => {
  const revoke = vi.spyOn(URL, 'revokeObjectURL');
  const make = vi.spyOn(URL, 'createObjectURL');
  const namespace = await importScript('export default { solvers: [] }');
  expect(namespace.default.solvers).toEqual([]);
  expect(make).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledWith(make.mock.results[0].value);
});

test('a script that does not parse is refused as scriptLoad', async () => {
  await expect(importScript('export default {')).rejects.toMatchObject({ code: 'scriptLoad' });
});

test('useScript and dropScript change the slice and bump the stamp; a failure lands in problems', async () => {
  setActivePinia(createPinia());
  const plugins = usePluginStore();
  const ref = await onSolver(DEF);
  expect(ref).toBe(solverRef('phosphor.outlines', 'edges'));
  expect(plugins.solvers[ref]).toMatchObject({ pluginId: 'phosphor.outlines', name: 'Edges', reach: 1, chars: '/' });
  expect(plugins.pluginState('phosphor.outlines')).toBe('on');
  expect(plugins.pluginState('nobody')).toBe('absent');
  let stamp = plugins.solverStamp;
  failSolver(ref, 'boom');
  expect(plugins.solverStamp).toBe(stamp + 1);
  expect(plugins.problems['phosphor.outlines']).toContain('boom');
  stamp = plugins.solverStamp;
  plugins.dropScript('phosphor.outlines');
  expect(plugins.solvers[ref]).toBeUndefined();
  expect(plugins.solverStamp).toBeGreaterThan(stamp);
});

test("useScript fills the brushes, shapes and filters slices in the plugin's order; partsOf counts; a filter failure lands in filterFailures and problems; dropScript empties them", async () => {
  setActivePinia(createPinia());
  const plugins = usePluginStore();
  const icon = '<svg viewBox="0 0 16 16"><path d="M0 0h16v16z"/></svg>';
  const { brushes: [dab, fine], shapes: [star], filters: [glow] } = await onPlugin(readScript({ default: {
    brushes: ['dab', 'fine'].map((id) => ({ id, name: id, icon, move: () => [] })),
    shapes: [{ id: 'star', name: 'Star', icon, outline: () => [] }],
    filters: [{ id: 'glow', name: 'Glow', passes: ['void main(){}'] }],
  } }));
  expect(plugins.brushes[dab]).toMatchObject({ pluginId: 'phosphor.outlines', name: 'dab', index: 0, key: null, size: null });
  expect(plugins.brushes[fine].index).toBe(1);
  expect(plugins.brushes[dab].move).toBeUndefined();
  expect(plugins.shapes[star]).toMatchObject({ name: 'Star', index: 0 });
  expect(plugins.filters[glow]).toMatchObject({ name: 'Glow', index: 0, options: [] });
  expect(plugins.filters[glow].passes).toBeUndefined();
  expect(plugins.partsOf('phosphor.outlines')).toEqual({ solvers: 0, brushes: 2, shapes: 1, filters: 1 });
  failFilter(glow, { log: 'nope' });
  expect(plugins.filterFailures[glow]).toEqual({ log: 'nope' });
  expect(plugins.problems['phosphor.outlines']).toBe("Glow's filter didn't build: nope");
  failFilter(glow, { lost: true });
  expect(plugins.problems['phosphor.outlines']).toContain('lost the graphics card');
  plugins.dropScript('phosphor.outlines');
  expect(plugins.brushes).toEqual({});
  expect(plugins.shapes).toEqual({});
  expect(plugins.filters).toEqual({});
  expect(plugins.filterFailures).toEqual({});
});
