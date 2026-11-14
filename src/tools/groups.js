// Tools that share one toolbar slot (EditToolbar): the slot shows the one last chosen (the first until then), and a
// press on its corner, a long press or a right-click opens the rest. Each keeps its own key. Its own module, with no
// imports, so the workspace store can read it without importing the tools.
export const TOOL_GROUPS = [
  { id: 'fill', tools: ['bucket', 'gradient'] },
  { id: 'retouch', tools: ['blur', 'dodge', 'burn'] },
  { id: 'select', tools: ['select', 'wand'] },
  { id: 'navigate', tools: ['hand', 'zoom'] },
  { id: 'vselect', tools: ['vselect', 'vnode'] },
];

export const groupOf = (id) => TOOL_GROUPS.find((group) => group.tools.includes(id)) ?? null;
