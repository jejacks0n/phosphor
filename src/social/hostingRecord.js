// What a room's host keeps through a reload, in sessionStorage: it lives through a reload and a crash
// restore and goes with the tab, as the room does. RoomStore says what's in it.
const HOSTING = 'phosphor-hosting';

// True if written; a write that fails (it won't fit) leaves the last good record.
export const keepHostingRecord = (record) => {
  try {
    sessionStorage.setItem(HOSTING, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
};

export const keptHostingRecord = () => {
  try {
    return JSON.parse(sessionStorage.getItem(HOSTING));
  } catch {
    return null;
  }
};

export const forgetHostingRecord = () => {
  try {
    sessionStorage.removeItem(HOSTING);
  } catch { /* no storage: nothing was kept */ }
};
