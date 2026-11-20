// A plugin "on" with one solver, for tests: a theme-only manifest installed, then its solvers registered.
import midnight from '../../plugins/midnight/phosphor-plugin.json';
import { readManifest } from '@/plugins/manifest';
import { usePluginStore } from '@/store/PluginStore';
import { solverRef } from '@/plugins/solvers';

export async function onSolver(def, { pluginId = 'phosphor.outlines', hash = 'h' } = {}) {
  const plugins = usePluginStore();
  await plugins.install(readManifest(JSON.stringify({ ...midnight, id: pluginId })));
  plugins.useSolvers(pluginId, hash, [def]);
  return solverRef(pluginId, def.id);
}
