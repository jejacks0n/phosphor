// The solvers plugins add, held outside Pinia (functions don't belong in reactive state). The plugin store keeps a small
// reactive slice over this (PluginStore.useSolvers); everything that registers or unregisters goes through the store.
const PREFIX = 'plugin:';

export const solverRef = (pluginId, solverId) => `${PREFIX}${pluginId}/${solverId}`;
export const isSolverRef = (value) => typeof value === 'string' && value.startsWith(PREFIX) && value.includes('/');
export const pluginOfSolver = (ref) => (isSolverRef(ref) ? ref.slice(PREFIX.length, ref.lastIndexOf('/')) : null);

const plugins = new Map();   // pluginId -> { hash, defs: Map(solverId -> def) }
const failures = new Map();  // ref -> message
const listeners = new Set();

function clearFailures(pluginId) {
  for (const ref of failures.keys()) if (pluginOfSolver(ref) === pluginId) failures.delete(ref);
}

export function registerSolvers(pluginId, hash, defs) {
  clearFailures(pluginId);
  plugins.set(pluginId, { hash, defs: new Map(defs.map((def) => [def.id, def])) });
}

export function unregisterSolvers(pluginId) {
  clearFailures(pluginId);
  plugins.delete(pluginId);
}

export function solverFor(ref) {
  const pluginId = pluginOfSolver(ref);
  const entry = plugins.get(pluginId);
  const def = entry?.defs.get(ref.slice(ref.lastIndexOf('/') + 1));
  return def ? { def, hash: entry.hash, pluginId } : null;
}

// Every registered solver, [[ref, pluginId, def]], for the store's reactive slice.
export const allSolvers = () => [...plugins].flatMap(([pluginId, { defs }]) =>
  [...defs.values()].map((def) => [solverRef(pluginId, def.id), pluginId, def]));

export function failSolver(ref, message) {
  failures.set(ref, message);
  for (const listener of listeners) listener(ref, message);
}
export const failureOf = (ref) => failures.get(ref) ?? null;
export function onSolverFailure(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Why a layer shows a stand-in for the solver it chose, or null when the solver runs.
export function standInOf({ ref, renderStyle, inRoom, pluginsOff, pluginState }) {
  if (inRoom) return 'room';
  if (pluginsOff) return 'pluginsOff';
  const state = pluginState(pluginOfSolver(ref));
  if (state === 'absent') return 'missing';
  if (state === 'off') return 'off';
  const found = solverFor(ref);
  if (!found) return 'missing';
  if (!found.def.styles.includes(renderStyle)) return 'style';
  return failures.has(ref) ? 'failed' : null;
}

const valid = (option, value) => {
  if (option.kind === 'slider') return typeof value === 'number' && value >= option.min && value <= option.max;
  if (option.kind === 'checkbox') return typeof value === 'boolean';
  return Number.isInteger(value) && value >= 0 && value < option.choices.length;
};
export const optionValues = (def, stored) => Object.fromEntries(def.options.map((option) =>
  [option.id, valid(option, stored?.[option.id]) ? stored[option.id] : option.default]));
