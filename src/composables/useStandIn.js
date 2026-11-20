import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { usePluginStore } from '@/store/PluginStore';
import { failureOf, pluginOfSolver } from '@/plugins/solvers';

// A plugin solver's name as shown: its own while it's registered, else the solver id its ref ends with (a plugin that
// isn't installed has no name to give).
export const solverName = (plugins, ref) => plugins.solvers[ref]?.name ?? ref.slice(ref.lastIndexOf('/') + 1);

// Why a layer shows By shape in place of the plugin solver it chose (its params' standIn), in words, or null: the
// Characters section's note and the layer's row say it. "Off" names the plugin, the thing switched off in its dialog.
export function useStandIn() {
  const project = useProjectStore(), plugins = usePluginStore(), { t } = useI18n();
  return (id) => {
    const { standIn, wantedSolver: ref } = project.layerParams.get(id) ?? project.processParams;
    if (!standIn) return null;
    const plugin = standIn === 'off' && plugins.plugins.find((record) => record.id === pluginOfSolver(ref));
    return t(`panel.solver.standIn.${standIn}`, {
      name: plugin ? plugin.manifest.name : solverName(plugins, ref),
      style: t(`panel.renderStyle.${project.renderStyle}`),
      message: failureOf(ref),
    });
  };
}
