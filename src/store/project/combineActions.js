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
