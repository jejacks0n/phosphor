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

const dropListeners = new Set();
// A plugin's solvers dropped or replaced (what's kept for them, a shader's program, goes): listener(pluginId).
export function onSolversDropped(listener) {
  dropListeners.add(listener);
  return () => dropListeners.delete(listener);
}
const dropped = (pluginId) => { for (const listener of dropListeners) listener(pluginId); };

export function registerSolvers(pluginId, hash, defs) {
  clearFailures(pluginId);
  if (plugins.has(pluginId)) dropped(pluginId);
  plugins.set(pluginId, { hash, defs: new Map(defs.map((def) => [def.id, def])) });
}

export function unregisterSolvers(pluginId) {
  clearFailures(pluginId);
  plugins.delete(pluginId);
  dropped(pluginId);
}

// The script a plugin's solvers were registered from, or null.
export const registeredHash = (pluginId) => plugins.get(pluginId)?.hash ?? null;

export function solverFor(ref) {
  const pluginId = pluginOfSolver(ref);
  const entry = plugins.get(pluginId);
  const def = entry?.defs.get(ref.slice(ref.lastIndexOf('/') + 1));
  return def ? { def, hash: entry.hash, pluginId } : null;
}

// Every registered solver, [[ref, pluginId, def]], for the store's reactive slice.
export const allSolvers = () => [...plugins].flatMap(([pluginId, { defs }]) =>
  [...defs.values()].map((def) => [solverRef(pluginId, def.id), pluginId, def]));

// A solver's pass threw. hash: the script it was resolved with; a failure from a script since replaced (a Reload while it
// ran) is the old one's, and isn't heard.
export function failSolver(ref, message, hash = solverFor(ref)?.hash) {
  if (hash !== solverFor(ref)?.hash) return;
  failures.set(ref, message);
  for (const listener of listeners) listener(ref, message);
}
export const failureOf = (ref) => failures.get(ref) ?? null;
export function onSolverFailure(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A resolve held some of a solver's results to the set's first character (it returned one it doesn't draw with): told
// once a resolve. hash as failSolver's.
const faultListeners = new Set();
export function faultSolver(ref, hash = solverFor(ref)?.hash) {
  if (hash !== solverFor(ref)?.hash) return;
  for (const listener of faultListeners) listener(ref);
}
export function onSolverFault(listener) {
  faultListeners.add(listener);
  return () => faultListeners.delete(listener);
}

// A solver's shader is off for the visit (the renderer's check): why is { log } (it didn't build), { lost: true } (the
// context was lost while it ran) or { count, total, col, line } (cells that differed from its JavaScript, the first's
// place). hash as failSolver's.
const shaderListeners = new Set();
export function offShader(ref, why, hash = solverFor(ref)?.hash) {
  if (hash !== solverFor(ref)?.hash) return;
  for (const listener of shaderListeners) listener(ref, why);
}
export function onShaderOff(listener) {
  shaderListeners.add(listener);
  return () => shaderListeners.delete(listener);
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

const HEX = /^#[0-9a-f]{6}$/;
const valid = (option, value) => {
  if (option.kind === 'slider') return typeof value === 'number' && value >= option.min && value <= option.max;
  if (option.kind === 'checkbox') return typeof value === 'boolean';
  if (option.kind === 'color') return typeof value === 'string' && HEX.test(value);
  return Number.isInteger(value) && value >= 0 && value < option.choices.length;
};
export const optionValues = (def, stored) => Object.fromEntries(def.options.map((option) =>
  [option.id, valid(option, stored?.[option.id]) ? stored[option.id] : option.default]));

// A solver's option values as its JavaScript gets them (by id, frozen): a color's '#rrggbb' as { r, g, b } (0..255),
// every other value as it is. The raw values stay what's stored, compared and sent to a shader.
export const scriptOptions = (def, values) => Object.freeze(Object.fromEntries(Object.entries(values).map(([id, value]) => {
  const color = def.options.find((option) => option.id === id)?.kind === 'color' && HEX.test(value);
  return [id, color ? Object.freeze({ r: parseInt(value.slice(1, 3), 16), g: parseInt(value.slice(3, 5), 16), b: parseInt(value.slice(5), 16) }) : value];
})));
