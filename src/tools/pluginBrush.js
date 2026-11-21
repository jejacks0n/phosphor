import { optionValues } from '@/plugins/solvers.js';
import { t } from '@/i18n/index.js';

// A plugin brush as a tool (tools/index.js's pluginTools makes one for each brush of a plugin that's on). Its looks, keys,
// options and the modes it works in are here; its painting is the plugin's own work, behind begin, move and end (stubs
// until the painting is wired in). The options it declares are kept by ref in workspace.pluginTools, { [optionId]: value },
// and read back through optionValues, so a value that no longer fits (a plugin's update changed a range) is its default.
const decimals = (step) => (String(step).split('.')[1] ?? '').length;

const valuesOf = (workspace, ref, def) => optionValues(def, workspace.pluginTools[ref]);

// One declared option as a toolbar option: the plugin's words for its label, and get and set over the kept values.
function toolOption(ref, def, option) {
  const base = {
    key: option.id,
    label: option.name,
    title: option.name,
    get: (workspace) => valuesOf(workspace, ref, def)[option.id],
    set: (workspace, value) => { workspace.pluginTools[ref] = { ...workspace.pluginTools[ref], [option.id]: value }; },
  };
  if (option.kind === 'slider') return { ...base, min: option.min, max: option.max, step: option.step, decimals: decimals(option.step), size: option.id === def.size };
  if (option.kind === 'checkbox') return { ...base, type: 'checkbox' };
  if (option.kind === 'color') return { ...base, type: 'color' };
  return { ...base, type: 'dropdown', choices: option.choices.map((label, value) => ({ value, label })) };
}

export function makeBrushTool({ ref, pluginName, def, key }) {
  return {
    id: ref,
    get title() { return t('tools.pluginTitle', { name: def.name, plugin: pluginName }); },
    icon: def.icon,
    keys: key ? [key] : [],
    views: ['input', 'output'],
    kind: 'paint',
    section: 'plugin',
    altPicks: true,
    shiftLines: true,
    preview: def.size ? { shape: 'circle', size: (workspace) => valuesOf(workspace, ref, def)[def.size] } : undefined,
    options: def.options.map((option) => toolOption(ref, def, option)),
    // Painting arrives with the stroke; until then a stroke starts and lays nothing.
    begin() { return true; },
    move() {},
    end() {},
  };
}
