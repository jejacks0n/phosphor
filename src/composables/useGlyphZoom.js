import { ref } from 'vue';
import { useEventListener } from '@vueuse/core';

// A glyph shown large over its cell (GlyphZoom), for a closer look: the Fonts page's slots and the Palettes page's
// sources. `show` puts it up (again on the same cell puts it away); a long press (`press`, ended by `release`) shows it
// whatever a click on the cell does, and the click that ends that press lands nowhere (`pressedLong`). A press
// elsewhere than on one of `cells` (a selector) or the glyph, a scroll or a resize puts it away.
export function useGlyphZoom(cells) {
  const zoom = ref(null); // { n, char, family, size, cell }
  const close = () => { zoom.value = null; };
  // height: the font's, so the glyph is about 96px, a whole number of times its size.
  const show = (event, n, char, family, height) => {
    if (zoom.value?.n === n) return close();
    const size = height * Math.max(2, Math.round(96 / height));
    zoom.value = { n, char: char === '␀' ? ' ' : char, family, size, cell: event.currentTarget.getBoundingClientRect() };
  };
  let timer = 0, long = false;
  const press = (event, open) => {
    clearTimeout(timer);
    long = false;
    const target = event.currentTarget;
    timer = setTimeout(() => {
      long = true;
      open({ currentTarget: target });
    }, 500);
  };
  const release = () => clearTimeout(timer);
  const pressedLong = (n) => long && zoom.value?.n === n;
  useEventListener(document, 'pointerdown', (e) => { if (zoom.value && !e.target.closest?.(`${cells}, .glyph-zoom`)) close(); }, true);
  useEventListener(window, 'scroll', close, { capture: true, passive: true });
  useEventListener(window, 'resize', close);
  return { zoom, show, close, press, release, pressedLong };
}
