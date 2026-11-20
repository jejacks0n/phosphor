import { encodeFont } from '@/lib/BitmapFont.js';

// The drawing's bitmap font: kept in the settings as base64 (fontBitmap, with its name), so it's saved,
// autosaved and fingerprinted like the rest. Changing it is one undo step; before a drawing, the next one's font.
export const fontActions = {
  // font: a BitmapFont ({ name, height, bytes }) or null for none. The font it already has is no step.
  setDrawingFont(font) {
    const after = font ? { fontBitmap: encodeFont(font), fontName: font.name } : { fontBitmap: '', fontName: '' };
    if (after.fontBitmap === this.fontBitmap && after.fontName === this.fontName) return;
    if (!this.image) return void this.$patch(after); // no drawing yet: the next one's font, with nothing to undo
    const before = { fontBitmap: this.fontBitmap, fontName: this.fontName };
    this.commitPending();
    this.$patch(after);
    const on = (values) => () => { this.$patch(values); this.render(); };
    this.pushEdit({ settingsOnly: true, undo: on(before), redo: on(after) });
    this.render();
  },
};
