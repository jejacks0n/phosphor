import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useMediaQuery } from '@vueuse/core';

// The glowing marker on a tab list's picked tab (EditTabs, SidePanel): style, for an absolutely placed element in the
// list. It slides to the tab picked; with none before (nothing was open), it grows out of the middle of the one it
// lands on instead of sliding in from wherever it last was. list: the tab list's template ref; picked: the selector of
// its picked tab. It's placed again on a resize; update() places it after anything else moves the tabs.
const APPEAR = 'width 0.3s cubic-bezier(0.23, 1, 0.32, 1), transform 0.3s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.15s ease';
export function useTabIndicator(list, picked) {
  const style = ref({ transform: 'translateX(0px)', width: '0px', opacity: 0 });
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  function update() {
    requestAnimationFrame(() => {
      const tab = list.value?.querySelector(picked);
      if (!tab) {
        style.value = { ...style.value, opacity: 0 };
        return;
      }
      const listRect = list.value.getBoundingClientRect(), tabRect = tab.getBoundingClientRect();
      const left = Math.round(tabRect.left - listRect.left), width = Math.round(tabRect.width);
      const placed = { transform: `translateX(${left}px)`, width: `${width}px`, opacity: 1 };
      if (style.value.opacity || reducedMotion.value) {
        style.value = placed;
        return;
      }
      style.value = { transform: `translateX(${left + width / 2}px)`, width: '0px', opacity: 0, transition: 'none' };
      requestAnimationFrame(() => { style.value = { ...placed, transition: APPEAR }; });
    });
  }
  onMounted(() => {
    window.addEventListener('resize', update);
    setTimeout(update, 100);
  });
  onBeforeUnmount(() => window.removeEventListener('resize', update));
  return { style, update };
}
