// A plugin filter's values as a drawing keeps them (the filterOptions setting: { [ref]: { name, values: { [optionId]: value } } }),
// and the settings column's groups made from them and the filters installed. A filter runs only while one of its options is
// off its default, so only those are kept, with the filter's name, which a drawing whose filter isn't there shows it by.
import { isSolverRef, optionValues, pluginOfSolver, solverRef } from './solvers.js';
import { ID, OPTION_ID } from './script.js';
import { goodPluginId } from './manifest.js';

const MOST_ENTRIES = 64, MOST_VALUES = 12, MOST_NAME = 40;
const HEX = /^#[0-9a-f]{6}$/;
// A ref as solverRef makes one from ids the readers take (which bounds its length): a stranger's key that isn't is dropped.
const goodRef = (ref) => {
  if (!isSolverRef(ref)) return false;
  const pluginId = pluginOfSolver(ref), id = ref.slice(ref.lastIndexOf('/') + 1);
  return goodPluginId(pluginId) && ID.test(id) && ref === solverRef(pluginId, id);
};
const plain = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const goodValue = (value) => typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && HEX.test(value));

// A filter's entry for values (every option's, as its options give them): only those off their defaults, or null when
// none are (the filter's off).
export function filterEntry(def, name, values) {
  const changed = def.options.filter((option) => option.id in values && values[option.id] !== option.default).map((option) => [option.id, values[option.id]]);
  return changed.length ? { name, values: Object.fromEntries(changed) } : null;
}

// A stranger's filterOptions (a file's, a host's) as one a drawing can hold: an entry kept whole only when its key is a ref
// of the shape solverRef makes (plugin:<pluginId>/<id>, each as its reader allows),
// its name text of at most 40 characters (counted as a script's are), and its values at most 12 option ids each a finite
// number, a boolean or a lowercase '#rrggbb'; at most 64 entries. Anything else is dropped, and what isn't an object is none.
export function cleanFilterOptions(raw) {
  const kept = {};
  if (!plain(raw)) return kept;
  for (const [ref, entry] of Object.entries(raw)) {
    if (Object.keys(kept).length >= MOST_ENTRIES) break;
    if (!goodRef(ref) || !plain(entry) || typeof entry.name !== 'string' || [...entry.name].length > MOST_NAME || !plain(entry.values)) continue;
    const values = Object.entries(entry.values);
    if (values.length > MOST_VALUES || !values.every(([id, value]) => OPTION_ID.test(id) && goodValue(value))) continue;
    kept[ref] = { name: entry.name, values: Object.fromEntries(values) };
  }
  return kept;
}

// A group's state: 'on' (it runs), 'idle' (installed, at its defaults), 'missing' (not installed), 'off' (its plugin
// switched off), 'pluginsOff' (?plugins=off) or 'failed' (its shader didn't build, or lost the context).
function stateOf(ref, def, values, { pluginState, pluginsOff, failures }) {
  if (pluginsOff) return 'pluginsOff';
  const plugin = pluginState(pluginOfSolver(ref));
  if (plugin === 'off') return 'off';
  if (!def || plugin === 'absent') return 'missing';
  if (failures[ref]) return 'failed';
  return def.options.some((option) => values[option.id] !== option.default) ? 'on' : 'idle';
}

// The settings column's groups, in run order: the filters installed (installed: [{ ref, pluginId, hash, def }], in their
// order), then the drawing's saved ones that aren't, by name, with no def. Each { ref, pluginId, hash, name, def, values,
// state }: values every option's (its saved value where that's good, else its default), or with no def what was saved.
export function filterGroups({ saved, installed, pluginState, pluginsOff, failures }) {
  const context = { pluginState, pluginsOff, failures };
  const here = installed.map(({ ref, pluginId, hash, def }) => {
    const values = optionValues(def, saved[ref]?.values);
    return { ref, pluginId, hash, name: def.name, def, values, state: stateOf(ref, def, values, context) };
  });
  const away = Object.entries(saved).filter(([ref]) => !installed.some((each) => each.ref === ref))
    .map(([ref, { name, values }]) => ({ ref, pluginId: pluginOfSolver(ref), hash: null, name, def: null, values, state: stateOf(ref, null, values, context) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...here, ...away];
}

// The groups that run, as the pipeline takes them (WebGLProcessor's params.pluginFilters).
export const runningFilters = (groups) => groups.filter(({ state }) => state === 'on')
  .map(({ ref, pluginId, hash, def, values }) => ({ ref, pluginId, hash, passes: def.passes, options: def.options, values }));
