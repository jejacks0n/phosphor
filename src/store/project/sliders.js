// The Transforms, Adjustments and Image Filters sliders (and the plugin filters' values) as undo steps: a drag, a run of
// key nudges, a color pick, RESET and RESET ALL are one step each, and so is iCE colors (setIceColors). Owns _sliderBefore (the values before a move)
// and _lastSlider (the step a nudge can extend).
import { SLIDER_KEYS, NUDGE_MS, putSettings } from '@/store/project/shared.js';
import { RESET_GROUPS, groupDefaults, sameSetting } from '@/store/settings.js';

export const sliderActions = {
  // iCE colors (the SAUCE tab's box), one undo step: it changes how the whole drawing shows and exports, so it goes back
  // as a slider does. With no drawing yet it's the next one's, with nothing to undo. In a room only the host does it.
  setIceColors(on) {
    if (this.sauceIceColors === on) return;
    this.sauceIceColors = on;
    if (!this.image) return;
    this.commitPending();
    this.pushEdit({ settingsOnly: true, undo: () => { this.sauceIceColors = !on; }, redo: () => { this.sauceIceColors = on; } });
  },

  // RESET ALL and a group's RESET: one undo step each.
  resetSliders() {
    this._sliderBefore ??= this.sliderValues();
    RESET_GROUPS.forEach(group => putSettings(this, groupDefaults(group)));
    this.commitSliders();
  },

  resetGroup(group) {
    this._sliderBefore ??= this.sliderValues();
    putSettings(this, groupDefaults(group));
    this.commitSliders();
  },

  sliderValues() {
    return Object.fromEntries(SLIDER_KEYS.map(key => [key, this[key]]));
  },

  // A slider moving (a drag, a nudge, a color being picked): the values from before it are noted
  // once, and commitSliders makes the move one undo step when it ends.
  setSlider(key, value) {
    this._sliderBefore ??= this.sliderValues();
    this[key] = value;
  },

  // The move ended: one undo step from the noted values to these, none if nothing changed. A key
  // nudge on the same slider a moment after the last nudge, with nothing else recorded between,
  // extends that step (a drag is always a step of its own).
  commitSliders(key = null, { nudge = false } = {}) {
    const before = this._sliderBefore;
    this._sliderBefore = null;
    if (!before) return;
    const after = this.sliderValues(), last = this._lastSlider;
    if (nudge && last?.key === key && last.version === this.history.version && Date.now() - last.at < NUDGE_MS) {
      last.at = Date.now();
      last.entry.after = after;
      return;
    }
    if (SLIDER_KEYS.every(k => before[k] === after[k] || (typeof before[k] === 'object' && sameSetting(before[k], after[k])))) return; // filterOptions by its JSON
    this.commitPending();
    const entry = { settingsOnly: true, after, undo: () => putSettings(this, before), redo: () => putSettings(this, entry.after) }; // settingsOnly: kept when the grid changes (rendering.js dropEdits)
    this.pushEdit(entry);
    this._lastSlider = nudge ? { key, entry, version: this.history.version, at: Date.now() } : null;
  },
};
