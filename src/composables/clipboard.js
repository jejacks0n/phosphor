import { selectionText } from '@/lib/Cells';

// Copy a selection: the block (cells, paint, base pixels, on the chosen layers) on Phosphor's own
// clipboard, and its characters as plain text on the system clipboard (for a terminal, a chat, a text
// editor). The text is remembered once it's written, so a paste can tell whether the system clipboard
// still holds it or something newer was copied elsewhere. Without clipboard access it stays null, and
// Phosphor's own block keeps winning, as before.
export function copySelection(project, workspace, rect, layers) {
  workspace.clipboard = project.copySelection(rect, layers);
  workspace.clipboardText = null;
  const text = selectionText(project.cells, project.cols, rect);
  navigator.clipboard?.writeText(text).then(() => { workspace.clipboardText = text; }, () => {});
}
