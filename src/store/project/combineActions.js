// The project store's actions, merged from groups of methods (one file per area, in this folder). A
// name in two groups is an error: with a plain spread, one would silently replace the other.
export function combineActions(...groups) {
  const actions = {};
  for (const group of groups) {
    for (const name of Object.keys(group)) {
      if (name in actions) throw new Error(`Duplicate store action: ${name}`);
      actions[name] = group[name];
    }
  }
  return actions;
}

// Wraps the named actions so they do nothing while refuse(store) is true. Actions call each other through
// the store, so this holds for a call from another action too.
export function guarded(actions, names, refuse) {
  const wrapped = { ...actions };
  for (const name of names) {
    const action = actions[name];
    if (!action) throw new Error(`No store action to guard: ${name}`);
    wrapped[name] = function (...args) {
      return refuse(this) ? undefined : action.apply(this, args);
    };
  }
  return wrapped;
}
