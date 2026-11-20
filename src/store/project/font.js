import { encodeBlocks, encodeFont } from '@/lib/BitmapFont.js';
import { notSetUp } from '@/lib/fontSetup.js';
import { toast } from '@/composables/useToast.js';

// The drawing's bitmap font: kept in the settings as base64 (fontBitmap, with its name and blocks), so it's saved,
// autosaved and fingerprinted like the rest. Changing it is one undo step; before a drawing, the next one's font. In a
// room it can't change to a font that isn't set up (fontNotSetUp).
export const fontActions = {
  // font: a BitmapFont ({ name, height, bytes }) or null for none. The font it already has is no step.
  setDrawingFont(font) {
    const after = font
      ? { fontBitmap: encodeFont(font), fontName: font.name, fontBlocks: font.blocks ? encodeBlocks(font.blocks) : '' }
      : { fontBitmap: '', fontName: '', fontBlocks: '' };
    if (Object.keys(after).every((key) => after[key] === this[key])) return;
    const reason = this.inRoom && notSetUp(font); // a room can't edit blocks, so it takes no font that needs it (undo and redo patch on their own)
    if (reason) return void toast(reason);
    if (!this.image) return void this.$patch(after); // no drawing yet: the next one's font, with nothing to undo
    const before = { fontBitmap: this.fontBitmap, fontName: this.fontName, fontBlocks: this.fontBlocks };
    this.commitPending();
    this.$patch(after);
    const on = (values) => () => { this.$patch(values); this.render(); };
    this.pushEdit({ settingsOnly: true, undo: on(before), redo: on(after) });
    this.render();
  },
};
