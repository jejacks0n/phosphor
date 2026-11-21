// A plugin "on" with the parts given, for tests: a theme-only manifest installed, then its script's parts registered.
import midnight from '../../plugins/midnight/phosphor-plugin.json';
import { readManifest } from '@/plugins/manifest';
import { usePluginStore } from '@/store/PluginStore';
import { solverRef } from '@/plugins/solvers';

export async function onPlugin(parts, { pluginId = 'phosphor.outlines', hash = 'h' } = {}) {
  const plugins = usePluginStore();
  await plugins.install(readManifest(JSON.stringify({ ...midnight, id: pluginId })));
  plugins.useScript(pluginId, hash, parts);
  return Object.fromEntries(Object.entries(parts).map(([kind, defs]) => [kind, defs.map((def) => solverRef(pluginId, def.id))]));
}

export async function onSolver(def, opts) {
  return (await onPlugin({ solvers: [def] }, opts)).solvers[0];
}
