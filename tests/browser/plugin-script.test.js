// A plugin's script in the browser: imported from a blob: address, and the plugin store's slice over the solver registry.
import { afterEach, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { importScript, readSolvers } from '@/plugins/script';
import { failSolver, solverRef } from '@/plugins/solvers';
import { usePluginStore } from '@/store/PluginStore';
import { onSolver } from '../support/pluginSolvers.js';

const DEF = readSolvers({ default: { solvers: [{
  id: 'edges', name: 'Edges', styles: ['ansi'], reach: 1, chars: '/', solve: () => ({ char: '/', fg: 0, bg: 0 }),
}] } })[0];

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

test('useSolvers and dropSolvers change the slice and bump the stamp; a failure lands in problems', async () => {
  setActivePinia(createPinia());
  const plugins = usePluginStore();
  const ref = await onSolver(DEF);
  expect(ref).toBe(solverRef('jane.outlines', 'edges'));
  expect(plugins.solvers[ref]).toMatchObject({ pluginId: 'jane.outlines', name: 'Edges', reach: 1, chars: '/' });
  expect(plugins.pluginState('jane.outlines')).toBe('on');
  expect(plugins.pluginState('nobody')).toBe('absent');
  let stamp = plugins.solverStamp;
  failSolver(ref, 'boom');
  expect(plugins.solverStamp).toBe(stamp + 1);
  expect(plugins.problems['jane.outlines']).toContain('boom');
  stamp = plugins.solverStamp;
  plugins.dropSolvers('jane.outlines');
  expect(plugins.solvers[ref]).toBeUndefined();
  expect(plugins.solverStamp).toBeGreaterThan(stamp);
});
