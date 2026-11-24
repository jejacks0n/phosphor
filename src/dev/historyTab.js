// Whether the side panel shows its HISTORY tab (SidePanel.vue): always in development, and in any other build once
// phosphor.history(true) has been run in this browser's console, until phosphor.history(false) is. The log itself is
// kept either way (actionLog.js); this is only the tab. Kept in localStorage, so it's there after a reload.
import { useLocalStorage } from '@vueuse/core';

const asked = useLocalStorage('phosphor.history', false);

export const historyTabShown = () => import.meta.env.DEV || asked.value;

// window.phosphor, which holds only this. Anything but true is off.
export function installHistoryCommand(target = window) {
  target.phosphor = { history: (show) => { asked.value = show === true; } };
}
