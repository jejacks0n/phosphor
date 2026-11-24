import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { usePluginStore } from '@/store/PluginStore';
import { failureOf, pluginOfSolver } from '@/plugins/solvers';

// A plugin solver's name as shown: its own while it's registered, else the one the drawing kept when a layer chose it
// (project.solverNames), else the solver id its ref ends with (a drawing that kept none, from before names were kept).
export const solverName = (plugins, project, ref) => plugins.solvers[ref]?.name ?? project.solverNames[ref]?.name ?? ref.slice(ref.lastIndexOf('/') + 1);
// Its plugin's name as shown: the installed plugin's, else the one the drawing kept, else the solver's name.
const pluginName = (plugins, project, ref) => plugins.plugins.find((record) => record.id === pluginOfSolver(ref))?.manifest.name
  ?? project.solverNames[ref]?.plugin ?? solverName(plugins, project, ref);

// Why a layer shows By shape in place of the plugin solver it chose (its params' standIn), in words, or null: the
// Characters section's note and the layer's row say it. "Off" and "missing" name the plugin, the thing to switch on in
// its dialog or to install; the rest name the solver.
export function useStandIn() {
  const project = useProjectStore(), plugins = usePluginStore(), { t } = useI18n();
  return (id) => {
    const { standIn, wantedSolver: ref } = project.layerParams.get(id) ?? project.processParams;
    if (!standIn) return null;
    return t(`panel.solver.standIn.${standIn}`, {
      name: standIn === 'off' || standIn === 'missing' ? pluginName(plugins, project, ref) : solverName(plugins, project, ref),
      style: t(`panel.renderStyle.${project.renderStyle}`),
      message: failureOf(ref),
    });
  };
}
