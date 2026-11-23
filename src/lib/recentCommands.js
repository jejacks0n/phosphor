// The commands most recently run from the command list, newest first, kept in this browser. Storage can be missing,
// blocked or hold anything, so each access is guarded and anything that isn't a list of ids reads as none.
const KEY = 'phosphor.recentCommands', MOST = 8;

function read() {
  try {
    const ids = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function add(id) {
  try {
    localStorage.setItem(KEY, JSON.stringify([id, ...read().filter((each) => each !== id)].slice(0, MOST)));
  } catch { /* storage blocked: nothing kept */ }
}

export const recentCommands = { read, add };
