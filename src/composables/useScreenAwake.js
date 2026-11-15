import { watch } from 'vue';
import { useWakeLock } from '@vueuse/core';
import { useRoomStore } from '@/store/RoomStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

// The screen stays on while you're in a room (hosting it, or watching or drawing in someone's) or an animation plays,
// where the browser can keep it on (Screen Wake Lock). The browser lets go while the page is hidden; useWakeLock asks
// again when it shows. A browser that refuses (a phone saving its battery, say) leaves the screen to sleep as usual.
export function useScreenAwake() {
  const room = useRoomStore(), workspace = useWorkspaceStore();
  const { isSupported, request, release } = useWakeLock();
  if (!isSupported.value) return;
  watch(() => !!room.role || workspace.playing, (awake) => {
    (awake ? request('screen') : release()).catch((error) => console.warn('Could not keep the screen on', error));
  }, { immediate: true });
}
